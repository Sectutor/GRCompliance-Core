import { bandForScore, canonicalFramework, isPlaceholder, PRICE_TBD } from "./allowed";
import { readTruthFile } from "./parse";
import { loadTruthFileSchema, validateAgainstSchema } from "./schemaValidator";
import type { TruthFile, ValidationIssue } from "./types";

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/i,
  /(?:^|[\s"'`])(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token|password|passwd)\s*[:=]\s*\S+/i,
];

const PRICE_KEYS = new Set(["monthly_fee", "price", "amount", "fee"]);
const ISO_ANNEX_2022 = /^A\.[5-8](?:\.\d+)?$/;

export interface ValidateOptions {
  /** Inclusive upper bound for last_reviewed. Defaults to today's UTC date. */
  today?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  document: TruthFile | null;
}

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function splitSchemaError(line: string): ValidationIssue {
  const index = line.indexOf(": ");
  if (index === -1) return issue("$", line);
  return issue(line.slice(0, index), line.slice(index + 2));
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function requireNamedOwner(path: string, value: string, errors: ValidationIssue[]) {
  if (isPlaceholder(value) || value.trim().toLowerCase() === "unassigned") {
    errors.push(issue(path, "needs a named owner, not \"to be added\" or \"unassigned\""));
  }
}

function assertDateOrder(
  path: string,
  earlier: string,
  later: string,
  earlierLabel: string,
  laterLabel: string,
  errors: ValidationIssue[],
) {
  if (!isDate(earlier) || !isDate(later)) return;
  if (earlier > later) {
    errors.push(issue(path, `${earlierLabel} ${earlier} is after ${laterLabel} ${later}`));
  }
}

function assertIso2022Control(path: string, control: string, errors: ValidationIssue[]) {
  if (isPlaceholder(control) || !/^A\.\d+/.test(control)) return;
  if (!ISO_ANNEX_2022.test(control)) {
    errors.push(issue(
      path,
      `"${control}" is not an ISO/IEC 27001:2022 Annex A control. The 2022 annex uses A.5, A.6, A.7, and A.8`,
    ));
  }
}

function walkSecrets(value: unknown, path: string, errors: ValidationIssue[]) {
  if (typeof value === "string") {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
      errors.push(issue(path, "looks like a secret. Store a pointer to the vault, not the secret"));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSecrets(item, `${path}[${index}]`, errors));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walkSecrets(child, `${path}.${key}`, errors);
    }
  }
}

function walkPrices(value: unknown, path: string, approved: Set<string>, errors: ValidationIssue[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkPrices(item, `${path}[${index}]`, approved, errors));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (PRICE_KEYS.has(key) && typeof child === "string" && child !== PRICE_TBD && !approved.has(child)) {
      errors.push(issue(childPath, `must be "${PRICE_TBD}" or a price listed in shared_facts.approved_prices`));
    }
    walkPrices(child, childPath, approved, errors);
  }
}

function duplicateIds(path: string, ids: string[], errors: ValidationIssue[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(issue(path, `duplicate id "${id}"`));
    seen.add(id);
  }
}

