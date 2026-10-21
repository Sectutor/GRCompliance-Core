const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/**
 * Escape a value for insertion into HTML text or a double-quoted attribute.
 * One pass, so "&" in the replacements is not escaped again.
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Collapse CR/LF so a policy name cannot break out of an email subject. */
export function sanitizeEmailSubject(value: string): string {
    return value.replace(/[\r\n]+/g, " ").replace(/[ \t]{2,}/g, " ").trim().slice(0, 200);
}
