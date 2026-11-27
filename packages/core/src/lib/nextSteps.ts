/**
 * Four plain next steps for a workspace. Pure so the rules can be tested
 * without a database. Queries that feed this stay scoped to one client id.
 */

export type NextStepRule = "no_framework" | "unowned_controls" | "missing_evidence" | "overdue_reviews";

export type NextStepItem = {
    rule: NextStepRule;
    title: string;
    detail: string;
    href: string;
};

export type NextStepsSnapshot = {
    clientId: number;
    now: string;
    frameworks: string[];
    controls: {
        id: number;
        code: string;
        title: string;
        owner: string | null;
        dueDate: string | null;
        evidenceCount: number;
    }[];
    policies: {
        id: number;
        title: string;
        reviewDueDate: string | null;
    }[];
};

export type NextStepsResult = {
    done: number;
    total: number;
    items: NextStepItem[];
};

export const NATIVE_FRAMEWORKS = new Set([
    "SAMM",
    "ASVS",
    "SCVS",
    "WSTG",
    "MASVS",
    "MASTG",
    "OPENSSF",
    "AISVS",
    "WEB-T10",
    "API-T10",
]);

const RULES: NextStepRule[] = ["no_framework", "unowned_controls", "missing_evidence", "overdue_reviews"];

function chosenFrameworks(names: string[]): string[] {
    return names
        .map((name) => name.trim())
        .filter((name) => name && !NATIVE_FRAMEWORKS.has(name));
}

function past(due: string | null, now: string): boolean {
    if (!due) return false;
    const dueDay = due.slice(0, 10);
    const today = now.slice(0, 10);
    return dueDay < today;
}

export function buildNextSteps(snapshot: NextStepsSnapshot): NextStepsResult {
    const base = `/clients/${snapshot.clientId}`;
    const items: NextStepItem[] = [];
    const open = new Set<NextStepRule>();

    if (chosenFrameworks(snapshot.frameworks).length === 0) {
        open.add("no_framework");
        items.push({
            rule: "no_framework",
            title: "Pick a framework",
            detail: "Choose the standard you want to work towards, such as ISO 27001 or SOC 2.",
            href: `${base}/settings`,
        });
    }

    const unowned = snapshot.controls.filter((control) => !control.owner || !control.owner.trim());
    if (unowned.length > 0) {
        open.add("unowned_controls");
        const first = unowned[0];
        items.push({
            rule: "unowned_controls",
            title: unowned.length === 1 ? "1 control has no owner" : `${unowned.length} controls have no owner`,
            detail: `${first.code || "A control"} ${first.title ? `(${first.title}) ` : ""}needs a person responsible for it.`,
            href: `${base}/controls`,
        });
    }

    const missing = snapshot.controls.filter((control) => control.evidenceCount === 0);
    if (missing.length > 0) {
        open.add("missing_evidence");
        items.push({
            rule: "missing_evidence",
            title: missing.length === 1 ? "1 control has no evidence" : `${missing.length} controls have no evidence`,
            detail: "Link a file or note that shows the control is in place.",
            href: `${base}/evidence`,
        });
    }

    const overdueControls = snapshot.controls.filter((control) => past(control.dueDate, snapshot.now));
    const overduePolicies = snapshot.policies.filter((policy) => past(policy.reviewDueDate, snapshot.now));
    if (overdueControls.length + overduePolicies.length > 0) {
        open.add("overdue_reviews");
        const policy = overduePolicies[0];
        items.push({
            rule: "overdue_reviews",
            title: "A review is overdue",
            detail: policy
                ? `${policy.title} was due for review.`
                : `${overdueControls[0].code || "A control"} is past its review date.`,
            href: policy ? `${base}/policies/${policy.id}` : `${base}/controls`,
        });
    }

    return {
        done: RULES.length - open.size,
        total: RULES.length,
        items: items.slice(0, 5),
    };
}
