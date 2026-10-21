/** The rows evidence.create closes: open requests for this control in this workspace. */
export function openEvidenceRequestLink(link: { clientId: number; clientControlId: number }) {
    return {
        clientId: link.clientId,
        clientControlId: link.clientControlId,
        status: "open" as const,
    };
}

export function requestClosedByEvidenceLink(
    request: { clientId: number; clientControlId: number; status: string | null },
    link: { clientId: number; clientControlId: number },
): boolean {
    const target = openEvidenceRequestLink(link);
    return request.clientId === target.clientId
        && request.clientControlId === target.clientControlId
        && request.status === target.status;
}
