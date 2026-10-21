export const LIBRARY_CONTROL_STATUSES = ["active", "inactive", "draft"] as const;

export const WORKSPACE_IMPLEMENTATION_STATUSES = [
    "not_implemented",
    "in_progress",
    "implemented",
    "not_applicable",
] as const;

/** Keep only statuses that exist on the global control record. */
export function libraryStatusFilter(selected: Array<string | null | undefined> | undefined): string[] {
    const allowed = new Set<string>(LIBRARY_CONTROL_STATUSES);
    return (selected || []).filter((status): status is string => !!status && allowed.has(status));
}

export function libraryStatusCondition(selected: string | string[] | undefined): string[] {
    const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
    return libraryStatusFilter(list);
}

type WorkspaceControlRow = {
    control?: { framework?: string | null } | null;
    clientControl: { status?: string | null };
};

/** Framework and implementation-status filters for Governance → Controls. */
export function filterWorkspaceControls<T extends WorkspaceControlRow>(
    rows: T[],
    filters: { framework?: string; status?: string }
): T[] {
    return rows.filter((row) => {
        if (filters.framework && filters.framework !== "all") {
            if ((row.control?.framework || "Uncategorized") !== filters.framework) return false;
        }
        if (filters.status && filters.status !== "all" && row.clientControl.status !== filters.status) return false;
        return true;
    });
}
