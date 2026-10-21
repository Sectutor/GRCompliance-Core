/**
 * Decisions for correcting the Latore LTD demo seed.
 * Database writes live in db.ts. These helpers never delete rows.
 */

export const DEMO_WORKSPACE_NAME = "Latore LTD";

/** client_control_id values the demo status cycle marks not_applicable. */
export const DEMO_NOT_APPLICABLE_CONTROL_IDS = ["CC-007", "CC-014", "CC-021", "CC-028"] as const;

/** How many controls bulkAssign writes for the Latore demo (ISO 27001, SOC 2, NIS2). */
export const DEMO_SEEDED_CONTROL_COUNT = 30;

export const FIREWALL_EVIDENCE_REQUEST = "Please provide the latest firewall configuration backup.";

/**
 * Catalog control the firewall backup request belongs on.
 * The demo catalog has no dedicated firewall control; A.8.16 covers network monitoring.
 */
export const FIREWALL_EVIDENCE_CONTROL_CODE = "A.8.16";

export const DEMO_STATUS_CYCLE = [
    "implemented",
    "implemented",
    "in_progress",
    "not_implemented",
    "implemented",
    "in_progress",
    "not_applicable",
] as const;

const SEED_CONTROL_CODE = /^CC-(\d{3})$/;

export function isDemoSeedControlCode(clientControlId: string | null | undefined): boolean {
    if (!clientControlId) return false;
    const match = SEED_CONTROL_CODE.exec(clientControlId);
    if (!match) return false;
    const number = Number(match[1]);
    return number >= 1 && number <= DEMO_SEEDED_CONTROL_COUNT;
}

export function demoControlPatch(index: number): {
    status: (typeof DEMO_STATUS_CYCLE)[number];
    applicability?: "not_applicable";
} {
    const status = DEMO_STATUS_CYCLE[index % DEMO_STATUS_CYCLE.length];
    if (status === "not_applicable") return { status, applicability: "not_applicable" };
    return { status };
}

/**
 * Returns the applicability to write, or null when the row must be left alone.
 * Only the four seeded not-applicable controls are eligible, and only while they
 * still have that status and the default applicability.
 */
export function demoApplicabilityRepair(row: {
    clientControlId: string | null;
    status: string | null;
    applicability: string | null;
}): "not_applicable" | null {
    if (!row.clientControlId) return null;
    if (!(DEMO_NOT_APPLICABLE_CONTROL_IDS as readonly string[]).includes(row.clientControlId)) return null;
    if (row.status !== "not_applicable") return null;
    if (row.applicability === "not_applicable") return null;
    if (row.applicability != null && row.applicability !== "applicable") return null;
    return "not_applicable";
}

/**
 * The seeded firewall request is identified by its exact description and a demo
 * control code (CC-001..CC-030). Anything else, including a request already on
 * A.8.16, is left where it is.
 */
export function shouldRetargetFirewallRequest(row: {
    description: string | null;
    clientControlCode: string | null;
    masterControlId: string | null;
}): boolean {
    if (row.description !== FIREWALL_EVIDENCE_REQUEST) return false;
    if (row.masterControlId === FIREWALL_EVIDENCE_CONTROL_CODE) return false;
    return isDemoSeedControlCode(row.clientControlCode);
}
