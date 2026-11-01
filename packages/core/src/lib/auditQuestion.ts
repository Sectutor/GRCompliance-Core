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

/** Plural nouns that can be the thing the question is about. */
const PLURAL_NOUN = /\b(roles|responsibilities|policies|controls|procedures|records|duties|requirements|measures|processes|rights|assets|logs|rules|standards|conditions|terms|perimeters|facilities|devices|utilities|activities|principles|environments|agreements|threats)\b/i;

function headWord(name: string): string {
    return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function wordIsPlural(word: string): boolean {
    if (!word || UNCOUNTABLE_HEADS.has(word)) return false;
    if (/(?:ss|us|is|ness|ing)$/.test(word)) return false;
    return word.endsWith("s");
}

function headIsPlural(name: string): boolean {
    return wordIsPlural(headWord(name));
}

/**
 * The noun the question is about. "Segregation of duties" is about
 * segregation. "Information security roles and responsibilities" is about
 * the roles.
 */
function grammaticalHead(name: string): string {
    const ofMatch = /^(.*?)\s+of\s+/i.exec(name);
    if (ofMatch?.[1]) return ofMatch[1];
    const withMatch = /^(.*?)\s+with\s+/i.exec(name);
    if (withMatch?.[1]) return withMatch[1];
    return name;
}

function phraseIsPlural(name: string): boolean {
    const head = grammaticalHead(name);
    const first = headWord(head);
    if (first.endsWith("ing")) {
        const rest = head.slice(first.length).trim();
        // "Supporting utilities" is an adjective plus a plural noun.
        // "Securing offices, rooms and facilities" is a gerund with objects.
        if (PLURAL_NOUN.test(rest) && !/,/.test(rest) && !/\band\b/i.test(rest)) return true;
        return false;
    }
    if (headIsPlural(head)) return true;
    return PLURAL_NOUN.test(head);
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
 * A plural head ("roles and responsibilities", "Policies") uses "Are the".
 * A singular head ("Segregation of duties") uses "Is the".
 */
export function auditReadinessQuestion(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "Is this control implemented and effective?";
    if (trimmed.endsWith("?")) return trimmed;
    if (phraseIsPlural(trimmed)) {
        return `Are the ${phrase(trimmed)} implemented and effective?`;
    }
    return `Is the ${phrase(trimmed)} implemented and effective?`;
}
