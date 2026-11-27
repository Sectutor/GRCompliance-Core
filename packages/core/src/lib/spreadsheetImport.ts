/**
 * Plans a controls or risks CSV import. Pure: no database and no network.
 * Files are parsed in the browser. This module only checks the rows.
 */

export type SpreadsheetKind = "controls" | "risks";

export type PlannedAction = "create" | "update" | "skip";

export type PlannedRow = {
    index: number;
    action: PlannedAction;
    errors: string[];
    warnings: string[];
    values: Record<string, string | number | null>;
};

export type ImportSummary = {
    create: number;
    update: number;
    skipped: number;
    errors: number;
    warnings: number;
};

export type ImportPlan = {
    kind: SpreadsheetKind;
    rows: PlannedRow[];
    summary: ImportSummary;
};

const CONTROL_CODE_MAX = 50;
const CONTROL_TITLE_MAX = 255;
const RISK_TITLE_MAX = 500;
const TEXT_MAX = 8000;

const SCORE_WORDS: Record<string, number> = {
    "very low": 1,
    rare: 1,
    negligible: 1,
    low: 2,
    unlikely: 2,
    minor: 2,
    medium: 3,
    moderate: 3,
    possible: 3,
    high: 4,
    likely: 4,
    major: 4,
    "very high": 5,
    critical: 5,
    severe: 5,
    "almost certain": 5,
};

const RISK_STATUSES = new Set(["identified", "analyzed", "treated", "monitored"]);

function cell(row: Record<string, unknown>, key: string): string {
    const value = row[key];
    if (value == null) return "";
    return String(value).trim();
}

function clip(value: string, max: number, label: string, warnings: string[]): string {
    if (value.length <= max) return value;
    warnings.push(`${label} is longer than ${max} characters. We will keep the first ${max}.`);
    return value.slice(0, max);
}

export function parseScore(raw: string, label: string): { value: number | null; error?: string } {
    if (!raw) return { value: null };
    const word = SCORE_WORDS[raw.toLowerCase()];
    if (word) return { value: word };
    if (!/^\d+$/.test(raw)) {
        return { value: null, error: `${label} "${raw}" is not a number from 1 to 5.` };
    }
    const score = Number(raw);
    if (score < 1 || score > 5) {
        return { value: null, error: `${label} "${raw}" is not a number from 1 to 5.` };
    }
    return { value: score };
}

export function parseCalendarDate(raw: string, label: string): { value: string | null; error?: string; warning?: string } {
    if (!raw) return { value: null };
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (iso) {
        const stored = calendarOrNull(Number(iso[1]), Number(iso[2]), Number(iso[3]));
        if (!stored) return { value: null, error: `${label} "${raw}" is not a real calendar date.` };
        return { value: stored };
    }
    const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
    if (!slash) {
        return { value: null, error: `${label} "${raw}" is not a real calendar date.` };
    }
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    let day = first;
    let month = second;
    let warning: string | undefined;
    if (first > 12 && second <= 12) {
        day = first;
        month = second;
    } else if (second > 12 && first <= 12) {
        month = first;
        day = second;
    } else if (first <= 12 && second <= 12) {
        warning = `${label} "${raw}" could be read two ways. We read it as day/month/year.`;
    }
    const stored = calendarOrNull(year, month, day);
    if (!stored) return { value: null, error: `${label} "${raw}" is not a real calendar date.` };
    return { value: stored, warning };
}

function calendarOrNull(year: number, month: number, day: number): string | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const monthText = String(month).padStart(2, "0");
    const dayText = String(day).padStart(2, "0");
    return `${year}-${monthText}-${dayText}`;
}

function ownerWarning(owner: string, members: string[] | undefined, warnings: string[]) {
    if (!owner || !members || members.length === 0) return;
    const known = new Set(members.map((member) => member.trim().toLowerCase()).filter(Boolean));
    if (!known.has(owner.toLowerCase())) {
        warnings.push(`Owner "${owner}" is not a person in this workspace. We will still save the name.`);
    }
}

function blankRow(kind: SpreadsheetKind, row: Record<string, unknown>): boolean {
    const keys = kind === "controls"
        ? ["controlCode", "title", "description", "grouping", "owner", "dueDate"]
        : ["title", "description", "likelihood", "impact", "status", "owner"];
    return keys.every((key) => cell(row, key) === "");
}

