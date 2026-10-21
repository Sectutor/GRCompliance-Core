import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latoreDemoWorkspace } from "./demoLatore";
import { buildReadinessReport } from "./model";
import { reportingPeriod, schedulerEnabled, selectDueSettings } from "./period";
import { pdfBytesToBase64, renderReadinessPdf } from "./pdf";
import { defaultTruthFileForClient, resolveTruthFilePath } from "./truthPath";
import { validateTruthFileAtPath } from "../truthFile/validate";

const repoRoot = pathToRepo(import.meta.url);
const today = "2026-10-21";

function pathToRepo(metaUrl: string): string {
  if (metaUrl.startsWith("file:")) {
    return fileURLToPath(new URL("../../../../../", metaUrl));
  }
  const candidates = [
    path.resolve(process.cwd(), "../../.."),
    path.resolve(process.cwd()),
  ];
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, "truth-files/latore-ltd.yaml")));
  if (!found) throw new Error(`unexpected import.meta.url ${metaUrl}`);
  return found;
}

function readRepo(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8");
}

describe("monthly readiness period and schedule", () => {
  it("uses the month ending the day before the as-of date", () => {
    const period = reportingPeriod(new Date("2026-10-21T15:00:00Z"));
    expect(period).toEqual({ start: "2026-09-21", end: "2026-10-20", asOf: "2026-10-21" });
  });

  it("ignores workspaces that have not opted in", () => {
    const now = new Date("2026-10-21T00:30:00Z");
    const due = selectDueSettings([
      { clientId: 1, enabled: false, dayOfMonth: 21 },
      { clientId: 2, enabled: true, dayOfMonth: 21 },
      { clientId: 3, enabled: true, dayOfMonth: 29 },
      { clientId: 4, enabled: true, dayOfMonth: 1 },
    ], now);
    expect(due.map((row) => row.clientId)).toEqual([2]);
  });

  it("starts only when the scheduler environment variable is exactly true", () => {
    expect(schedulerEnabled({ ENABLE_MONTHLY_READINESS_SCHEDULER: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(schedulerEnabled({ ENABLE_MONTHLY_READINESS_SCHEDULER: "false" } as NodeJS.ProcessEnv)).toBe(false);
    expect(schedulerEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("truth file path", () => {
  it("stays inside truth-files", () => {
    expect(resolveTruthFilePath("../.env", repoRoot)).toBeNull();
    expect(resolveTruthFilePath("/etc/passwd", repoRoot)).toBeNull();
    expect(resolveTruthFilePath("latore-ltd.yaml", repoRoot)).toBe(path.join(repoRoot, "truth-files", "latore-ltd.yaml"));
    expect(defaultTruthFileForClient("Latore LTD", repoRoot)).toBe(path.join(repoRoot, "truth-files", "latore-ltd.yaml"));
  });
});

describe("Latore monthly readiness report", () => {
  const truthPath = path.join(repoRoot, "truth-files/latore-ltd.yaml");
  const validated = validateTruthFileAtPath(truthPath, { today });
  const workspace = latoreDemoWorkspace(today);
  const report = validated.document ? buildReadinessReport(workspace, validated.document) : null;

  it("loads the example truth file and flags seed quirks as differences", () => {
    expect(validated.ok).toBe(true);
    expect(report).not.toBeNull();
    const text = report!.differences.join("\n");
    const truthText = fs.readFileSync(truthPath, "utf8");
    expect(truthText).not.toContain("A.9.1");
    expect(truthText).not.toContain("ISO 27001 Roadmap 2024");
    expect(truthText).not.toContain("Online Order Fulfillment");
    expect(text).toContain('gap control "A.9.1" is in the workspace and is not listed in the truth file');
    expect(text).toContain('truth file control "A.5.15" is not in the workspace gap assessment');
    expect(text).toContain('roadmap "ISO 27001 Roadmap 2024" is in the workspace and is not the truth-file roadmap title');
    expect(text).toContain('business process "Online Order Fulfillment" is in the workspace and is not listed in the truth file');
    expect(text).toContain('risk RA-2026-001 inherent score 20 is stored as "High"; truth-file band is "Critical"');
    expect(text).not.toContain("residual score 8");
  });

  it("does not invent deadlines or last-month figures for the demo seed", () => {
    const actions = report!.sections.find((section) => section.title.startsWith("5."));
    expect(actions?.table?.rows.length).toBe(3);
    expect(actions?.table?.rows.every((row) => row[3] === "to be added")).toBe(true);
    expect(report!.sections.some((section) => section.paragraphs.some((paragraph) => paragraph.includes("not on record")))).toBe(true);
    expect(report!.filename).toBe("MRR-demo-2026-10.pdf");

    const dated = latoreDemoWorkspace(today);
    dated.gaps = [];
    dated.risks = dated.risks.filter((risk) => risk.status !== "draft");
    dated.cloudAssets = dated.cloudAssets.map((asset) => ({ ...asset, complianceStatus: "compliant" }));
    dated.tasks[0].dueDate = "2026-11-02";
    const withDate = buildReadinessReport(dated, validated.document);
    const next = withDate.sections.find((section) => section.title.startsWith("5."));
    expect(next?.table?.rows.some((row) => row[3] === "2026-11-02")).toBe(true);
  });

  it("renders a downloadable PDF that is marked draft and not emailed", async () => {
    const pdf = await renderReadinessPdf(report!);
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF")).toBe(true);
    const text = [...raw.matchAll(/<([0-9A-Fa-f\s]+)>/g)]
      .map((match) => Buffer.from(match[1].replace(/\s+/g, ""), "hex").toString("latin1"))
      .join("");
    expect(text).toContain("Latore LTD");
    expect(text).toContain("DRAFT");
    expect(text).toContain("Sign-off");
    expect(text).toContain("Not emailed");
    expect(text).toContain("A.9.1");
    expect(text).toContain("PRICE TBD (owner)");
    const decoded = Buffer.from(pdfBytesToBase64(pdf), "base64");
    expect(decoded.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdfBytesToBase64("\\x25504446")).toBe(Buffer.from("%PDF").toString("base64"));
  });
});

describe("monthly readiness wiring", () => {
  it("keeps the scheduler off by default and does not send email", () => {
    const scheduler = readRepo("packages/core/src/server/services/monthlyReadinessScheduler.ts");
    const store = readRepo("packages/core/src/lib/readiness/store.ts");
    const router = readRepo("packages/core/src/server/routers/monthlyReadiness.ts");
    const entry = readRepo("server_entry.ts");
    const compose = readRepo("docker-compose.yml");
    const bootstrap = readRepo("docker/bootstrap.ts");
    const schemaSql = readRepo("docker/schema.sql");
    const sources = [scheduler, store, router].join("\n");
    expect(sources).not.toMatch(/EmailService|sendMail|nodemailer|resend/i);
    expect(entry).toContain("ENABLE_MONTHLY_READINESS_SCHEDULER === 'true'");
    expect(entry).not.toContain("ENABLE_MONTHLY_READINESS_SCHEDULER !== 'false'");
    expect(compose).toContain('ENABLE_MONTHLY_READINESS_SCHEDULER: "false"');
    expect(bootstrap).toContain("CREATE TABLE IF NOT EXISTS monthly_readiness_settings");
    expect(bootstrap).toContain("CREATE TABLE IF NOT EXISTS monthly_readiness_reports");
    expect(bootstrap).not.toMatch(/DROP TABLE monthly_readiness|DELETE FROM monthly_readiness/);
    expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS monthly_readiness_reports");
    expect(router).toContain("eq(monthlyReadinessReports.clientId, input.clientId)");
    expect(router).toContain("eq(monthlyReadinessReports.id, input.reportId)");
  });
});
