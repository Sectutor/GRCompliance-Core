import { policyStatusEnum } from "../../schema";

type PolicyStatus = (typeof policyStatusEnum.enumValues)[number];

/**
 * Status stored on client_policies after review approval and after publish.
 * `published` is not a policy_status value; publish writes `approved`.
 */
export const APPROVED_POLICY_STATUS = "approved" satisfies PolicyStatus;

/**
 * Module the policies page lists when the query omits `module`.
 * The Policy Coverage card links to that page, so its total uses the same set.
 */
export const POLICIES_LIST_MODULE = "general";

/** Statuses the governance health score may treat as approved. */
export const HEALTH_SCORE_APPROVED_STATUSES = [APPROVED_POLICY_STATUS] as const satisfies readonly PolicyStatus[];

/**
 * SQL predicate for those statuses. String literals (not bound text params)
 * so Postgres can cast them to policy_status.
 */
export function approvedPolicyStatusClause(column = "status"): string {
  return HEALTH_SCORE_APPROVED_STATUSES.map((status) => `${column} = '${status}'`).join(" or ");
}

export type PolicyApprovalSource = {
  status?: string | null;
  module?: string | null;
  clientPolicy?: {
    status?: string | null;
    module?: string | null;
  } | null;
};

function policyRecord(row: PolicyApprovalSource): { status?: string | null; module?: string | null } | null {
  // getClientPolicies and the policies list both return { clientPolicy, template }.
  // Status on the wrapper is always undefined.
  if ("clientPolicy" in row) return row.clientPolicy ?? null;
  return row;
}

/** Approved and total counts for the policies page (module = general). */
export function policyApprovalStats(rows: readonly PolicyApprovalSource[]): { approved: number; total: number } {
  let approved = 0;
  let total = 0;

  for (const row of rows) {
    if (!row) continue;
    const policy = policyRecord(row);
    if (!policy || policy.module !== POLICIES_LIST_MODULE) continue;
    total += 1;
    if (policy.status === APPROVED_POLICY_STATUS) approved += 1;
  }

  return { approved, total };
}
