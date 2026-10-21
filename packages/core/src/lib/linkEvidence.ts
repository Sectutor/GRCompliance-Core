/** Evidence can be linked only to a control in the same workspace. */
export function canLinkEvidenceToControl(
    evidenceClientId: number | null | undefined,
    controlClientId: number | null | undefined
): boolean {
    return evidenceClientId != null && evidenceClientId === controlClientId;
}
