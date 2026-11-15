/**
 * The Controls page badge is the number of assigned control rows, including
 * not-applicable rows. Summary cards use this same total.
 */
export type AssignedControlCounts = {
    total: number;
    implemented: number;
};

export function assignedControlCounts(statuses: Array<string | null | undefined>): AssignedControlCounts {
    let implemented = 0;
    for (const status of statuses) {
        if (status === "implemented") implemented += 1;
    }
    return { total: statuses.length, implemented };
}

export function assignedControlLabel(counts: AssignedControlCounts): string {
    return `${counts.implemented}/${counts.total}`;
}

export function assignedControlRate(counts: AssignedControlCounts): number | null {
    if (counts.total === 0) return null;
    return Math.round((counts.implemented / counts.total) * 100);
}

/** Hide the import button once this workspace already has assigned controls. */
export function shouldOfferDemoImport(controlCount: number): boolean {
    return controlCount === 0;
}
