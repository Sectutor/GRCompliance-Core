import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { clientControls, controls, riskScenarios } from "../../schema";
import { planSpreadsheetImport, rowsToSave, type PlannedRow, type SpreadsheetKind } from "../../lib/spreadsheetImport";

const MAX_ROWS = 5000;
const PREVIEW_LIMIT = 80;

const rowSchema = z.record(z.union([z.string(), z.number(), z.null(), z.undefined()]));

const inputSchema = z.object({
    clientId: z.number().int().positive(),
    kind: z.enum(["controls", "risks"]),
    rows: z.array(rowSchema).max(MAX_ROWS),
});

async function existingKeys(clientId: number, kind: SpreadsheetKind): Promise<string[]> {
    const db = await getDb();
    if (kind === "controls") {
        const found = await db.select({ controlId: controls.controlId })
            .from(controls)
            .where(eq(controls.clientId, clientId));
        return found.map((row: { controlId: string }) => row.controlId);
    }
    const found = await db.select({ title: riskScenarios.title })
        .from(riskScenarios)
        .where(eq(riskScenarios.clientId, clientId));
    return found.map((row: { title: string }) => row.title);
}

function present(plan: ReturnType<typeof planSpreadsheetImport>) {
    const detailed = plan.rows.filter((row) => row.errors.length > 0 || row.warnings.length > 0);
    const shown = (detailed.length > 0 ? detailed : plan.rows).slice(0, PREVIEW_LIMIT);
    return {
        summary: plan.summary,
        rows: shown,
        truncated: plan.rows.length > shown.length && detailed.length > PREVIEW_LIMIT,
    };
}

async function saveRows(clientId: number, kind: SpreadsheetKind, rows: PlannedRow[]) {
    const db = await getDb();
    await db.transaction(async (tx: any) => {
        for (const row of rows) {
            if (kind === "controls") {
                const code = String(row.values.controlCode || "");
                const title = String(row.values.title || code);
                const existing = await tx.select({ id: controls.id })
                    .from(controls)
                    .where(and(eq(controls.clientId, clientId), eq(controls.controlId, code)))
                    .limit(1);
                const controlValues = {
                    clientId,
                    controlId: code,
                    name: title,
                    description: row.values.description ? String(row.values.description) : null,
                    grouping: row.values.grouping ? String(row.values.grouping) : null,
                    owner: row.values.owner ? String(row.values.owner) : null,
                    framework: "Imported",
                    updatedAt: new Date(),
                };
                let controlRowId = existing[0]?.id;
                if (controlRowId) {
                    await tx.update(controls).set(controlValues).where(eq(controls.id, controlRowId));
                } else {
                    const inserted = await tx.insert(controls).values(controlValues).returning({ id: controls.id });
                    controlRowId = inserted[0]?.id;
                }
                if (!controlRowId) continue;
                const linked = await tx.select({ id: clientControls.id })
                    .from(clientControls)
                    .where(and(eq(clientControls.clientId, clientId), eq(clientControls.controlId, controlRowId)))
                    .limit(1);
                const due = row.values.dueDate ? new Date(`${row.values.dueDate}T00:00:00.000Z`) : null;
                const linkValues = {
                    owner: row.values.owner ? String(row.values.owner) : null,
                    dueDate: due,
                    updatedAt: new Date(),
                };
                if (linked[0]) {
                    await tx.update(clientControls).set(linkValues).where(eq(clientControls.id, linked[0].id));
                } else {
                    await tx.insert(clientControls).values({
                        clientId,
                        controlId: controlRowId,
                        clientControlId: code.slice(0, 50),
                        status: "not_implemented",
                        ...linkValues,
                    });
                }
                continue;
            }

            const title = String(row.values.title || "");
            const existing = await tx.select({ id: riskScenarios.id })
                .from(riskScenarios)
                .where(and(eq(riskScenarios.clientId, clientId), eq(riskScenarios.title, title)))
                .limit(1);
            const riskValues = {
                clientId,
                title,
                description: row.values.description ? String(row.values.description) : null,
                likelihood: typeof row.values.likelihood === "number" ? row.values.likelihood : 1,
                impact: typeof row.values.impact === "number" ? row.values.impact : 1,
                status: String(row.values.status || "identified"),
                owner: row.values.owner ? String(row.values.owner) : null,
                assessmentType: "scenario",
                updatedAt: new Date(),
            };
            if (existing[0]) {
                await tx.update(riskScenarios).set(riskValues).where(eq(riskScenarios.id, existing[0].id));
            } else {
                await tx.insert(riskScenarios).values(riskValues);
            }
        }
    });
}

export const createSpreadsheetImportRouter = (t: any, clientEditorProcedure: any) => {
    return t.router({
        preview: clientEditorProcedure
            .input(inputSchema)
            .mutation(async ({ input }: { input: z.infer<typeof inputSchema> }) => {
                const keys = await existingKeys(input.clientId, input.kind);
                const plan = planSpreadsheetImport({ kind: input.kind, rows: input.rows, existingKeys: keys });
                return present(plan);
            }),

        commit: clientEditorProcedure
            .input(inputSchema)
            .mutation(async ({ input }: { input: z.infer<typeof inputSchema> }) => {
                const keys = await existingKeys(input.clientId, input.kind);
                const plan = planSpreadsheetImport({ kind: input.kind, rows: input.rows, existingKeys: keys });
                const saving = rowsToSave(plan);
                try {
                    await saveRows(input.clientId, input.kind, saving);
                } catch (error) {
                    console.error("Spreadsheet import failed", error instanceof Error ? error.name : "error");
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "We could not save the import. Nothing was written.",
                    });
                }
                return {
                    saved: saving.length,
                    skipped: plan.summary.skipped,
                    summary: plan.summary,
                };
            }),
    });
};
