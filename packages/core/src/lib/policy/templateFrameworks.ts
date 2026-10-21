import { sql, type SQL } from "drizzle-orm";
import { logger } from "../logger";

/**
 * drizzle-orm 0.30 stringifies json values, then postgres.js stringifies them
 * again once Postgres reports the parameter type as json. `policy_templates.frameworks`
 * is therefore often a JSON string (`"[\"ISO 27001\"]"`) rather than an array.
 * Reads through drizzle parse that string back into an array; SQL `@>` / ILIKE do not.
 * This module only repairs and reads template frameworks. Other json columns stay as they are.
 */

const MAX_JSON_UNWRAP = 3;

export function normalizeFrameworkList(value: unknown): string[] {
    let current = value;
    for (let depth = 0; depth < MAX_JSON_UNWRAP && typeof current === "string"; depth++) {
        try {
            current = JSON.parse(current);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(current)) return [];
    return current.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/** Decode a `frameworks::text` value into a string array, or null when it is not one. */
export function unwrapFrameworkJsonText(raw: string): string[] | null {
    let current: unknown = raw;
    for (let depth = 0; depth < MAX_JSON_UNWRAP && typeof current === "string"; depth++) {
        try {
            current = JSON.parse(current);
        } catch {
            return null;
        }
    }
    if (!Array.isArray(current) || !current.every((item) => typeof item === "string")) return null;
    return current;
}

export function filterPolicyTemplatesByFramework<T extends { frameworks?: unknown }>(
    rows: T[],
    framework?: string | null,
): T[] {
    if (!framework || framework === "all") return rows;
    return rows.filter((row) => normalizeFrameworkList(row.frameworks).includes(framework));
}

export function withReadableFrameworks<T extends { frameworks?: unknown }>(row: T): T {
    if (!row || row.frameworks == null) return row;
    return { ...row, frameworks: normalizeFrameworkList(row.frameworks) };
}

/**
 * The template editor submits one `framework` string. `frameworks` wins when an
 * API caller sends the full list. Re-saving without changing the select keeps
 * any extra stored frameworks, because the form only posts the first one.
 */
export function resolveStoredFrameworks(
    input: { framework?: string; frameworks?: string[] },
    existing?: unknown,
): string[] | undefined {
    const explicit = (input.frameworks ?? []).map((item) => item.trim()).filter(Boolean);
    if (explicit.length > 0) return explicit;

    const chosen = input.framework?.trim();
    if (!chosen) return undefined;

    const current = normalizeFrameworkList(existing);
    if (current.length > 1 && current[0] === chosen) return current;
    return [chosen];
}

/** Build a real JSON array parameter. Text casts avoid the json serializer that double-encodes. */
export function jsonTextArraySql(values: string[]): SQL {
    if (values.length === 0) return sql`'[]'::json`;
    return sql`jsonb_build_array(${sql.join(
        values.map((value) => sql`${value}::text`),
        sql`, `,
    )})::json`;
}

export function selectDoubleEncodedFrameworkSql(): SQL {
    return sql`
        select id, frameworks::text as raw
        from policy_templates
        where frameworks is not null
          and json_typeof(frameworks) = 'string'
    `;
}

export function repairFrameworkUpdateStatement(id: number, values: string[]): SQL {
    return sql`
        update policy_templates
        set frameworks = ${jsonTextArraySql(values)}
        where id = ${id}
          and json_typeof(frameworks) = 'string'
    `;
}

type RepairDb = {
    execute: (query: SQL) => Promise<unknown>;
};

function rowsOf(result: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
    if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
        return (result as { rows: Array<Record<string, unknown>> }).rows;
    }
    return [];
}

/**
 * Rewrite double-encoded `policy_templates.frameworks` values to JSON arrays.
 * Idempotent: rows that are already arrays are not selected, and the update
 * itself re-checks `json_typeof`. Invalid payloads are left untouched.
 * Failures are logged and swallowed so startup can continue.
 */
export async function repairDoubleEncodedPolicyTemplateFrameworks(db: RepairDb): Promise<number> {
    let fixed = 0;
    try {
        const selected = await db.execute(selectDoubleEncodedFrameworkSql());
        for (const row of rowsOf(selected)) {
            const raw = row.raw ?? row.frameworks;
            if (typeof raw !== "string") continue;
            const decoded = unwrapFrameworkJsonText(raw);
            if (!decoded) continue;
            const id = Number(row.id);
            if (!Number.isInteger(id)) continue;
            try {
                await db.execute(repairFrameworkUpdateStatement(id, decoded));
                fixed++;
            } catch (error) {
                logger.warn({ message: `[Seed] Could not repair policy template ${id} frameworks`, error });
            }
        }
    } catch (error) {
        logger.warn({ message: "[Seed] Policy template framework repair failed", error });
        return 0;
    }
    if (fixed > 0) {
        logger.info(`[Seed] Repaired framework encoding on ${fixed} policy template(s)`);
    }
    return fixed;
}
