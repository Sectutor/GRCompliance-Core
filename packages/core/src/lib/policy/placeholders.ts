/**
 * Placeholders the template editor tells authors they can use.
 * Policy generation must substitute every one of these.
 * Keep this list as the only copy — PolicyTemplates.tsx renders it.
 */
export const ADVERTISED_POLICY_PLACEHOLDERS = [
    "{{company_name}}",
    "{{system_scope}}",
    "{{policy_name}}",
    "{{effective_date}}",
    "{{review_date}}",
] as const;

/**
 * Inserted when neither a tailoring answer nor a workspace scope statement
 * is available. Bracketed on purpose, same style as [Industry] and [CISO Name],
 * so an author can see and replace it. Never leave the raw {{system_scope}} token.
 */
export const MISSING_SYSTEM_SCOPE = "[System Scope]";

/** Used only when a policy is generated without a template or policy title. */
export const MISSING_POLICY_NAME = "[Policy Name]";

export interface PolicyVariableClient {
    name: string;
    industry?: string | null;
    cisoName?: string | null;
    dpoName?: string | null;
    headquarters?: string | null;
    mainServiceRegion?: string | null;
    region?: string | null;
    primaryContactEmail?: string | null;
    legalEntityName?: string | null;
}

export interface PolicySubstitutionContext {
    policyName?: string | null;
    /**
     * Workspace scope statement, plain text or HTML.
     * Null/blank means the workspace has not stated one.
     */
    workspaceScope?: string | null;
    /** Clock for {{effective_date}} and {{review_date}}. Defaults to now. */
    now?: Date;
}

function containsPlaceholder(text: string, name: string): boolean {
    return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "i").test(text);
}

