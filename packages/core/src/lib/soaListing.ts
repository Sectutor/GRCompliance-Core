import {
    ANNEX_A_CONTROLS,
    LEGACY_ANNEX_REFERENCES,
    SEEDED_SHORT_TITLES,
    type AnnexControl,
    type AnnexTheme,
} from "../data/annexACatalog";

export type ExistingControlRef = {
    id: number;
    controlId: string;
    name: string | null;
};

export type CatalogRename = {
    id: number;
    from: string;
    to: string;
    name?: string;
};

export type CatalogTitleUpdate = {
    id: number;
    controlId: string;
    name: string;
};

export type CatalogInsert = {
    controlId: string;
    name: string;
    description: string;
    theme: AnnexTheme;
};

export type CatalogSyncPlan = {
    renames: CatalogRename[];
    titleUpdates: CatalogTitleUpdate[];
    inserts: CatalogInsert[];
};

/**
 * What to write into the global controls table.
 * Never deletes rows and never describes a client_controls change.
 * A legacy reference is renamed only when the 2022 id is not already present.
 * A short seed title is replaced only while the stored name is still that seed string.
 */
export function planAnnexACatalogSync(existing: readonly ExistingControlRef[]): CatalogSyncPlan {
    const byCode = new Map(existing.map((row) => [row.controlId, { ...row }]));
    const renames: CatalogRename[] = [];

    for (const legacy of LEGACY_ANNEX_REFERENCES) {
        const row = byCode.get(legacy.from);
        if (!row) continue;
        if (byCode.has(legacy.to)) continue;
        const rename: CatalogRename = { id: row.id, from: legacy.from, to: legacy.to };
        if (row.name === legacy.seedName) rename.name = legacy.officialName;
        renames.push(rename);
        byCode.delete(legacy.from);
        byCode.set(legacy.to, {
            ...row,
            controlId: legacy.to,
            name: rename.name ?? row.name,
        });
    }

    const titleUpdates: CatalogTitleUpdate[] = [];
    for (const control of ANNEX_A_CONTROLS) {
        const row = byCode.get(control.controlId);
        if (!row) continue;
        const seedName = SEEDED_SHORT_TITLES[control.controlId];
        if (!seedName || row.name !== seedName || seedName === control.name) continue;
        titleUpdates.push({ id: row.id, controlId: control.controlId, name: control.name });
        row.name = control.name;
    }

    const inserts: CatalogInsert[] = ANNEX_A_CONTROLS
        .filter((control) => !byCode.has(control.controlId))
        .map((control) => ({
            controlId: control.controlId,
            name: control.name,
            description: control.description,
            theme: control.theme,
        }));

    return { renames, titleUpdates, inserts };
}

export type StoredAnnexControl = {
    id: number;
    controlId: string;
    name: string;
    description: string | null;
    framework: string;
    category: string | null;
};

export type AdoptedAnnexRow = {
    clientControl: {
        id: number;
        status: string | null;
        applicability: string | null;
        justification: string | null;
        implementationNotes: string | null;
        clientControlId: string | null;
    };
    control: { controlId: string };
};

export type SoaListEntry = {
    adopted: boolean;
    control: {
        id: number | null;
        controlId: string;
        name: string;
        description: string;
        framework: string;
        category: string | null;
        theme: AnnexTheme;
    };
    clientControl: {
        id: number | null;
        status: string;
        applicability: string | null;
        justification: string | null;
        implementationNotes: string | null;
        clientControlId: string | null;
    };
};

/**
 * Every Annex A control, in catalog order.
 * A workspace row keeps its status, justification, and any custom category.
 * Controls with no client_controls row are not yet assessed.
 */
export function mergeSoaListing(
    stored: readonly StoredAnnexControl[],
    adopted: readonly AdoptedAnnexRow[],
    catalog: readonly AnnexControl[] = ANNEX_A_CONTROLS,
): SoaListEntry[] {
    const storedByCode = new Map(stored.map((row) => [row.controlId, row]));
    const adoptedByCode = new Map<string, AdoptedAnnexRow>();
    for (const row of adopted) {
        if (!adoptedByCode.has(row.control.controlId)) {
            adoptedByCode.set(row.control.controlId, row);
        }
    }

    return catalog.map((item) => {
        const storedRow = storedByCode.get(item.controlId);
        const adoptedRow = adoptedByCode.get(item.controlId);
        const control = {
            id: storedRow?.id ?? null,
            controlId: item.controlId,
            name: storedRow?.name || item.name,
            description: storedRow?.description || item.description,
            framework: storedRow?.framework || "ISO 27001:2022",
            category: storedRow?.category ?? null,
            theme: item.theme,
        };
        if (!adoptedRow) {
            return {
                adopted: false,
                control,
                clientControl: {
                    id: null,
                    status: "not_assessed",
                    applicability: null,
                    justification: null,
                    implementationNotes: null,
                    clientControlId: null,
                },
            };
        }
        return {
            adopted: true,
            control,
            clientControl: {
                id: adoptedRow.clientControl.id,
                status: adoptedRow.clientControl.status || "not_implemented",
                applicability: adoptedRow.clientControl.applicability,
                justification: adoptedRow.clientControl.justification,
                implementationNotes: adoptedRow.clientControl.implementationNotes,
                clientControlId: adoptedRow.clientControl.clientControlId,
            },
        };
    });
}

