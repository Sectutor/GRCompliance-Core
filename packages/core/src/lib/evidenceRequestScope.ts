export type EvidenceRequestScopeInput = {
    clientId?: number | null;
    clientControlId?: number | null;
};

/**
 * Both ids are kept when the caller sends both.
 * Filtering on the workspace alone must not drop the control.
 */
export function evidenceRequestScope(input: EvidenceRequestScopeInput): {
    clientId?: number;
    clientControlId?: number;
} {
    const scope: { clientId?: number; clientControlId?: number } = {};
    if (typeof input.clientId === "number") scope.clientId = input.clientId;
    if (typeof input.clientControlId === "number") scope.clientControlId = input.clientControlId;
    return scope;
}
