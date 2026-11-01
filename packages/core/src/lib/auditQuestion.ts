const UNCOUNTABLE_HEADS = new Set([
    "access",
    "information",
    "business",
    "evidence",
    "data",
    "compliance",
    "risk",
    "security",
    "change",
    "incident",
    "asset",
    "personnel",
    "logging",
]);

function headWord(name: string): string {
    return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function headIsPlural(name: string): boolean {
    const head = headWord(name);
    if (!head || UNCOUNTABLE_HEADS.has(head)) return false;
    if (/(?:ss|us|is|ness)$/.test(head)) return false;
    return head.endsWith("s");
}

function phrase(name: string): string {
    const trimmed = name.trim();
    const second = trimmed.charAt(1);
    if (second && second === second.toUpperCase() && second !== second.toLowerCase()) {
        return trimmed;
    }
    return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/**
 * Question shown for a control on Audit Readiness.
 * A plural first word ("Policies…") uses "Are the". Other names use a
 * neutral sentence so "Is the Logical Access Controls" never appears.
 */
export function auditReadinessQuestion(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "Is this control implemented and effective?";
    if (trimmed.endsWith("?")) return trimmed;
    if (headIsPlural(trimmed)) {
        return `Are the ${phrase(trimmed)} implemented and effective?`;
    }
    const rest = trimmed.slice(headWord(trimmed).length);
    if (/\b(controls|policies|procedures|records)\b/i.test(rest)) {
        return `Is this control implemented and effective: ${trimmed}?`;
    }
    return `Is the ${phrase(trimmed)} implemented and effective?`;
}
