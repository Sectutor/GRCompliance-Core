import type { ReadinessWorkspace } from "./types";

/**
 * Workspace rows the Latore LTD demo seed writes.
 * Quirk values (2013 control id, roadmap title, e-commerce process, collapsed risk labels)
 * are included because they are what the database returns. They are not approved facts.
 * The truth file is passed separately and the report lists the differences.
 */
const RISKS: Array<{
  assessmentId: string;
  title: string;
  inherent: [number, number];
  residual: [number, number];
  owner: string;
  treatment: string;
  status: string;
}> = [
  { assessmentId: "RA-2026-001", title: "Unauthorized access to the client file store", inherent: [4, 5], residual: [2, 3], owner: "Priya Shah", treatment: "Mitigate", status: "approved" },
  { assessmentId: "RA-2026-002", title: "Ransomware on the document system", inherent: [3, 5], residual: [2, 4], owner: "Jordan Hale", treatment: "Mitigate", status: "reviewed" },
  { assessmentId: "RA-2026-003", title: "Late NIS2 incident notification", inherent: [2, 4], residual: [1, 3], owner: "Alex Morgan", treatment: "Mitigate", status: "approved" },
  { assessmentId: "RA-2026-004", title: "Hosted email provider outage", inherent: [3, 4], residual: [2, 3], owner: "Sam Okonkwo", treatment: "Transfer", status: "reviewed" },
  { assessmentId: "RA-2026-005", title: "Lost laptop with customer proposals", inherent: [3, 3], residual: [2, 2], owner: "Riley Chen", treatment: "Mitigate", status: "approved" },
  { assessmentId: "RA-2026-006", title: "Unpatched public website", inherent: [4, 4], residual: [2, 2], owner: "Jordan Hale", treatment: "Mitigate", status: "reviewed" },
  { assessmentId: "RA-2026-007", title: "Excessive contractor access", inherent: [3, 4], residual: [2, 3], owner: "Priya Shah", treatment: "Mitigate", status: "approved" },
  { assessmentId: "RA-2026-008", title: "Untested backup restore", inherent: [2, 5], residual: [2, 4], owner: "Sam Okonkwo", treatment: "Mitigate", status: "draft" },
  { assessmentId: "RA-2026-009", title: "Phishing of the finance team", inherent: [4, 3], residual: [2, 2], owner: "Riley Chen", treatment: "Mitigate", status: "reviewed" },
  { assessmentId: "RA-2026-010", title: "Incomplete processing record", inherent: [2, 3], residual: [1, 2], owner: "Alex Morgan", treatment: "Accept", status: "draft" },
];

/** Same collapse as seedRiskModule level(): every score of 8 or more is stored as High. */
function seedStoredLabel(score: number): string {
  if (score >= 8) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

export function latoreDemoWorkspace(asOf = "2026-10-21"): ReadinessWorkspace {
  const cycle = ["implemented", "implemented", "in_progress", "not_implemented", "implemented", "in_progress", "not_applicable"];
  return {
    clientId: 0,
    name: "Latore LTD",
    industry: "Professional services",
    asOf,
    frameworks: ["ISO 27001", "SOC 2", "NIS2"],
    scope: null,
    controls: cycle.map((status) => ({ status })),
    evidence: Array.from({ length: 8 }, (_, index) => ({
      evidenceId: `LTD-EV-${String(index + 1).padStart(3, "0")}`,
      status: index % 3 === 0 ? "collected" : "verified",
      owner: "Alex Morgan",
      dueDate: null,
      description: null,
    })),
    evidenceRequests: [{
      description: "Please provide the latest firewall configuration backup.",
      status: "open",
      dueDate: null,
    }],
    risks: RISKS.map((risk) => {
      const inherentScore = risk.inherent[0] * risk.inherent[1];
      const residualScore = risk.residual[0] * risk.residual[1];
      return {
        assessmentId: risk.assessmentId,
        title: risk.title,
        inherentScore,
        residualScore,
        inherentRisk: seedStoredLabel(inherentScore),
        residualRisk: seedStoredLabel(residualScore),
        owner: risk.owner,
        treatment: risk.treatment,
        status: risk.status,
      };
    }),
    gaps: [
      { controlId: "A.5.1", status: "partial", severity: "medium", notes: "Policy exists but hasn't been reviewed in 2 years." },
      { controlId: "A.9.1", status: "not_implemented", severity: "high", notes: "Access control policy is missing." },
    ],
    kris: [
      { name: "Critical System Uptime", value: "99.99%", status: "green", green: "> 99.9%" },
      { name: "Mean Time to Patch (Critical)", value: "9 days", status: "amber", green: "< 7 days" },
    ],
    audits: [{ firm: "Fieldnote Assurance", auditor: "Morgan Ellis", status: "in_progress", stage: "stage_1" }],
    vendors: [{
      name: "CloudBase Solutions",
      criticality: "High",
      service: "Primary hosting and managed services provider",
      assessment: "Annual Security Review, Completed, score 88",
    }],
    assets: [{ name: "Core Cloud Infrastructure", type: "Cloud Service", cia: "5/5/5" }],
    cloudAssets: [
      { name: "prod-db-master", type: "ec2", complianceStatus: "compliant" },
      { name: "bucket-customer-data", type: "s3", complianceStatus: "non_compliant" },
    ],
    tasks: [
      { title: "Upload SOC 2 report for review", status: "todo", priority: "high", dueDate: null },
      { title: "Schedule quarterly access review", status: "in_progress", priority: "medium", dueDate: null },
    ],
    roadmapItems: [
      { roadmapTitle: "ISO 27001 Roadmap 2024", title: "Implement MFA for all users", status: "done" },
      { roadmapTitle: "ISO 27001 Roadmap 2024", title: "Conduct full internal audit", status: "pending" },
      { roadmapTitle: "ISO 27001 Roadmap 2024", title: "Final certification audit", status: "pending" },
    ],
    policies: [
      "Information Security Policy",
      "Access Control Policy",
      "Incident Response Policy",
      "Vendor Risk Management Policy",
      "Business Continuity Policy",
      "NIS2 Incident Notification Policy",
    ].map((name) => ({ name })),
    vulnerabilities: [{ id: "V-001", name: "Lack of MFA on Legacy Admin Portal", status: "remediated" }],
    bcPlans: [{ title: "Global Business Continuity Plan", version: "1.0", status: "draft" }],
    processes: [{
      name: "Online Order Fulfillment",
      description: "Core e-commerce order processing and delivery",
      rto: "4 hours",
      rpo: "1 hour",
      tier: "Tier 1",
    }],
    previous: null,
  };
}
