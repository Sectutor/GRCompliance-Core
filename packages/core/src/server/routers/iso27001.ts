import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { clientControls, controls } from "../../schema";
import * as db from "../../db";
import { eq, and } from "drizzle-orm";
import { ANNEX_A_CONTROLS } from "../../data/annexACatalog";
import { soaAdoptionPatch } from "../../lib/soaListing";
import { ensureAnnexACatalog } from "../ensureAnnexACatalog";
import { loadAnnexAStatement } from "../soaData";

export const createIso27001Router = (t: any, clientProcedure: any, clientEditorProcedure: any) => {
    return t.router({
        getSoA: clientProcedure
            .input(z.object({ clientId: z.number() }))
            .query(async ({ input }: any) => loadAnnexAStatement(input.clientId)),

        adoptSoA: clientEditorProcedure
            .input(z.object({
                clientId: z.number(),
                controlRef: z.string(),
                applicability: z.enum(["applicable", "not_applicable"]),
                justification: z.string().max(8000).optional(),
                status: z.enum(["not_implemented", "in_progress", "implemented", "not_applicable"]).optional(),
                implementationNotes: z.string().max(8000).optional(),
            }))
            .mutation(async ({ input }: any) => {
                const decision = soaAdoptionPatch(input);
                if ("error" in decision) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: decision.error });
                }
                if (!ANNEX_A_CONTROLS.some((control) => control.controlId === input.controlRef)) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown Annex A control" });
                }

                await ensureAnnexACatalog();
                const dbConn = await db.getDb();
                const [master] = await dbConn.select({ id: controls.id })
                    .from(controls)
                    .where(eq(controls.controlId, input.controlRef))
                    .limit(1);
                if (!master) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "Annex A control is not in the catalog yet" });
                }

                const [existing] = await dbConn.select({ id: clientControls.id })
                    .from(clientControls)
                    .where(and(
                        eq(clientControls.clientId, input.clientId),
                        eq(clientControls.controlId, master.id),
                    ))
                    .limit(1);

                if (existing) {
                    await dbConn.update(clientControls)
                        .set({
                            applicability: decision.applicability,
                            status: decision.status,
                            justification: decision.justification,
                            implementationNotes: input.implementationNotes,
                            updatedAt: new Date(),
                        })
                        .where(and(
                            eq(clientControls.id, existing.id),
                            eq(clientControls.clientId, input.clientId),
                        ));
                    return { success: true, clientControlId: existing.id };
                }

                const [created] = await dbConn.insert(clientControls).values({
                    clientId: input.clientId,
                    controlId: master.id,
                    clientControlId: input.controlRef,
                    applicability: decision.applicability,
                    status: decision.status,
                    justification: decision.justification,
                    implementationNotes: input.implementationNotes,
                }).returning({ id: clientControls.id });

                return { success: true, clientControlId: created.id };
            }),

        updateSoA: clientEditorProcedure
            .input(z.object({
                clientId: z.number(),
                controlId: z.number(), // This is the clientControl.id
                applicability: z.enum(["applicable", "not_applicable"]),
                justification: z.string().optional(),
                status: z.enum(["not_implemented", "in_progress", "implemented", "not_applicable"]),
                implementationNotes: z.string().optional()
            }))
            .mutation(async ({ input }: any) => {
                console.log(`[ISO27001] Updating control ${input.controlId} for client ${input.clientId}`);
                try {
                    const dbConn = await db.getDb();

                    // Security check: ensure this client control belongs to the client
                    const [existing] = await dbConn.select().from(clientControls)
                        .where(and(
                            eq(clientControls.id, input.controlId),
                            eq(clientControls.clientId, input.clientId)
                        ))
                        .limit(1);

                    if (!existing) {
                        console.error(`[ISO27001] Control ${input.controlId} not found or denied for client ${input.clientId}`);
                        throw new TRPCError({ code: "FORBIDDEN", message: "Control not found or access denied" });
                    }

                    await dbConn.update(clientControls)
                        .set({
                            applicability: input.applicability,
                            justification: input.justification,
                            status: input.status,
                            implementationNotes: input.implementationNotes,
                            updatedAt: new Date()
                        })
                        .where(eq(clientControls.id, input.controlId));

                    console.log(`[ISO27001] Update successful`);
                    return { success: true };
                } catch (err: any) {
                    console.error(`[ISO27001] Update failed:`, err);
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
                }
            })
    });
};
