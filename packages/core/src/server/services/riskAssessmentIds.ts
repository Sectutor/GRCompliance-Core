import { sql } from "drizzle-orm";

/** How many times to allocate again after a unique-index conflict. */
export const RISK_ASSESSMENT_ID_ATTEMPTS = 5;

/**
 * Next display id for one client and year.
 * The numeric suffix is the max already used, plus one, padded to four digits.
 * Gaps are left empty. Ids from another year or another prefix are ignored.
 * Existing ids are never rewritten.
 */
export function nextAssessmentId(existingIds: Array<string | null | undefined>, year: number): string {
    const prefix = `RA-${year}-`;
    let max = 0;
    for (const raw of existingIds) {
        if (!raw || !raw.startsWith(prefix)) continue;
        const suffix = raw.slice(prefix.length);
        if (!/^\d+$/.test(suffix)) continue;
        const value = Number(suffix);
        if (value > max) max = value;
    }
    return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function rowsOf(result: unknown): Record<string, unknown>[] {
    if (Array.isArray(result)) return result;
    if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
        return (result as { rows: Record<string, unknown>[] }).rows;
    }
    return [];
}

export function isUniqueViolation(error: unknown): boolean {
    const queue = [error];
    const seen = new Set<unknown>();
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== "object" || seen.has(current)) continue;
        seen.add(current);
        const code = (current as { code?: unknown }).code;
        if (code === "23505") return true;
        const cause = (current as { cause?: unknown }).cause;
        if (cause) queue.push(cause);
    }
    return false;
}

/**
 * Allocate the next RA-YYYY-#### id inside the caller's transaction.
 * pg_advisory_xact_lock is released when that transaction ends.
 */
export async function allocateRiskAssessmentId(
    tx: { execute: (query: unknown) => Promise<unknown> },
    clientId: number,
    year = new Date().getFullYear(),
): Promise<string> {
    const lockKey = `${clientId}:${year}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('risk_assessments.assessment_id'), hashtext(${lockKey}))`);
    const result = await tx.execute(sql`
        select assessment_id from risk_assessments
        where client_id = ${clientId}
          and assessment_id like ${`RA-${year}-%`}
    `);
    const ids = rowsOf(result).map((row) => {
        const value = row.assessment_id ?? row.assessmentId;
        return value == null ? null : String(value);
    });
    return nextAssessmentId(ids, year);
}

export async function withUniqueAssessmentIdRetry<T>(
    work: () => Promise<T>,
    attempts = RISK_ASSESSMENT_ID_ATTEMPTS,
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await work();
        } catch (error) {
            lastError = error;
            if (!isUniqueViolation(error) || attempt === attempts - 1) throw error;
        }
    }
    throw lastError;
}
