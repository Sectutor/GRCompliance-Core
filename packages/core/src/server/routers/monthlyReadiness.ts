import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { generateMonthlyReadiness } from "../../lib/readiness/store";
import { pdfBytesToBase64 } from "../../lib/readiness/pdf";
import { resolveTruthFilePath } from "../../lib/readiness/truthPath";
import { monthlyReadinessReports, monthlyReadinessSettings } from "../../schema";

const settingsInput = z.object({
  clientId: z.number(),
  enabled: z.boolean(),
  dayOfMonth: z.number().int().min(1).max(28),
  truthFilePath: z.string().max(500).nullable().optional(),
});

/**
 * Monthly readiness drafts.
 * Every procedure takes clientId. Reads and writes also filter the row by that client id,
 * so a report id from another workspace is not returned.
 * This router does not send email.
 */
export const createMonthlyReadinessRouter = (t: any, clientProcedure: any, clientEditorProcedure: any) => {
  return t.router({
    getSettings: clientProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }: { input: { clientId: number } }) => {
        const db = await getDb();
        const [row] = await db.select({
          enabled: monthlyReadinessSettings.enabled,
          dayOfMonth: monthlyReadinessSettings.dayOfMonth,
          truthFilePath: monthlyReadinessSettings.truthFilePath,
        }).from(monthlyReadinessSettings).where(eq(monthlyReadinessSettings.clientId, input.clientId)).limit(1);
        return row ?? { enabled: false, dayOfMonth: 1, truthFilePath: null };
      }),

    setSettings: clientEditorProcedure
      .input(settingsInput)
      .mutation(async ({ input }: { input: z.infer<typeof settingsInput> }) => {
        const configured = input.truthFilePath?.trim() ?? "";
        if (configured && !resolveTruthFilePath(configured)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Truth file path must stay inside truth-files/.",
          });
        }
        const db = await getDb();
        const truthFilePath = configured || null;
        await db.insert(monthlyReadinessSettings).values({
          clientId: input.clientId,
          enabled: input.enabled,
          dayOfMonth: input.dayOfMonth,
          truthFilePath,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: monthlyReadinessSettings.clientId,
          set: {
            enabled: input.enabled,
            dayOfMonth: input.dayOfMonth,
            truthFilePath,
            updatedAt: new Date(),
          },
        });
        return { enabled: input.enabled, dayOfMonth: input.dayOfMonth, truthFilePath };
      }),

    list: clientProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }: { input: { clientId: number } }) => {
        const db = await getDb();
        return db.select({
          id: monthlyReadinessReports.id,
          periodStart: monthlyReadinessReports.periodStart,
          periodEnd: monthlyReadinessReports.periodEnd,
          generatedAt: monthlyReadinessReports.generatedAt,
          status: monthlyReadinessReports.status,
          filename: monthlyReadinessReports.filename,
        }).from(monthlyReadinessReports)
          .where(eq(monthlyReadinessReports.clientId, input.clientId))
          .orderBy(desc(monthlyReadinessReports.generatedAt));
      }),

    download: clientProcedure
      .input(z.object({ clientId: z.number(), reportId: z.number() }))
      .query(async ({ input }: { input: { clientId: number; reportId: number } }) => {
        const db = await getDb();
        const [row] = await db.select({
          filename: monthlyReadinessReports.filename,
          pdf: monthlyReadinessReports.pdf,
        }).from(monthlyReadinessReports).where(and(
          eq(monthlyReadinessReports.id, input.reportId),
          eq(monthlyReadinessReports.clientId, input.clientId),
        )).limit(1);
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
        }
        try {
          return { filename: row.filename, pdfBase64: pdfBytesToBase64(row.pdf) };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored PDF could not be read" });
        }
      }),

    generateNow: clientEditorProcedure
      .input(z.object({ clientId: z.number() }))
      .mutation(async ({ input }: { input: { clientId: number } }) => {
        try {
          return await generateMonthlyReadiness(input.clientId, { mode: "manual" });
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Could not generate the readiness report",
          });
        }
      }),
  });
};
