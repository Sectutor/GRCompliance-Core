import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
    filterPolicyTemplatesByFramework,
    jsonTextArraySql,
    normalizeFrameworkList,
    repairDoubleEncodedPolicyTemplateFrameworks,
    repairFrameworkUpdateStatement,
    resolveStoredFrameworks,
    selectDoubleEncodedFrameworkSql,
    unwrapFrameworkJsonText,
    withReadableFrameworks,
} from "./templateFrameworks";

const dialect = new PgDialect();

function compiled(query: ReturnType<typeof jsonTextArraySql>) {
    return dialect.sqlToQuery(query);
}

/** The text Postgres returns for a json column that holds a JSON string. */
function storedJsonString(value: unknown): string {
    return JSON.stringify(JSON.stringify(value));
}

describe("template framework encoding", () => {
    it("reads a native array, a once-parsed string, and the double-encoded column text", () => {
        expect(normalizeFrameworkList(["ISO 27001", "NIS2"])).toEqual(["ISO 27001", "NIS2"]);
        expect(normalizeFrameworkList('["SOC 2"]')).toEqual(["SOC 2"]);
        expect(normalizeFrameworkList(storedJsonString(["ISO 27001"]))).toEqual(["ISO 27001"]);
        expect(unwrapFrameworkJsonText(storedJsonString(["ISO 27001", "NIS2"]))).toEqual(["ISO 27001", "NIS2"]);
    });

    it("does not treat the legacy ILIKE pattern as a match for double-encoded text", () => {
        const stored = storedJsonString(["ISO 27001"]);
        expect(stored.includes('"ISO 27001"')).toBe(false);
        expect(normalizeFrameworkList(stored)).toEqual(["ISO 27001"]);
    });

    it("leaves non-arrays alone so a repair cannot rewrite them", () => {
        expect(unwrapFrameworkJsonText(storedJsonString({ name: "ISO 27001" }))).toBeNull();
        expect(unwrapFrameworkJsonText("not json")).toBeNull();
        expect(unwrapFrameworkJsonText(storedJsonString("ISO 27001"))).toBeNull();
        expect(normalizeFrameworkList(null)).toEqual([]);
    });

    it("filters templates by framework across both encodings", () => {
        const rows = [
            { templateId: "POL-001", frameworks: ["ISO 27001"] },
            { templateId: "POL-003", frameworks: storedJsonString(["SOC 2"]) },
            { templateId: "POL-005", frameworks: storedJsonString(["ISO 27001", "NIS2"]) },
            { templateId: "POL-099", frameworks: ["ISO 27001 / SOC 2"] },
            { templateId: "POL-000", frameworks: null },
        ];

        expect(filterPolicyTemplatesByFramework(rows, "ISO 27001").map((row) => row.templateId))
            .toEqual(["POL-001", "POL-005"]);
        expect(filterPolicyTemplatesByFramework(rows, "SOC 2").map((row) => row.templateId))
            .toEqual(["POL-003"]);
        expect(filterPolicyTemplatesByFramework(rows, "ISO 27001 / SOC 2").map((row) => row.templateId))
            .toEqual(["POL-099"]);
        expect(filterPolicyTemplatesByFramework(rows, "all")).toHaveLength(rows.length);
        expect(filterPolicyTemplatesByFramework(rows, undefined)).toHaveLength(rows.length);
    });

    it("gives the editor a string array even when the column is double-encoded", () => {
        const readable = withReadableFrameworks({
            templateId: "POL-042",
            frameworks: storedJsonString(["SOC 2"]),
        });
        expect(readable.frameworks).toEqual(["SOC 2"]);
        expect(readable.frameworks[0]).toBe("SOC 2");
    });

    it("keeps the typed template framework, including the combined select value", () => {
        expect(resolveStoredFrameworks({ framework: "ISO 27001" })).toEqual(["ISO 27001"]);
        expect(resolveStoredFrameworks({ framework: "ISO 27001 / SOC 2" })).toEqual(["ISO 27001 / SOC 2"]);
        expect(resolveStoredFrameworks({ frameworks: ["SOC 2", "NIS2"] })).toEqual(["SOC 2", "NIS2"]);
        expect(resolveStoredFrameworks({ framework: "ISO 27001" }, ["ISO 27001", "NIS2"]))
            .toEqual(["ISO 27001", "NIS2"]);
        expect(resolveStoredFrameworks({ framework: "ISO 27001" }, storedJsonString(["ISO 27001", "NIS2"])))
            .toEqual(["ISO 27001", "NIS2"]);
        expect(resolveStoredFrameworks({ framework: "SOC 2" }, ["ISO 27001", "NIS2"]))
            .toEqual(["SOC 2"]);
        expect(resolveStoredFrameworks({})).toBeUndefined();
    });

    it("writes a repaired array with text parameters, not another json string", () => {
        const query = compiled(jsonTextArraySql(["ISO 27001", "NIS2"]));
        expect(query.sql).toContain("jsonb_build_array");
        expect(query.sql).toContain("::text");
        expect(query.params).toEqual(["ISO 27001", "NIS2"]);

        const update = compiled(repairFrameworkUpdateStatement(4, ["SOC 2"]));
        expect(update.sql).toContain("update policy_templates");
        expect(update.sql).toContain("set frameworks");
        expect(update.sql).toContain("json_typeof(frameworks) = 'string'");
        expect(update.sql).not.toContain("sections");
        expect(update.sql).not.toContain("risk_assessments");
        expect(update.params).toContain("SOC 2");
        expect(update.params).toContain(4);
        expect(update.params).not.toContain('["SOC 2"]');

        const select = compiled(selectDoubleEncodedFrameworkSql());
        expect(select.sql).toContain("from policy_templates");
        expect(select.sql).toContain("json_typeof(frameworks) = 'string'");
        expect(select.sql).not.toContain("risk_assessments");
    });

    it("repairs only double-encoded string arrays and is a no-op the next time", async () => {
        const execute = vi.fn()
            .mockResolvedValueOnce([
                { id: 1, raw: storedJsonString(["ISO 27001"]) },
                { id: 2, raw: storedJsonString({ keep: true }) },
                { id: 3, raw: "not json" },
            ])
            .mockResolvedValueOnce([]);

        const fixed = await repairDoubleEncodedPolicyTemplateFrameworks({ execute });
        expect(fixed).toBe(1);
        expect(execute).toHaveBeenCalledTimes(2);
        const update = compiled(execute.mock.calls[1][0]);
        expect(update.sql).toContain("json_typeof(frameworks) = 'string'");
        expect(update.params).toContain("ISO 27001");

        execute.mockResolvedValueOnce([]);
        await expect(repairDoubleEncodedPolicyTemplateFrameworks({ execute })).resolves.toBe(0);
    });

    it("does not fail startup when the repair query errors", async () => {
        const execute = vi.fn().mockRejectedValue(new Error("database unavailable"));
        await expect(repairDoubleEncodedPolicyTemplateFrameworks({ execute })).resolves.toBe(0);
    });

    it("is invoked from the boot seed after the empty-table insert is skipped", () => {
        const dbSource = readFileSync(repoFile("packages/core/src/db.ts"), "utf8");
        const seedStart = dbSource.indexOf("export async function ensureDefaultDataSeeded");
        const seedEnd = dbSource.indexOf("export async function updatePolicyTemplate");
        const seed = dbSource.slice(seedStart, seedEnd);
        const guardAt = seed.indexOf("if (!Number(templateCount?.count))");
        const guardClose = matchingBrace(seed, seed.indexOf("{", guardAt));
        const repairAt = seed.lastIndexOf("repairDoubleEncodedPolicyTemplateFrameworks");
        expect(guardAt).toBeGreaterThan(-1);
        expect(repairAt).toBeGreaterThan(guardClose);

        const bootstrap = readFileSync(repoFile("docker/bootstrap.ts"), "utf8");
        expect(bootstrap).toContain("ensureDefaultDataSeeded()");

        const reader = dbSource.slice(
            dbSource.indexOf("export async function getPolicyTemplates"),
            dbSource.indexOf("export async function getPolicyTemplateById"),
        );
        expect(reader).toContain("filterPolicyTemplatesByFramework");
        expect(reader).toContain("withReadableFrameworks");
        expect(reader).not.toContain("::text ILIKE");
    });
});

function repoFile(relative: string): string {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, relative);
        if (existsSync(candidate)) return candidate;
        dir = path.dirname(dir);
    }
    throw new Error(`Could not find ${relative} from ${process.cwd()}`);
}

function matchingBrace(source: string, openAt: number): number {
    let depth = 0;
    for (let i = openAt; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}
