/** Machine-readable client truth file. Field names follow the CaaS truth-file template. */

export type DateOrPending = string;

export interface TruthFrameworkObligation {
  id: string;
  applies: boolean;
  basis: string;
  target: string;
  target_date: DateOrPending;
}

export interface TruthEntity {
  id: string;
  legal_name: string;
  role: string;
  company_id: string;
  address: string;
}

export interface TruthAsset {
  id: string;
  name: string;
  type: string;
  owner: string;
  cia: string;
  in_scope: boolean;
  location: string;
  entity_id: string;
}

export interface TruthSupplier {
  name: string;
  service: string;
  criticality: string;
  last_assessment: string;
  contract_end: DateOrPending;
  entity_id: string;
  contact_name: string;
  contact_role: string;
  contact_email: string;
}

export interface TruthControlOwner {
  domain: string;
  owner: string;
  deputy: string;
  cadence: string;
}

export interface TruthEvidence {
  id: string;
  controls: string[];
  description: string;
  location: string;
  collected: DateOrPending;
  valid_until: string;
  status: string;
  verified_by: string;
}

export interface TruthRiskBand {
  min: number;
  max: number;
  label: string;
}

export interface TruthRisk {
  id: string;
  title: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  owner: string;
  treatment: string;
  status: string;
}

export interface TruthRiskRegister {
  system_of_record: string;
  methodology: string;
  bands: TruthRiskBand[];
  appetite: string;
  last_full_review: DateOrPending;
  risks: TruthRisk[];
}

export interface TruthFinding {
  id: string;
  source: string;
  control: string;
  severity: string;
  owner: string;
  due: DateOrPending;
  status: string;
  summary: string;
}

export interface TruthDecision {
  date: string;
  decision: string;
  made_by: string;
  rationale: string;
  evidence: string;
}

export interface TruthApprovedFact {
  wording: string;
  approved_by: string;
  date: string;
  allowed_where: string;
}

export interface TruthFile {
  truth_file_version: string;
  client_id: string;
  client_legal_name: string;
  workspace_id: string;
  owner_signer: string;
  last_reviewed: string;
  last_reviewed_by: string;
  nis2_class: string;
  nis2_sector: string;
  frameworks: string[];
  reporting_day_of_month: number;
  engagement_status: string;
  monthly_fee: string;
  identity: {
    legal_name: string;
    trading_names: string;
    company_id: string;
    registered_address: string;
    country: string;
    industry: string;
    headcount: string;
    turnover_eur: string;
    balance_sheet_eur: string;
    size_class: string;
    primary_contact: string;
    management_body: string;
    languages: string;
    source: string;
  };
  nis2: {
    classification: string;
    sector: string;
    sub_sector: string;
    annex: string;
    legal_basis: string;
    rationale: string;
    competent_authority: string;
    registration_status: string;
    supervision_type: string;
    decided_by: string;
    decided_on: DateOrPending;
    next_recheck: DateOrPending;
  };
  framework_obligations: TruthFrameworkObligation[];
  scope: {
    statement: string;
    locations: string;
    exclusions: string;
    in_scope_frameworks: string[];
    soa: string;
  };
  entities: TruthEntity[];
  assets: TruthAsset[];
  suppliers: TruthSupplier[];
  control_owners: TruthControlOwner[];
  evidence: TruthEvidence[];
  evidence_note: string;
  evidence_freshness_days: number;
  risk_register: TruthRiskRegister;
  roadmap: {
    title: string;
    items: { title: string; status: string }[];
  };
  business_continuity: {
    plan_title: string;
    plan_version: string;
    plan_status: string;
    processes: { name: string }[];
    process_note: string;
  };
  incident_contacts: {
    role: string;
    name: string;
    contact: string;
    always_on: string;
    deputy: string;
  }[];
  channels: { name: string; value: string; verified_on: DateOrPending }[];
  findings: TruthFinding[];
  decisions: TruthDecision[];
  approved_facts: TruthApprovedFact[];
  engagement: {
    offer: string;
    monthly_fee: string;
    contract_start: DateOrPending;
    minimum_term: string;
    notice: string;
    payment_terms: string;
    software_licence: string;
    invoices: string;
    deliverables_awaiting_approval: string;
    billing_contact: string;
  };
  regulatory_watch: {
    item: string;
    why: string;
    status: string;
    last_checked: DateOrPending;
    next_check: DateOrPending;
  }[];
  change_history: {
    version: string;
    date: string;
    changed_by: string;
    sections: string;
    summary: string;
    approved_by: string;
  }[];
  shared_facts: {
    approved_prices: string[];
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface WorkspaceRiskSnapshot {
  assessmentId: string;
  inherentScore: number | null;
  residualScore: number | null;
  inherentRisk: string | null;
  residualRisk: string | null;
}

/** Fields the app already stores for a workspace. Read-only comparison input. */
export interface WorkspaceSnapshot {
  clientId: number | null;
  name: string | null;
  legalName: string | null;
  industry: string | null;
  /** Raw framework names from assigned controls, such as "ISO 27001". */
  frameworks: string[];
  /** risk_settings.scope. Null when the workspace has no scope row. */
  scope: string | null;
  /** Non-empty gap assessment scope texts, when that column is set. */
  gapScopes: string[];
  gapControlIds: string[];
  roadmapTitles: string[];
  businessProcessNames: string[];
  risks: WorkspaceRiskSnapshot[];
}

export interface WorkspaceDifference {
  code:
    | "name"
    | "industry"
    | "framework"
    | "scope"
    | "gap_control"
    | "roadmap"
    | "business_process"
    | "risk_label"
    | "risk_score"
    | "risk_id";
  message: string;
}