function semanticErrors(doc: TruthFile, today: string): ValidationIssue[] {
  const errors: ValidationIssue[] = [];

  requireNamedOwner("$.owner_signer", doc.owner_signer, errors);
  requireNamedOwner("$.last_reviewed_by", doc.last_reviewed_by, errors);
  if (doc.last_reviewed > today) {
    errors.push(issue("$.last_reviewed", `${doc.last_reviewed} is after ${today}`));
  }
  if (doc.identity.legal_name !== doc.client_legal_name) {
    errors.push(issue("$.identity.legal_name", "must match client_legal_name"));
  }

  const canonicalHeader: string[] = [];
  for (const id of doc.frameworks) {
    const canonical = canonicalFramework(id);
    if (!canonical) {
      errors.push(issue("$.frameworks", `"${id}" is not an allowed framework`));
      continue;
    }
    if (canonicalHeader.includes(canonical)) {
      errors.push(issue("$.frameworks", `duplicate framework "${canonical}"`));
    }
    canonicalHeader.push(canonical);
  }
  const headerSet = new Set(canonicalHeader);

  for (const [index, obligation] of doc.framework_obligations.entries()) {
    const canonical = canonicalFramework(obligation.id);
    if (!canonical) continue;
    const listed = headerSet.has(canonical);
    if (obligation.applies && !listed) {
      errors.push(issue(
        `$.framework_obligations[${index}].id`,
        `framework ${obligation.id} applies but is missing from frameworks`,
      ));
    }
    if (!obligation.applies && listed) {
      errors.push(issue(
        `$.framework_obligations[${index}].id`,
        `framework ${obligation.id} is in frameworks but marked as not applying`,
      ));
    }
  }
  for (const id of headerSet) {
    const found = doc.framework_obligations.some((obligation) => canonicalFramework(obligation.id) === id);
    if (!found) {
      errors.push(issue("$.frameworks", `framework ${id} is listed but missing from framework_obligations`));
    }
  }
  doc.scope.in_scope_frameworks.forEach((id, index) => {
    const canonical = canonicalFramework(id);
    if (canonical && !headerSet.has(canonical)) {
      errors.push(issue(
        `$.scope.in_scope_frameworks[${index}]`,
        `framework ${id} is in scope but missing from frameworks`,
      ));
    }
  });

  if (doc.nis2.classification !== doc.nis2_class) {
    errors.push(issue("$.nis2.classification", "must match nis2_class"));
  }
  if (doc.nis2.sector !== doc.nis2_sector) {
    errors.push(issue("$.nis2.sector", "must match nis2_sector"));
  }
  if (isPlaceholder(doc.nis2.rationale) || doc.nis2.rationale.trim().length < 20) {
    errors.push(issue("$.nis2.rationale", "NIS2 class needs a rationale, not a placeholder"));
  }
  const classMentioned = doc.decisions.some((decision) =>
    decision.decision.toLowerCase().includes(doc.nis2_class.toLowerCase()),
  );
  if (!classMentioned) {
    errors.push(issue("$.decisions", `needs an entry that records nis2_class "${doc.nis2_class}"`));
  }
  if (doc.nis2_class === "essential" || doc.nis2_class === "important") {
    if (!isDate(doc.nis2.decided_on)) {
      errors.push(issue("$.nis2.decided_on", "a decided class needs a decision date"));
    }
    requireNamedOwner("$.nis2.decided_by", doc.nis2.decided_by, errors);
  }
  assertDateOrder("$.nis2.decided_on", doc.nis2.decided_on, doc.last_reviewed, "decision date", "last_reviewed", errors);
  assertDateOrder("$.nis2.next_recheck", doc.nis2.decided_on, doc.nis2.next_recheck, "decision date", "next re-check", errors);

  const entityIds = new Set(doc.entities.map((entity) => entity.id));
  duplicateIds("$.entities", doc.entities.map((entity) => entity.id), errors);
  duplicateIds("$.assets", doc.assets.map((asset) => asset.id), errors);
  duplicateIds("$.findings", doc.findings.map((finding) => finding.id), errors);
  duplicateIds("$.risk_register.risks", doc.risk_register.risks.map((risk) => risk.id), errors);

  const referenced = [
    ...doc.assets.map((asset, index) => ({ path: `$.assets[${index}].entity_id`, id: asset.entity_id })),
    ...doc.suppliers.map((supplier, index) => ({ path: `$.suppliers[${index}].entity_id`, id: supplier.entity_id })),
  ];
  for (const ref of referenced) {
    if (!entityIds.has(ref.id)) {
      errors.push(issue(ref.path, `entity "${ref.id}" is referenced but not defined`));
    }
  }

  doc.findings.forEach((finding, index) => {
    assertIso2022Control(`$.findings[${index}].control`, finding.control, errors);
  });
  doc.evidence.forEach((item, index) => {
    if (isPlaceholder(item.location)) {
      errors.push(issue(`$.evidence[${index}].location`, "every evidence row needs a location"));
    }
    if (!isDate(item.valid_until)) {
      errors.push(issue(`$.evidence[${index}].valid_until`, "every evidence row needs a refresh date"));
    }
    item.controls.forEach((control, controlIndex) => {
      assertIso2022Control(`$.evidence[${index}].controls[${controlIndex}]`, control, errors);
    });
    assertDateOrder(
      `$.evidence[${index}].collected`,
      item.collected,
      item.valid_until,
      "collected",
      "valid_until",
      errors,
    );
  });

  const covered = new Map<number, string>();
  doc.risk_register.bands.forEach((band, index) => {
    if (band.min > band.max) {
      errors.push(issue(`$.risk_register.bands[${index}]`, "min is greater than max"));
      return;
    }
    for (let score = band.min; score <= band.max; score += 1) {
      const previous = covered.get(score);
      if (previous) {
        errors.push(issue(`$.risk_register.bands[${index}]`, `score ${score} is also covered by "${previous}"`));
      }
      covered.set(score, band.label);
    }
  });
  for (let score = 1; score <= 25; score += 1) {
    if (!covered.has(score)) {
      errors.push(issue("$.risk_register.bands", `score ${score} has no band`));
    }
  }
  doc.risk_register.risks.forEach((risk, index) => {
    const inherent = risk.inherent_likelihood * risk.inherent_impact;
    const residual = risk.residual_likelihood * risk.residual_impact;
    if (!bandForScore(inherent, doc.risk_register.bands) || !bandForScore(residual, doc.risk_register.bands)) {
      errors.push(issue(`$.risk_register.risks[${index}]`, "score falls outside the declared bands"));
    }
  });
  assertDateOrder(
    "$.risk_register.last_full_review",
    doc.risk_register.last_full_review,
    doc.last_reviewed,
    "last full review",
    "last_reviewed",
    errors,
  );

  doc.decisions.forEach((decision, index) => {
    assertDateOrder(`$.decisions[${index}].date`, decision.date, doc.last_reviewed, "decision date", "last_reviewed", errors);
  });
  doc.approved_facts.forEach((fact, index) => {
    requireNamedOwner(`$.approved_facts[${index}].approved_by`, fact.approved_by, errors);
    if (isPlaceholder(fact.wording)) {
      errors.push(issue(`$.approved_facts[${index}].wording`, "approved wording cannot be a placeholder"));
    }
    assertDateOrder(`$.approved_facts[${index}].date`, fact.date, doc.last_reviewed, "approval date", "last_reviewed", errors);
  });

  let previousChange = "";
  doc.change_history.forEach((change, index) => {
    assertDateOrder(`$.change_history[${index}].date`, change.date, doc.last_reviewed, "change date", "last_reviewed", errors);
    if (previousChange && change.date < previousChange) {
      errors.push(issue(`$.change_history[${index}].date`, "change history is not in date order"));
    }
    previousChange = change.date;
    requireNamedOwner(`$.change_history[${index}].approved_by`, change.approved_by, errors);
  });
  const latest = doc.change_history[doc.change_history.length - 1];
  if (latest && latest.version !== doc.truth_file_version) {
    errors.push(issue("$.change_history", `latest version ${latest.version} does not match truth_file_version`));
  }

  doc.regulatory_watch.forEach((item, index) => {
    assertDateOrder(
      `$.regulatory_watch[${index}].last_checked`,
      item.last_checked,
      doc.last_reviewed,
      "last checked",
      "last_reviewed",
      errors,
    );
    assertDateOrder(
      `$.regulatory_watch[${index}].next_check`,
      item.last_checked,
      item.next_check,
      "last checked",
      "next check",
      errors,
    );
  });

  const approvedPrices = new Set(doc.shared_facts.approved_prices);
  walkPrices(doc, "$", approvedPrices, errors);
  walkSecrets(doc, "$", errors);
  return errors;
}

export function validateTruthFile(document: unknown, options: ValidateOptions = {}): ValidationResult {
  const schemaErrors = validateAgainstSchema(document, loadTruthFileSchema()).map(splitSchemaError);
  if (schemaErrors.length > 0 || !document || typeof document !== "object") {
    return { ok: false, errors: schemaErrors, document: null };
  }
  const today = options.today ?? utcToday();
  const errors = semanticErrors(document as TruthFile, today);
  return {
    ok: errors.length === 0,
    errors,
    document: errors.length === 0 ? (document as TruthFile) : null,
  };
}

export function validateTruthFileAtPath(filePath: string, options: ValidateOptions = {}): ValidationResult {
  let document: unknown;
  try {
    document = readTruthFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not parse the file";
    return { ok: false, errors: [issue("$", message)], document: null };
  }
  return validateTruthFile(document, options);
}
