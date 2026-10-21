/**
 * "No evidence yet" means the control has no evidence rows.
 * Verified OK is a separate count. A control with pending or collected evidence
 * is not missing a document; it is waiting to be verified.
 */
export function hasNoEvidence(statuses: readonly (string | null | undefined)[]): boolean {
    return statuses.length === 0;
}

export function hasVerifiedEvidence(statuses: readonly (string | null | undefined)[]): boolean {
    return statuses.some((status) => status === "verified");
}

export function matchesEvidenceStatusFilter(
    statuses: readonly (string | null | undefined)[],
    statusFilter: string,
): boolean {
    if (statusFilter === "all") return true;
    if (statusFilter === "no_evidence" || statusFilter === "need_documents") return hasNoEvidence(statuses);
    if (statusFilter === "ok") return hasVerifiedEvidence(statuses);
    return true;
}

export function evidenceCollectionStats(rows: { statuses: readonly (string | null | undefined)[] }[]) {
    const total = rows.length;
    const verified = rows.filter((row) => hasVerifiedEvidence(row.statuses)).length;
    const noEvidence = rows.filter((row) => hasNoEvidence(row.statuses)).length;
    const completion = total === 0 ? 0 : Math.round((verified / total) * 100);
    return { total, verified, noEvidence, completion };
}
