/** Stored owner is a person's name. A blank value clears it. */
export function normalizeControlOwner(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 255);
}
