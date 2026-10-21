import { sql } from "drizzle-orm";

/**
 * One-shot copy of legacy next-review dates.
 *
 * Before this split, the periodic next-review date lived only in review_due_date
 * and next_review_date was unused. Copying once preserves that date in Policy Details.
 * A marker stops later boots from treating a new review-request due date as the
 * periodic date. The update never overwrites a next_review_date, never changes
 * review_due_date, and never deletes rows.
 *
 * The marker is a knowledge_articles row. Nothing in the app reads that table.
 */
export const POLICY_REVIEW_DATE_CORRECTION_SOURCE = "system:policy-review-date-separation";

export const NEXT_REVIEW_COLUMN_CHECK_SQL = `SELECT 1 AS present
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'client_policies'
  AND column_name = 'next_review_date'
LIMIT 1`;

export const KNOWLEDGE_ARTICLES_TABLE_CHECK_SQL = `SELECT 1 AS present
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'knowledge_articles'
LIMIT 1`;

export const POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL = `SELECT 1 AS present
FROM knowledge_articles
WHERE source = '${POLICY_REVIEW_DATE_CORRECTION_SOURCE}'
LIMIT 1`;

export const COPY_NEXT_REVIEW_DATE_SQL = `UPDATE client_policies
SET next_review_date = review_due_date
WHERE next_review_date IS NULL
  AND review_due_date IS NOT NULL
RETURNING id`;

export const INSERT_POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL = `INSERT INTO knowledge_articles (title, body, source)
SELECT
  'Policy review date separation',
  'Internal boot marker. Legacy review_due_date values were copied into next_review_date once so later review requests do not change that date.',
  '${POLICY_REVIEW_DATE_CORRECTION_SOURCE}'
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles WHERE source = '${POLICY_REVIEW_DATE_CORRECTION_SOURCE}'
)
RETURNING id`;

export type SqlExecutor = (statement: string) => Promise<unknown>;

export function rowsFrom(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

export async function separatePolicyReviewDates(execute?: SqlExecutor): Promise<{
  copied: number;
  skipped: boolean;
  alreadyApplied: boolean;
}> {
  const run = execute ?? defaultExecute;
  const column = rowsFrom(await run(NEXT_REVIEW_COLUMN_CHECK_SQL));
  if (column.length === 0) {
    console.warn("[policy-review-dates] next_review_date column is missing; skipped date correction");
    return { copied: 0, skipped: true, alreadyApplied: false };
  }

  const articlesTable = rowsFrom(await run(KNOWLEDGE_ARTICLES_TABLE_CHECK_SQL));
  const canMark = articlesTable.length > 0;
  if (canMark) {
    const marker = rowsFrom(await run(POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL));
    if (marker.length > 0) {
      return { copied: 0, skipped: false, alreadyApplied: true };
    }
  }

  const updated = rowsFrom(await run(COPY_NEXT_REVIEW_DATE_SQL));
  if (canMark) {
    await run(INSERT_POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL);
  } else {
    console.warn("[policy-review-dates] knowledge_articles is missing; date copy has no one-shot marker");
  }

  if (updated.length > 0) {
    console.log(`[policy-review-dates] Copied review_due_date to next_review_date for ${updated.length} policies`);
  }
  return { copied: updated.length, skipped: false, alreadyApplied: false };
}

async function defaultExecute(statement: string): Promise<unknown> {
  const { getDb } = await import("../../db");
  const db = await getDb();
  return db.execute(sql.raw(statement));
}
