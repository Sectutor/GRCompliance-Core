import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { clients, monthlyReadinessReports, monthlyReadinessSettings } from "../../schema";
import { validateTruthFileAtPath } from "../truthFile/validate";
import type { TruthFile } from "../truthFile/types";
import { collectReadinessWorkspace } from "./collect";
import { buildReadinessReport } from "./model";
import { renderReadinessPdf } from "./pdf";
import { reportingPeriod } from "./period";
import { defaultTruthFileForClient, resolveTruthFilePath } from "./truthPath";

export interface StoredReadinessReport {
  id: number;
  filename: string;
  periodStart: string;
  periodEnd: string;
  status: string;
}

function loadTruth(clientName: string, configured: string | null): { truth: TruthFile | null; note: string | null } {
  const configuredPath = configured ? resolveTruthFilePath(configured) : null;
  if (configured && !configuredPath) {
    return { truth: null, note: "The configured truth-file path is outside truth-files/ and was ignored." };
  }
  const filePath = configuredPath ?? defaultTruthFileForClient(clientName);
  if (!filePath || !fs.existsSync(filePath)) return { truth: null, note: null };
  const result = validateTruthFileAtPath(filePath);
  if (!result.ok || !result.document) {
    const detail = result.errors.slice(0, 5).map((error) => `${error.path}: ${error.message}`).join("; ");
    return { truth: null, note: `Truth file failed validation and was not quoted. ${detail}` };
  }
  return { truth: result.document, note: null };
}

/**
 * Build a draft PDF from the workspace and store it.
 * Scheduled runs leave an existing draft untouched. Manual runs replace the draft for the same period.
 * This function does not send email.
 */
export async function generateMonthlyReadiness(
  clientId: number,
  options: { asOf?: Date; mode?: "manual" | "scheduled" } = {},
): Promise<StoredReadinessReport> {
  const asOf = options.asOf ?? new Date();
  const mode = options.mode ?? "manual";
  const period = reportingPeriod(asOf);
  const db = await getDb();

  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) throw new Error(`Workspace ${clientId} was not found`);

  const [settings] = await db.select({
    truthFilePath: monthlyReadinessSettings.truthFilePath,
  }).from(monthlyReadinessSettings).where(eq(monthlyReadinessSettings.clientId, clientId)).limit(1);

  if (mode === "scheduled") {
    const [existing] = await db.select({
      id: monthlyReadinessReports.id,
      filename: monthlyReadinessReports.filename,
      periodStart: monthlyReadinessReports.periodStart,
      periodEnd: monthlyReadinessReports.periodEnd,
      status: monthlyReadinessReports.status,
    }).from(monthlyReadinessReports).where(and(
      eq(monthlyReadinessReports.clientId, clientId),
      eq(monthlyReadinessReports.periodStart, period.start),
      eq(monthlyReadinessReports.periodEnd, period.end),
    )).limit(1);
    if (existing) return existing;
  }

  const workspace = await collectReadinessWorkspace(clientId, asOf);
  const loaded = loadTruth(client.name, settings?.truthFilePath ?? null);
  const report = buildReadinessReport(workspace, loaded.truth, loaded.note);
  const pdf = await renderReadinessPdf(report);

  const [stored] = await db.insert(monthlyReadinessReports).values({
    clientId,
    periodStart: period.start,
    periodEnd: period.end,
    generatedAt: new Date(),
    status: "draft",
    filename: report.filename,
    pdf,
    summary: report.summary,
  }).onConflictDoUpdate({
    target: [
      monthlyReadinessReports.clientId,
      monthlyReadinessReports.periodStart,
      monthlyReadinessReports.periodEnd,
    ],
    set: {
      generatedAt: new Date(),
      status: "draft",
      filename: report.filename,
      pdf,
      summary: report.summary,
    },
  }).returning({
    id: monthlyReadinessReports.id,
    filename: monthlyReadinessReports.filename,
    periodStart: monthlyReadinessReports.periodStart,
    periodEnd: monthlyReadinessReports.periodEnd,
    status: monthlyReadinessReports.status,
  });

  return stored;
}
