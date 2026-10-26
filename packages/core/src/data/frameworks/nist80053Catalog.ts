import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Flattens the NIST OSCAL catalog nist-800-53-rev5.json (SP 800-53 Rev. 5.2.0).
 * Public domain. Statement prose only; assessment procedures are not copied.
 * Parameter inserts become [label]. Withdrawn controls are included with status
 * "inactive" so a re-seed does not present them as current requirements.
 * Source catalog: https://github.com/usnistgov/oscal-content
 */

export interface Nist80053ControlRow {
    controlId: string;
    name: string;
    description: string;
    framework: "NIST 800-53";
    category: string;
    grouping: string;
    status: "active" | "inactive";
    version: 5;
    implementationGuidance: string;
}

interface OscalProp {
    name: string;
    value?: string;
    class?: string;
}

interface OscalPart {
    name?: string;
    prose?: string;
    props?: OscalProp[];
    parts?: OscalPart[];
}

interface OscalParam {
    id: string;
    label?: string;
    select?: { choice?: string[] };
}

interface OscalControl {
    id: string;
    title?: string;
    props?: OscalProp[];
    params?: OscalParam[];
    parts?: OscalPart[];
    controls?: OscalControl[];
}

interface OscalGroup {
    id: string;
    title?: string;
    controls?: OscalControl[];
}

const GUIDANCE = "NIST SP 800-53 Rev. 5.2.0 OSCAL catalog statement (public domain). Source: https://github.com/usnistgov/oscal-content release 800-53 Rev 5.2.0.";

function unlabeledLabel(props: OscalProp[] | undefined): string | undefined {
    return props?.find((prop) => prop.name === "label" && !prop.class)?.value;
}

function isWithdrawn(props: OscalProp[] | undefined): boolean {
    return props?.some((prop) => prop.name === "status" && prop.value === "withdrawn") ?? false;
}

function paramText(params: Map<string, OscalParam>, id: string): string {
    const param = params.get(id);
    if (param?.label?.trim()) return param.label.trim();
    const choices = param?.select?.choice;
    if (choices && choices.length > 0) return choices.join(" | ");
    return "organization-defined";
}

function resolveProse(prose: string, params: Map<string, OscalParam>): string {
    return prose.replace(/\{\{\s*insert:\s*param,\s*([^}]+?)\s*\}\}/g, (_match, id: string) => {
        return `[${paramText(params, id.trim())}]`;
    });
}

function flattenStatement(part: OscalPart, params: Map<string, OscalParam>, lines: string[]): void {
    const label = unlabeledLabel(part.props);
    const prose = part.prose ? resolveProse(part.prose, params).trim() : "";
    if (prose) lines.push(label ? `${label} ${prose}` : prose);
    for (const child of part.parts ?? []) flattenStatement(child, params, lines);
}

function controlRow(control: OscalControl, group: OscalGroup): Nist80053ControlRow {
    const controlId = unlabeledLabel(control.props) ?? control.id.toUpperCase();
    const params = new Map((control.params ?? []).map((param) => [param.id, param]));
    const statement = (control.parts ?? []).find((part) => part.name === "statement");
    const lines: string[] = [];
    if (statement) flattenStatement(statement, params, lines);
    const withdrawn = isWithdrawn(control.props);
    const name = (control.title ?? controlId).slice(0, 255);
    return {
        controlId,
        name,
        description: lines.join("\n"),
        framework: "NIST 800-53",
        category: group.title ?? group.id,
        grouping: group.id.toUpperCase(),
        status: withdrawn ? "inactive" : "active",
        version: 5,
        implementationGuidance: withdrawn
            ? `Withdrawn in NIST SP 800-53 Rev. 5.2.0. ${GUIDANCE}`
            : GUIDANCE,
    };
}

function walk(control: OscalControl, group: OscalGroup, rows: Nist80053ControlRow[]): void {
    rows.push(controlRow(control, group));
    for (const child of control.controls ?? []) walk(child, group, rows);
}

let cached: Nist80053ControlRow[] | undefined;

export function loadNist80053Rev5Controls(): Nist80053ControlRow[] {
    if (cached) return cached;
    const jsonPath = join(dirname(fileURLToPath(import.meta.url)), "nist-800-53-rev5.json");
    const catalog = JSON.parse(readFileSync(jsonPath, "utf8")) as { catalog: { groups: OscalGroup[] } };
    const rows: Nist80053ControlRow[] = [];
    for (const group of catalog.catalog.groups) {
        for (const control of group.controls ?? []) walk(control, group, rows);
    }
    cached = rows;
    return rows;
}
