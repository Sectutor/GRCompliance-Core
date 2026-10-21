/**
 * Workspace evidence IDs keep whatever prefix the workspace already uses.
 * LTD-EV-008 becomes LTD-EV-009. A workspace with no evidence starts at EVD-001.
 */

const TRAILING_NUMBER = /^(.*?)(\d+)$/;

type ParsedEvidenceId = {
    prefix: string;
    num: number;
    width: number;
};

function parseEvidenceId(value: string): ParsedEvidenceId | null {
    const match = value.trim().match(TRAILING_NUMBER);
    if (!match || !match[2]) return null;
    const num = Number.parseInt(match[2], 10);
    if (!Number.isFinite(num)) return null;
    return { prefix: match[1], num, width: match[2].length };
}

export function nextEvidenceId(existingIds: Array<string | null | undefined>): string {
    const parsed = existingIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map(parseEvidenceId)
        .filter((id): id is ParsedEvidenceId => id !== null);

    if (parsed.length === 0) return "EVD-001";

    const groups = new Map<string, ParsedEvidenceId[]>();
    for (const item of parsed) {
        const group = groups.get(item.prefix) ?? [];
        group.push(item);
        groups.set(item.prefix, group);
    }

    let best: ParsedEvidenceId[] = [];
    for (const group of groups.values()) {
        if (group.length > best.length) {
            best = group;
            continue;
        }
        if (group.length === best.length && best.length > 0) {
            const bestMax = Math.max(...best.map((item) => item.num));
            const groupMax = Math.max(...group.map((item) => item.num));
            if (groupMax > bestMax) best = group;
        }
    }

    const current = best.reduce((max, item) => (item.num > max.num ? item : max));
    return `${current.prefix}${String(current.num + 1).padStart(current.width, "0")}`;
}

/**
 * Keep a caller-supplied id when it is free. Otherwise allocate the next id
 * from the workspace's existing scheme so two forms cannot collide on EVD-001.
 */
export function resolveEvidenceId(
    existingIds: Array<string | null | undefined>,
    requested?: string | null
): string {
    const trimmed = requested?.trim();
    const taken = new Set(
        existingIds.filter((id): id is string => typeof id === "string").map((id) => id.trim())
    );
    if (trimmed && !taken.has(trimmed)) return trimmed;
    return nextEvidenceId(existingIds);
}
