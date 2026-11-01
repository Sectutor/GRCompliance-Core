export type ControlEvidenceRow = {
    id: number;
    description: string | null;
    type: string | null;
    location: string | null;
    owner: string | null;
    lastVerified: Date | string | null;
};

function asRow(value: unknown): ControlEvidenceRow | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    if (typeof source.id !== "number") return null;
    return {
        id: source.id,
        description: typeof source.description === "string" ? source.description : null,
        type: typeof source.type === "string" ? source.type : null,
        location: typeof source.location === "string" ? source.location : null,
        owner: typeof source.owner === "string" ? source.owner : null,
        lastVerified: (source.lastVerified as ControlEvidenceRow["lastVerified"]) ?? null,
    };
}

/**
 * Evidence rows for one control. `evidence.getByControl` returns flat rows.
 * `evidence.list` is flattened for reports and has no nested `evidence`
 * object, so a filter on `item.evidence.clientControlId` always counts zero.
 */
export function controlEvidenceRows(rows: unknown): ControlEvidenceRow[] {
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const record = row as Record<string, unknown>;
        const nested = asRow(record.evidence);
        if (nested) return [nested];
        const flat = asRow(record);
        return flat ? [flat] : [];
    });
}
