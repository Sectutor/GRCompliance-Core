import { sql } from "drizzle-orm";
import { rowsOf } from "./riskAssessmentIds";

export const RISK_ASSESSMENT_ID_INDEX = "idx_ra_client_assessment_id";

/**
 * Add a unique index on (client_id, assessment_id) only when no duplicate
 * pair already exists. Existing ids, including duplicates, are left as they are.
 */
export async function ensureRiskAssessmentIdUniqueIndex(
    db: { execute: (query: unknown) => Promise<unknown> },
    log: Pick<Console, "error" | "log"> = console,
): Promise<{ created: boolean; skipped: boolean }> {
    const duplicates = rowsOf(await db.execute(sql`
        select client_id, assessment_id
        from risk_assessments
        group by client_id, assessment_id
        having count(*) > 1
        limit 1
    `));

    if (duplicates.length > 0) {
        log.error(`[bootstrap] Skipping unique index ${RISK_ASSESSMENT_ID_INDEX}: duplicate (client_id, assessment_id) pairs exist`);
        return { created: false, skipped: true };
    }

    await db.execute(sql`
        create unique index if not exists idx_ra_client_assessment_id
        on risk_assessments (client_id, assessment_id)
    `);
    log.log(`[bootstrap] Ensured unique index ${RISK_ASSESSMENT_ID_INDEX}`);
    return { created: true, skipped: false };
}
