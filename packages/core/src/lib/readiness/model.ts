import { compareTruthFileWithWorkspace } from "../truthFile/compareWorkspace";
import type { TruthFile, WorkspaceSnapshot } from "../truthFile/types";
import { postureScoreFromStatuses } from "../postureScore";
import { reportingPeriod } from "./period";
import type {
  ReadinessReport,
  ReadinessRisk,
  ReadinessSummary,
  ReadinessWorkspace,
  ReportSection,
} from "./types";

const DEFAULT_BANDS = [
  { min: 1, max: 3, label: "Low" },
  { min: 4, max: 7, label: "Medium" },
  { min: 8, max: 14, label: "High" },
  { min: 15, max: 19, label: "Very High" },
  { min: 20, max: 25, label: "Critical" },
];

const CLOSED = new Set(["done", "completed", "verified", "closed", "remediated", "not_applicable"]);

function text(value: string | null | undefined, fallback = "not on record"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function bandLabel(score: number | null, bands: { min: number; max: number; label: string }[]): string {
  if (score == null) return "not on record";
  const band = bands.find((item) => score >= item.min && score <= item.max);
  return band?.label ?? "outside scale";
}

function daysBetween(earlier: string, later: string): number | null {
  const start = Date.parse(`${earlier}T00:00:00Z`);
  const end = Date.parse(`${later}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86400000);
}

function isOpen(status: string | null | undefined): boolean {
  return !CLOSED.has((status ?? "").toLowerCase());
}

function summaryOf(workspace: ReadinessWorkspace, bands: { min: number; max: number; label: string }[]): ReadinessSummary {
  const posture = postureScoreFromStatuses(workspace.controls.map((control) => control.status));
  const appetiteMin = bands.find((band) => band.label === "High")?.min ?? 8;
  return {
    implemented: posture.implemented,
    inScope: posture.inScope,
    rate: posture.rate,
    evidenceCount: workspace.evidence.length,
    openGaps: workspace.gaps.filter((gap) => isOpen(gap.status) && gap.status !== "implemented").length,
    risksAboveAppetite: workspace.risks.filter((risk) => (risk.residualScore ?? 0) >= appetiteMin).length,
    draftRisks: workspace.risks.filter((risk) => (risk.status ?? "").toLowerCase() === "draft").length,
  };
}

function snapshotOf(workspace: ReadinessWorkspace): WorkspaceSnapshot {
  return {
    clientId: workspace.clientId,
    name: workspace.name,
    legalName: workspace.name,
    industry: workspace.industry,
    frameworks: workspace.frameworks,
    scope: workspace.scope,
    gapScopes: [],
    gapControlIds: workspace.gaps.map((gap) => gap.controlId),
    roadmapTitles: [...new Set(workspace.roadmapItems.map((item) => item.roadmapTitle))],
    businessProcessNames: workspace.processes.map((process) => process.name),
    risks: workspace.risks.map((risk) => ({
      assessmentId: risk.assessmentId,
      inherentScore: risk.inherentScore,
      residualScore: risk.residualScore,
      inherentRisk: risk.inherentRisk,
      residualRisk: risk.residualRisk,
    })),
  };
}

function overdueRows(workspace: ReadinessWorkspace): { overdue: string[][]; undated: string[][] } {
  const overdue: string[][] = [];
  const undated: string[][] = [];
  const push = (item: string, owner: string, due: string | null, status: string | null, mapping: string) => {
    if (!isOpen(status)) return;
    const late = due ? daysBetween(due, workspace.asOf) : null;
    if (late != null && late > 0) {
      overdue.push([item, owner, due ?? "", String(late), mapping]);
      return;
    }
    if (!due) undated.push([item, owner, "not on record", mapping]);
  };
  for (const request of workspace.evidenceRequests) {
    push(text(request.description, "Evidence request"), "not on record", request.dueDate, request.status, "evidence request");
  }
  for (const task of workspace.tasks) {
    push(task.title, "not on record", task.dueDate, task.status, text(task.priority, "task"));
  }
  for (const plan of workspace.bcPlans) {
    push(plan.title, "not on record", null, plan.status, "business continuity plan");
  }
  for (const risk of workspace.risks) {
    if ((risk.status ?? "").toLowerCase() === "draft") {
      push(`${risk.assessmentId} ${text(risk.title, "risk")}`, text(risk.owner), null, risk.status, "draft risk");
    }
  }
  return { overdue, undated };
}

function nextActions(workspace: ReadinessWorkspace): string[][] {
  const ranked: { rank: number; action: string; owner: string; due: string | null; closes: string }[] = [];
  for (const gap of workspace.gaps) {
    if (!isOpen(gap.status) || gap.status === "implemented") continue;
    const severity = (gap.severity ?? "").toLowerCase();
    ranked.push({
      rank: severity === "critical" || severity === "high" ? 0 : 2,
      action: `${gap.controlId}: ${text(gap.notes, "Open gap")}`,
      owner: "to be added",
      due: null,
      closes: `gap ${gap.controlId}`,
    });
  }
  for (const risk of workspace.risks) {
    if ((risk.status ?? "").toLowerCase() !== "draft") continue;
    if ((risk.residualScore ?? 0) >= 8) {
      ranked.push({
        rank: 1,
        action: `Approve or treat ${risk.assessmentId} ${text(risk.title, "risk")}`,
        owner: text(risk.owner, "to be added"),
        due: null,
        closes: risk.assessmentId,
      });
    }
  }
  for (const asset of workspace.cloudAssets) {
    if ((asset.complianceStatus ?? "").toLowerCase() !== "non_compliant") continue;
    ranked.push({
      rank: 1,
      action: `Bring ${asset.name} (${text(asset.type, "cloud asset")}) back to a compliant status`,
      owner: "to be added",
      due: null,
      closes: asset.name,
    });
  }
  for (const task of workspace.tasks) {
    if (!isOpen(task.status)) continue;
    ranked.push({
      rank: (task.priority ?? "").toLowerCase() === "high" ? 2 : 3,
      action: task.title,
      owner: "to be added",
      due: task.dueDate,
      closes: "task",
    });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.slice(0, 3).map((item, index) => [
    String(index + 1),
    item.action,
    item.owner,
    item.due ?? "to be added",
    item.closes,
  ]);
}

function riskRows(risks: ReadinessRisk[], bands: { min: number; max: number; label: string }[]): string[][] {
  return risks.map((risk) => {
    const inherentBand = bandLabel(risk.inherentScore, bands);
    const residualBand = bandLabel(risk.residualScore, bands);
    const stored = [risk.inherentRisk, risk.residualRisk].filter(Boolean).join(" / ");
    const storedDiffers = (risk.inherentRisk && risk.inherentRisk.toLowerCase() !== inherentBand.toLowerCase())
      || (risk.residualRisk && risk.residualRisk.toLowerCase() !== residualBand.toLowerCase());
    return [
      risk.assessmentId,
      text(risk.title, "Untitled risk"),
      risk.inherentScore == null ? "not on record" : `${risk.inherentScore} ${inherentBand}`,
      risk.residualScore == null ? "not on record" : `${risk.residualScore} ${residualBand}`,
      text(risk.owner),
      text(risk.treatment),
      text(risk.status),
      storedDiffers ? `stored ${stored}` : "",
    ];
  });
}

function section(title: string, paragraphs: string[], extra: Partial<ReportSection> = {}): ReportSection {
  return { title, paragraphs, bullets: extra.bullets ?? [], table: extra.table };
}

export function buildReadinessReport(
  workspace: ReadinessWorkspace,
  truth: TruthFile | null,
  truthNote?: string | null,
): ReadinessReport {
  const asOfDate = new Date(`${workspace.asOf}T00:00:00Z`);
  const period = reportingPeriod(asOfDate);
  const bands = truth?.risk_register.bands?.length ? truth.risk_register.bands : DEFAULT_BANDS;
  const summary = summaryOf(workspace, bands);
  const differences = truth ? compareTruthFileWithWorkspace(truth, snapshotOf(workspace)).map((item) => item.message) : [];
  const rate = summary.rate == null ? "not on record" : `${summary.rate}% (${summary.implemented} of ${summary.inScope} in-scope controls)`;
  const last = workspace.previous;
  const lastRate = last
    ? (last.summary.rate == null ? "not on record" : `${last.summary.rate}%`)
    : "not on record";
  const verified = workspace.evidence.filter((item) => item.status === "verified").length;
  const collected = workspace.evidence.filter((item) => item.status === "collected").length;
  const { overdue, undated } = overdueRows(workspace);
  const frameworks = workspace.frameworks.length ? workspace.frameworks.join(", ") : "none assigned";
  const scope = truth && truth.scope.statement.trim() && truth.scope.statement !== "to be added"
    ? truth.scope.statement
    : text(workspace.scope, "No scope statement is stored on the workspace.");

  const changes: string[] = [];
  if (!last) {
    changes.push("No previous monthly report is stored. Nothing below is described as a change since last month.");
  }
  for (const item of workspace.roadmapItems.filter((row) => row.status === "done")) {
    changes.push(`Roadmap item "${item.title}" is done.`);
  }
  for (const vuln of workspace.vulnerabilities.filter((row) => (row.status ?? "").toLowerCase() === "remediated")) {
    changes.push(`${text(vuln.id, "Vulnerability")} ${vuln.name} is remediated.`);
  }
  for (const vendor of workspace.vendors) {
    if (vendor.assessment) changes.push(`${vendor.name}: ${vendor.assessment}.`);
  }
  for (const audit of workspace.audits) {
    changes.push(`Certification audit ${text(audit.firm)} / ${text(audit.auditor)} is ${text(audit.status)} (${text(audit.stage)}).`);
  }
  if (last) {
    changes.unshift(
      `Controls in scope were ${last.summary.inScope} with ${last.summary.implemented} implemented. Evidence items were ${last.summary.evidenceCount}. Open gaps were ${last.summary.openGaps}.`,
    );
  }

  const incidentPolicies = workspace.policies.filter((policy) => /incident/i.test(policy.name)).map((policy) => policy.name);
  const contacts = truth?.incident_contacts ?? [];

  const sections: ReportSection[] = [
    section("1. Period and scope", [
      `Frameworks assigned in the workspace: ${frameworks}.`,
      `Scope: ${scope}`,
      truth
        ? `NIS2 class in the truth file: ${truth.nis2_class}. Sector: ${truth.nis2_sector}.`
        : "No truth file was loaded for this workspace.",
      "Prices are not stated in this report: PRICE TBD (owner).",
    ], {
      bullets: [
        ...workspace.assets.map((asset) => `Asset ${asset.name} (${text(asset.type)}), C/I/A ${text(asset.cia)}.`),
        ...workspace.cloudAssets.map((asset) => `Cloud asset ${asset.name} (${text(asset.type)}), status ${text(asset.complianceStatus)}.`),
        ...workspace.vendors.map((vendor) => `Supplier ${vendor.name}, ${text(vendor.service)}, criticality ${text(vendor.criticality)}.`),
      ],
    }),
    section("2. Overall readiness summary", [
      last
        ? "Last month comes from the previous stored readiness summary."
        : "Last month is not on record. Previous-month figures are not invented.",
    ], {
      table: {
        headers: ["Area", "This month", "Last month", "Source"],
        rows: [
          ["Controls implemented (of in-scope)", rate, lastRate, "workspace control statuses"],
          ["Evidence items", `${summary.evidenceCount} (${verified} verified, ${collected} collected)`, last ? String(last.summary.evidenceCount) : "not on record", "workspace evidence"],
          ["Open evidence requests", String(workspace.evidenceRequests.filter((item) => isOpen(item.status)).length), "not on record", "workspace evidence requests"],
          ["Risks in the register", String(workspace.risks.length), "not on record", "workspace risk register"],
          ["Risks at High or above on the truth-file scale (residual)", String(summary.risksAboveAppetite), last ? String(last.summary.risksAboveAppetite) : "not on record", "scores, not the stored label"],
          ["Risks still in draft", String(summary.draftRisks), last ? String(last.summary.draftRisks) : "not on record", "workspace risk status"],
          ["Gap findings still open", String(summary.openGaps), last ? String(last.summary.openGaps) : "not on record", "workspace gap assessment"],
          ...workspace.kris.map((kri) => [kri.name, `${text(kri.value)} (${text(kri.status)})`, "not on record", `green threshold ${text(kri.green)}`]),
          ...workspace.audits.map((audit) => ["Certification audit", `${text(audit.stage)} ${text(audit.status)}`, "not on record", text(audit.firm)]),
        ],
      },
    }),
    section("3. What changed since last month", changes.length ? [] : ["Nothing notable is on record."], { bullets: changes }),
    section("4. Overdue items", [
      overdue.length
        ? "Due dates below are stored on the workspace. Days overdue use the as-of date."
        : "No stored due date is before the as-of date. Overdue days are not invented.",
      undated.length ? "These open items have no due date on record." : "Every open item above has a due date, or there are no undated open items.",
    ], {
      table: overdue.length
        ? { headers: ["Item", "Owner", "Due", "Days overdue", "Mapping"], rows: overdue }
        : undated.length
          ? { headers: ["Item", "Owner", "Due", "Mapping"], rows: undated }
          : undefined,
    }),
    section("5. Next 3 actions", [
      "Deadlines are copied from stored due dates. Where the workspace has no due date, the deadline is \"to be added\".",
    ], {
      table: {
        headers: ["#", "Action", "Owner", "Deadline", "Closes"],
        rows: nextActions(workspace),
      },
    }),
    section("6. Risks", [
      "Labels in the score columns use the truth-file scale when a truth file is loaded (otherwise 1-3 Low, 4-7 Medium, 8-14 High, 15-19 Very High, 20-25 Critical). A stored label that disagrees is shown in the last column and is not treated as approved.",
    ], {
      table: {
        headers: ["ID", "Risk", "Inherent", "Residual", "Owner", "Treatment", "Status", "Stored label"],
        rows: riskRows(workspace.risks, bands),
      },
    }),
    section("7. Incident-reporting readiness", [
      incidentPolicies.length
        ? `Policies on record: ${incidentPolicies.join(", ")}.`
        : "No incident policy is on record in the workspace.",
      "No incident drill is stored in the workspace, so drill status is not invented.",
    ], {
      bullets: contacts.map((contact) => `${contact.role}: ${contact.name}.`),
      table: truth ? {
        headers: ["Watch item", "Status", "Last checked"],
        rows: truth.regulatory_watch.map((item) => [item.item, item.status, item.last_checked]),
      } : undefined,
    }),
    section("8. Management-body duties", [
      "Management-body approval of the measures, and management-body training, are not stored as their own workspace records.",
      "They are not marked done or overdue in this draft.",
    ]),
    section("9. Sign-off", [
      "I have reviewed this report and the evidence summarised in it. Release to the client is approved only when this box is completed.",
      "Name: Emmanuel",
      "Role: Accountable compliance reviewer, GRCompliance CaaS",
      "Decision: Approved for release / Approved with changes / Not approved",
      "Date: ______________",
      "Signature: ______________",
      "Company stamp: [ stamp ]",
      "Comments: ______________",
      "Until it is signed, this document is a DRAFT and must not be sent to the client.",
      "This PDF is stored for download. It is not emailed.",
    ]),
    section("10. Annex", [
      "Control counts, evidence, risks, gaps, tasks, suppliers, assets, and policies come from the workspace rows supplied to this render.",
      truth
        ? `Truth file ${truth.truth_file_version} for ${truth.client_legal_name} was loaded. Approved wording is limited to that file.`
        : "No truth file was loaded.",
      differences.length
        ? "The truth file and the workspace disagree on the points in this list. Those workspace values are not approved facts."
        : "No truth-file differences were calculated.",
      "PRICE TBD (owner).",
      ...(truthNote ? [truthNote] : []),
    ], { bullets: differences }),
  ];

  const filename = `MRR-${workspace.clientId || "demo"}-${period.end.slice(0, 7)}.pdf`;
  return {
    filename,
    summary,
    meta: [
      { label: "Client", value: `${workspace.name}${workspace.industry ? ` (${workspace.industry})` : ""}` },
      { label: "Report no.", value: filename.replace(/\.pdf$/, "") },
      { label: "Reporting period", value: `${period.start} to ${period.end}` },
      { label: "Data as of", value: period.asOf },
      { label: "Prepared by", value: "GRCompliance CaaS team (prepared with automation, reviewed by a human)" },
      { label: "Reviewer / signer", value: "Emmanuel (see sign-off)" },
      { label: "Status", value: "DRAFT. Not released until it is signed" },
      { label: "Delivery", value: "Stored for download. Not emailed. Released only after Emmanuel approves it." },
    ],
    sections,
    differences,
  };
}
