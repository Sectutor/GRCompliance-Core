export type SoaControlRow = {
    status?: string | null;
    applicability?: string | null;
};

/** A control is out of the SoA scope when either field says it does not apply. */
export function isSoaExcluded(row: SoaControlRow): boolean {
    return row.applicability === "not_applicable" || row.status === "not_applicable";
}

export type SoaStats = {
    total: number;
    applicable: number;
    implemented: number;
    excluded: number;
    rate: number | null;
};

/**
 * Readiness denominator is applicable controls (total minus excluded).
 * Implemented counts only controls that are still in scope.
 */
export function soaStats(rows: SoaControlRow[]): SoaStats {
    const total = rows.length;
    const inScope = rows.filter((row) => !isSoaExcluded(row));
    const implemented = inScope.filter((row) => row.status === "implemented").length;
    const applicable = inScope.length;
    const excluded = total - applicable;
    const rate = applicable > 0 ? Math.round((implemented / applicable) * 100) : null;
    return { total, applicable, implemented, excluded, rate };
}