/** Reduce rich-text scope statements to a single line. Already-plain text is unchanged. */
export function plainText(value: string | null | undefined): string {
    if (!value) return "";
    return value
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePattern(input: string, pattern: string, value: string): string {
    // A function replacer inserts `$&` / `$1` literally. String replacers do not.
    return input.replace(new RegExp(pattern, "gi"), () => value);
}

function readNamedAnswer(answers: Record<string, unknown> | null | undefined, key: string): string | null {
    if (!answers) return null;
    for (const [rawKey, rawValue] of Object.entries(answers)) {
        if (rawKey.trim().toLowerCase() !== key) continue;
        if (rawValue == null) continue;
        const text = String(rawValue).trim();
        if (!text || containsPlaceholder(text, key)) continue;
        return text;
    }
    return null;
}

/**
 * {{system_scope}} resolution, in order:
 * 1. A non-blank tailoring answer keyed system_scope (any case).
 * 2. The workspace's stated scope, when one is stored.
 * 3. The visible marker MISSING_SYSTEM_SCOPE.
 */
export function resolveSystemScope(options: {
    answers?: Record<string, unknown> | null;
    workspaceScope?: string | null;
}): string {
    const fromAnswer = readNamedAnswer(options.answers, "system_scope");
    if (fromAnswer) return fromAnswer;

    const fromWorkspace = plainText(options.workspaceScope);
    if (fromWorkspace && !containsPlaceholder(fromWorkspace, "system_scope")) {
        return fromWorkspace;
    }

    return MISSING_SYSTEM_SCOPE;
}

export function resolvePolicyName(name?: string | null): string {
    const text = name?.replace(/\s+/g, " ").trim() ?? "";
    if (!text || /\{\{\s*policy_name\s*\}\}/i.test(text)) return MISSING_POLICY_NAME;
    return text;
}

function formatPolicyDate(date: Date): string {
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * A newly created policy is AI-generated only when this request's model call
 * returned the draft. A client-supplied isAiGenerated flag is not an input.
 */
export function createdPolicyIsAiGenerated(
    generation: { aiGenerated?: boolean } | null | undefined,
): boolean {
    return generation?.aiGenerated === true;
}

export function substitutePolicyVariables(
    content: string,
    client: PolicyVariableClient,
    answers: Record<string, unknown> = {},
    context: PolicySubstitutionContext = {},
): string {
    const today = context.now ? new Date(context.now.getTime()) : new Date();
    const effectiveDate = formatPolicyDate(today);
    const reviewDate = new Date(today.getTime());
    reviewDate.setFullYear(reviewDate.getFullYear() + 1);
    const reviewDateStr = formatPolicyDate(reviewDate);

    const companyName = client.name || "[Company Name]";
    const systemScope = resolveSystemScope({
        answers,
        workspaceScope: context.workspaceScope,
    });
    const policyName = resolvePolicyName(context.policyName);

    const replacements: Record<string, string | null | undefined> = {
        "\\{\\{\\s*CLIENT_NAME\\s*\\}\\}": companyName,
        "\\{\\{\\s*COMPANY_NAME\\s*\\}\\}": companyName,
        "\\[COMPANY NAME\\]": companyName,
        "\\[CLIENT NAME\\]": companyName,
        "Company's Name": companyName,
        "\\[Company Name\\]": companyName,
        "\\[Organization Name\\]": companyName,

        "{{INDUSTRY}}": client.industry || "[Industry]",
        "\\[INDUSTRY\\]": client.industry || "[Industry]",
        "\\[Industry\\]": client.industry || "[Industry]",

        "{{CISO_NAME}}": client.cisoName || "[CISO Name]",
        "\\[CISO NAME\\]": client.cisoName || "[CISO Name]",
        "\\[CISO Name\\]": client.cisoName || "[CISO Name]",
        "Approved By: \\[CISO Name\\]": `Approved By: ${client.cisoName || "[CISO Name]"}`,

        "{{DPO_NAME}}": client.dpoName || "[DPO Name]",
        "\\[DPO NAME\\]": client.dpoName || "[DPO Name]",
        "\\[DPO Name\\]": client.dpoName || "[DPO Name]",

        "{{HEADQUARTERS}}": client.headquarters || "[Headquarters Location]",
        "\\[HEADQUARTERS\\]": client.headquarters || "[Headquarters Location]",
        "\\[Headquarters\\]": client.headquarters || "[Headquarters Location]",
        "\\[Location\\]": client.headquarters || "[Location]",

        "{{REGION}}": client.mainServiceRegion || client.region || "[Region]",
        "\\[REGION\\]": client.mainServiceRegion || client.region || "[Region]",
        "\\[Region\\]": client.mainServiceRegion || client.region || "[Region]",

        "{{CONTACT_EMAIL}}": client.primaryContactEmail || "[Contact Email]",
        "\\[CONTACT EMAIL\\]": client.primaryContactEmail || "[Contact Email]",
        "\\[Contact Email\\]": client.primaryContactEmail || "[Contact Email]",

        "{{LEGAL_ENTITY_NAME}}": client.legalEntityName || companyName,
        "\\[Legal Entity Name\\]": client.legalEntityName || companyName,

        "\\{\\{\\s*EFFECTIVE_DATE\\s*\\}\\}": effectiveDate,
        "\\[Date\\]": effectiveDate,
        "\\[Effective Date\\]": effectiveDate,
        "Effective Date: \\[Date\\]": `Effective Date: ${effectiveDate}`,

        "\\{\\{\\s*REVIEW_DATE\\s*\\}\\}": reviewDateStr,
        "\\[Date \\+ 1 Year\\]": reviewDateStr,
        "\\[Review Date\\]": reviewDateStr,
        "Review Date: \\[Date \\+ 1 Year\\]": `Review Date: ${reviewDateStr}`,

        "\\{\\{\\s*POLICY_NAME\\s*\\}\\}": policyName,
        "\\{\\{\\s*SYSTEM_SCOPE\\s*\\}\\}": systemScope,

        "{{VERSION}}": "1.0",
        "\\[Version\\]": "1.0",
    };

    let replaced = content;
    for (const [pattern, value] of Object.entries(replacements)) {
        const text = value || `[Missing ${pattern.replace(/\\/g, "")}]`;
        replaced = replacePattern(replaced, pattern, text);
    }

    // Tailoring answers override the built-in map. Keys are escaped so a
    // user-supplied key cannot be compiled as a regular expression.
    for (const [key, raw] of Object.entries(answers)) {
        const trimmedKey = key.trim();
        if (!trimmedKey || raw == null) continue;
        const value = String(raw);
        if (!value.trim()) continue;
        // system_scope and policy_name are already resolved above, including
        // their fallbacks. Re-applying a blank-equivalent token would undo that.
        if (trimmedKey.toLowerCase() === "system_scope" || trimmedKey.toLowerCase() === "policy_name") {
            continue;
        }
        const token = escapeRegExp(trimmedKey);
        replaced = replacePattern(replaced, `\\{\\{\\s*${token}\\s*\\}\\}`, value);
        replaced = replacePattern(replaced, `\\[${token}\\]`, value);
    }

    // Answers are inserted literally and can reintroduce a token. Sweep the
    // advertised set one last time so a raw {{...}} never survives.
    const advertised: Record<string, string> = {
        company_name: companyName,
        system_scope: systemScope,
        policy_name: policyName,
        effective_date: effectiveDate,
        review_date: reviewDateStr,
    };
    for (const [name, value] of Object.entries(advertised)) {
        replaced = replacePattern(replaced, `\\{\\{\\s*${name}\\s*\\}\\}`, value);
    }

    return replaced;
}
