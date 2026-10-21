export type ControlMappingEdge = {
    sourceControlId?: number | null;
    targetControlId?: number | null;
};

export type LinkedEvidence<T = unknown> = T & {
    control?: { id?: number | null } | null;
};

/**
 * Master controls connected by framework mappings, including the starting control.
 * This is the relation the Evidence page uses when it shows a chip on a control.
 */
export function equivalentControlIds(
    controlId: number,
    mappings: ControlMappingEdge[] | null | undefined
): Set<number> {
    const graph = new Map<number, Set<number>>();
    for (const mapping of mappings ?? []) {
        const source = mapping.sourceControlId;
        const target = mapping.targetControlId;
        if (source == null || target == null) continue;
        if (!graph.has(source)) graph.set(source, new Set());
        if (!graph.has(target)) graph.set(target, new Set());
        graph.get(source)!.add(target);
        graph.get(target)!.add(source);
    }

    const equivalents = new Set<number>([controlId]);
    const queue = [controlId];
    const visited = new Set<number>([controlId]);
    while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = graph.get(current);
        if (!neighbors) continue;
        for (const neighbor of neighbors) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);
            equivalents.add(neighbor);
            queue.push(neighbor);
        }
    }
    return equivalents;
}

export function evidenceLinkedToControl<T>(
    evidence: Array<LinkedEvidence<T>> | null | undefined,
    masterControlId: number | null | undefined,
    mappings: ControlMappingEdge[] | null | undefined
): Array<LinkedEvidence<T>> {
    if (!evidence || masterControlId == null) return [];
    const ids = equivalentControlIds(masterControlId, mappings);
    return evidence.filter((item) => {
        const id = item.control?.id;
        return id != null && ids.has(id);
    });
}
