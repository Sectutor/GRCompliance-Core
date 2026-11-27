import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { clientControls, clientPolicies, controls, evidence } from "../../schema";
import { buildNextSteps } from "../../lib/nextSteps";

export const createNextStepsRouter = (t: any, clientProcedure: any) => {
    return t.router({
        list: clientProcedure
            .input(z.object({ clientId: z.number().int().positive() }))
            .query(async ({ input }: { input: { clientId: number } }) => {
                const db = await getDb();
                const controlRows = await db.select({
                    id: clientControls.id,
                    owner: clientControls.owner,
                    dueDate: clientControls.dueDate,
                    code: controls.controlId,
                    title: controls.name,
                    framework: controls.framework,
                })
                    .from(clientControls)
                    .innerJoin(controls, eq(controls.id, clientControls.controlId))
                    .where(eq(clientControls.clientId, input.clientId));

                const evidenceRows = await db.select({ clientControlId: evidence.clientControlId })
                    .from(evidence)
                    .where(eq(evidence.clientId, input.clientId));
                const evidenceCounts = new Map<number, number>();
                for (const row of evidenceRows) {
                    evidenceCounts.set(row.clientControlId, (evidenceCounts.get(row.clientControlId) || 0) + 1);
                }

                const policyRows = await db.select({
                    id: clientPolicies.id,
                    title: clientPolicies.name,
                    reviewDueDate: clientPolicies.reviewDueDate,
                })
                    .from(clientPolicies)
                    .where(eq(clientPolicies.clientId, input.clientId));

                const frameworks = controlRows.map((row: { framework?: string | null }) => row.framework || "").filter(Boolean);
                return buildNextSteps({
                    clientId: input.clientId,
                    now: new Date().toISOString(),
                    frameworks,
                    controls: controlRows.map((row: { id: number; code?: string | null; title?: string | null; owner?: string | null; dueDate?: Date | null }) => ({
                        id: row.id,
                        code: row.code || "",
                        title: row.title || "",
                        owner: row.owner ?? null,
                        dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
                        evidenceCount: evidenceCounts.get(row.id) || 0,
                    })),
                    policies: policyRows.map((row: { id: number; title?: string | null; reviewDueDate?: Date | null }) => ({
                        id: row.id,
                        title: row.title || "Policy",
                        reviewDueDate: row.reviewDueDate ? new Date(row.reviewDueDate).toISOString() : null,
                    })),
                });
            }),
    });
};
