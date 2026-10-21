export interface TreatmentControlLink {
    treatmentId: number;
    controlId: number;
}

export interface ClientControlNameRow {
    id: number;
    controlId?: number | null;
    customDescription?: string | null;
    clientControlId?: string | null;
}

export interface DictionaryControlName {
    id: number;
    name?: string | null;
}

export interface NamedTreatmentControl {
    id: number;
    name: string;
}

function firstText(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    return "";
}

export function controlDisplayName(
    clientControl: ClientControlNameRow,
    dictionary: DictionaryControlName[],
): string {
    const match = dictionary.find((item) => item.id === clientControl.controlId);
    return firstText(match?.name, clientControl.customDescription, clientControl.clientControlId)
        || `Control ${clientControl.id}`;
}

/** Names for the controls linked to one treatment. Linked ids with no client-control row still appear. */
export function controlsForTreatment(
    treatmentId: number,
    links: TreatmentControlLink[],
    clientRows: ClientControlNameRow[],
    dictionary: DictionaryControlName[],
): NamedTreatmentControl[] {
    return links
        .filter((link) => link.treatmentId === treatmentId)
        .map((link) => {
            const row = clientRows.find((item) => item.id === link.controlId);
            if (!row) return { id: link.controlId, name: `Control ${link.controlId}` };
            return { id: row.id, name: controlDisplayName(row, dictionary) };
        });
}