export function planSpreadsheetImport(input: {
    kind: SpreadsheetKind;
    rows: Record<string, unknown>[];
    existingKeys?: string[];
    members?: string[];
}): ImportPlan {
    const existing = new Set(
        (input.existingKeys ?? [])
            .map((key) => key.trim())
            .filter(Boolean)
            .map((key) => (input.kind === "risks" ? key.toLowerCase() : key)),
    );
    const seen = new Set<string>();
    const planned: PlannedRow[] = [];

    input.rows.forEach((row, offset) => {
        const index = offset + 1;
        if (blankRow(input.kind, row)) {
            planned.push({ index, action: "skip", errors: [], warnings: [], values: {} });
            return;
        }
        const errors: string[] = [];
        const warnings: string[] = [];
        const values: Record<string, string | number | null> = {};

        if (input.kind === "controls") {
            const code = clip(cell(row, "controlCode"), CONTROL_CODE_MAX, "Control ID", warnings);
            const title = clip(cell(row, "title"), CONTROL_TITLE_MAX, "Title", warnings);
            if (!code) errors.push("Control ID is empty.");
            if (!title) errors.push("Title is empty.");
            if (code && seen.has(code)) errors.push(`Control ${code} appears more than once in this file.`);
            if (code) seen.add(code);
            const due = parseCalendarDate(cell(row, "dueDate"), "Date");
            if (due.error) errors.push(due.error);
            if (due.warning) warnings.push(due.warning);
            const owner = clip(cell(row, "owner"), 255, "Owner", warnings);
            ownerWarning(owner, input.members, warnings);
            values.controlCode = code || null;
            values.title = title || null;
            values.description = clip(cell(row, "description"), TEXT_MAX, "Description", warnings) || null;
            values.grouping = clip(cell(row, "grouping"), 255, "Grouping", warnings) || null;
            values.owner = owner || null;
            values.dueDate = due.value;
            const action: PlannedAction = errors.length > 0 ? "skip" : existing.has(code) ? "update" : "create";
            planned.push({ index, action, errors, warnings, values });
            return;
        }

        const title = clip(cell(row, "title"), RISK_TITLE_MAX, "Title", warnings);
        if (!title) errors.push("Title is empty.");
        if (title && seen.has(title.toLowerCase())) errors.push(`Risk "${title}" appears more than once in this file.`);
        if (title) seen.add(title.toLowerCase());
        const likelihood = parseScore(cell(row, "likelihood"), "Likelihood");
        const impact = parseScore(cell(row, "impact"), "Impact");
        if (likelihood.error) errors.push(likelihood.error);
        if (impact.error) errors.push(impact.error);
        const owner = clip(cell(row, "owner"), 255, "Owner", warnings);
        ownerWarning(owner, input.members, warnings);
        const statusRaw = cell(row, "status").toLowerCase();
        let status = "identified";
        if (statusRaw && !RISK_STATUSES.has(statusRaw)) {
            warnings.push(`Status "${cell(row, "status")}" is not identified, analyzed, treated, or monitored. We will save it as identified.`);
        } else if (statusRaw) {
            status = statusRaw;
        }
        values.title = title || null;
        values.description = clip(cell(row, "description"), TEXT_MAX, "Description", warnings) || null;
        values.likelihood = likelihood.value;
        values.impact = impact.value;
        values.status = status;
        values.owner = owner || null;
        const key = title.toLowerCase();
        const action: PlannedAction = errors.length > 0 ? "skip" : existing.has(key) ? "update" : "create";
        planned.push({ index, action, errors, warnings, values });
    });

    const summary: ImportSummary = {
        create: planned.filter((row) => row.action === "create").length,
        update: planned.filter((row) => row.action === "update").length,
        skipped: planned.filter((row) => row.action === "skip").length,
        errors: planned.filter((row) => row.errors.length > 0).length,
        warnings: planned.filter((row) => row.warnings.length > 0).length,
    };

    return { kind: input.kind, rows: planned, summary };
}

export function rowsToSave(plan: ImportPlan): PlannedRow[] {
    return plan.rows.filter((row) => row.action === "create" || row.action === "update");
}