export type SoaHeaderStats = {
    total: number;
    applicable: number;
    implemented: number;
    excluded: number;
    notAssessed: number;
};

export function isSoaEntryExcluded(row: { status?: string | null; applicability?: string | null }): boolean {
    return row.applicability === "not_applicable" || row.status === "not_applicable";
}

/** total = applicable + excluded + notAssessed. Implemented is a subset of applicable. */
export function soaHeaderStats(rows: readonly { adopted: boolean; clientControl: { status?: string | null; applicability?: string | null } }[]): SoaHeaderStats {
    let notAssessed = 0;
    let excluded = 0;
    let applicable = 0;
    let implemented = 0;
    for (const row of rows) {
        if (!row.adopted) {
            notAssessed += 1;
            continue;
        }
        if (isSoaEntryExcluded(row.clientControl)) {
            excluded += 1;
            continue;
        }
        applicable += 1;
        if (row.clientControl.status === "implemented") implemented += 1;
    }
    return { total: rows.length, applicable, implemented, excluded, notAssessed };
}

export function filterSoaEntries<T extends {
    control: {
        controlId: string;
        name: string;
        description?: string | null;
        theme?: string | null;
        category?: string | null;
    };
    clientControl: { justification?: string | null; status?: string | null };
}>(rows: readonly T[], query: string): T[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...rows];
    const exactReference = /^a\.\d+\.\d+$/i.test(needle);
    return rows.filter((row) => {
        const reference = row.control.controlId.toLowerCase();
        if (exactReference) return reference === needle;
        const haystack = [
            row.control.controlId,
            row.control.name,
            row.control.description,
            row.control.theme,
            row.control.category,
            row.clientControl.justification,
            row.clientControl.status,
        ].filter((part): part is string => !!part).join("\n").toLowerCase();
        return haystack.includes(needle);
    });
}

export function customCategoryLabel(category: string | null | undefined, theme: string | null | undefined): string | null {
    if (!category?.trim() || !theme?.trim()) return category?.trim() || null;
    const normalise = (value: string) => value.toLowerCase().replace(/\s+controls?$/, "").trim();
    if (normalise(category) === normalise(theme)) return null;
    return category.trim();
}

export function soaJustificationText(justification: string | null | undefined): string {
    const text = justification?.trim();
    return text ? text : "No justification recorded";
}

export function soaListLayout(viewMode: "list" | "grid"): string {
    if (viewMode === "grid") {
        return "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4";
    }
    return "divide-y divide-slate-50";
}

const IMPLEMENTATION_STATUSES = new Set(["not_implemented", "in_progress", "implemented"]);

export function soaAdoptionPatch(input: {
    applicability: "applicable" | "not_applicable";
    justification?: string | null;
    status?: string | null;
}): { error: string } | {
    applicability: "applicable" | "not_applicable";
    status: "not_implemented" | "in_progress" | "implemented" | "not_applicable";
    justification: string;
} {
    const justification = input.justification?.trim() ?? "";
    if (input.applicability === "not_applicable") {
        if (!justification) return { error: "Justification is required for excluded controls" };
        return { applicability: "not_applicable", status: "not_applicable", justification };
    }
    const status = input.status && IMPLEMENTATION_STATUSES.has(input.status)
        ? input.status as "not_implemented" | "in_progress" | "implemented"
        : "not_implemented";
    return { applicability: "applicable", status, justification };
}

export function soaApplicabilityValue(entry: { adopted: boolean; clientControl: { applicability?: string | null; status?: string | null } }): string {
    if (!entry.adopted) return "not_assessed";
    if (isSoaEntryExcluded(entry.clientControl)) return "not_applicable";
    return "applicable";
}
