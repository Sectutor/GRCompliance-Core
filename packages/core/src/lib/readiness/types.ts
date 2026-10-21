export interface ReadinessControl {
  status: string | null;
}

export interface ReadinessEvidence {
  evidenceId: string;
  status: string | null;
  owner: string | null;
  dueDate: string | null;
  description: string | null;
}

export interface ReadinessRequest {
  description: string | null;
  status: string | null;
  dueDate: string | null;
}

export interface ReadinessRisk {
  assessmentId: string;
  title: string | null;
  inherentScore: number | null;
  residualScore: number | null;
  inherentRisk: string | null;
  residualRisk: string | null;
  owner: string | null;
  treatment: string | null;
  status: string | null;
}

export interface ReadinessGap {
  controlId: string;
  status: string | null;
  severity: string | null;
  notes: string | null;
}

export interface ReadinessTask {
  title: string;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
}

export interface ReadinessRoadmapItem {
  roadmapTitle: string;
  title: string;
  status: string | null;
}

export interface ReadinessSummary {
  implemented: number;
  inScope: number;
  rate: number | null;
  evidenceCount: number;
  openGaps: number;
  risksAboveAppetite: number;
  draftRisks: number;
}

/** Workspace rows the monthly report is allowed to quote. Dates are YYYY-MM-DD or null. */
export interface ReadinessWorkspace {
  clientId: number;
  name: string;
  industry: string | null;
  asOf: string;
  frameworks: string[];
  scope: string | null;
  controls: ReadinessControl[];
  evidence: ReadinessEvidence[];
  evidenceRequests: ReadinessRequest[];
  risks: ReadinessRisk[];
  gaps: ReadinessGap[];
  kris: { name: string; value: string | null; status: string | null; green: string | null }[];
  audits: { firm: string | null; auditor: string | null; status: string | null; stage: string | null }[];
  vendors: { name: string; criticality: string | null; service: string | null; assessment: string | null }[];
  assets: { name: string; type: string | null; cia: string | null }[];
  cloudAssets: { name: string; type: string | null; complianceStatus: string | null }[];
  tasks: ReadinessTask[];
  roadmapItems: ReadinessRoadmapItem[];
  policies: { name: string }[];
  vulnerabilities: { id: string | null; name: string; status: string | null }[];
  bcPlans: { title: string; version: string | null; status: string | null }[];
  processes: { name: string; description: string | null; rto: string | null; rpo: string | null; tier: string | null }[];
  previous: { periodEnd: string; summary: ReadinessSummary } | null;
}

export interface ReportTable {
  headers: string[];
  rows: string[][];
}

export interface ReportSection {
  title: string;
  paragraphs: string[];
  bullets: string[];
  table?: ReportTable;
}

export interface ReadinessReport {
  filename: string;
  summary: ReadinessSummary;
  meta: { label: string; value: string }[];
  sections: ReportSection[];
  differences: string[];
}
