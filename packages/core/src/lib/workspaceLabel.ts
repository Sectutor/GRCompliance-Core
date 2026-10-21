/**
 * Label for a workspace breadcrumb.
 * Uses the workspace name when it has loaded. Falls back to "Client {id}"
 * only while the name is missing, so a slow fetch does not leave the crumb blank.
 */
export function workspaceBreadcrumbLabel(
    name: string | null | undefined,
    clientId: number | string,
): string {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (trimmed.length > 0) return trimmed;
    return `Client ${clientId}`;
}
