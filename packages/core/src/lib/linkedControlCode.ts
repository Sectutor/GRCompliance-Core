/** Client control code (CC-006) when the workspace has one, otherwise the master control id. */
export function linkedControlCode(row: {
    clientControlCode?: string | null;
    masterControlId?: string | null;
}): string | null {
    const clientCode = row.clientControlCode?.trim();
    if (clientCode) return clientCode;
    const master = row.masterControlId?.trim();
    return master || null;
}

export function controlCodeFromEvidenceRow(row: {
    controlCode?: string | null;
    clientControl?: { clientControlId?: string | null } | null;
    control?: { controlId?: string | null } | null;
}): string | null {
    return row.controlCode || linkedControlCode({
        clientControlCode: row.clientControl?.clientControlId,
        masterControlId: row.control?.controlId,
    });
}
