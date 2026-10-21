import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COPY_NEXT_REVIEW_DATE_SQL,
  INSERT_POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL,
  KNOWLEDGE_ARTICLES_TABLE_CHECK_SQL,
  NEXT_REVIEW_COLUMN_CHECK_SQL,
  POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL,
  POLICY_REVIEW_DATE_CORRECTION_SOURCE,
  separatePolicyReviewDates,
} from "./separatePolicyReviewDates";

const here = path.dirname(fileURLToPath(import.meta.url));

interface PolicyRow {
  id: number;
  next_review_date: string | null;
  review_due_date: string | null;
}

interface ArticleRow {
  source: string;
}

function memoryDb(options: {
  columnExists?: boolean;
  articlesTableExists?: boolean;
  policies: PolicyRow[];
  articles?: ArticleRow[];
}) {
  const policies = options.policies.map((row) => ({ ...row }));
  const articles = (options.articles ?? []).map((row) => ({ ...row }));
  const calls: string[] = [];
  const columnExists = options.columnExists !== false;
  const articlesTableExists = options.articlesTableExists !== false;

  const execute = async (statement: string) => {
    calls.push(statement);
    if (statement === NEXT_REVIEW_COLUMN_CHECK_SQL) {
      return columnExists ? [{ present: 1 }] : [];
    }
    if (statement === KNOWLEDGE_ARTICLES_TABLE_CHECK_SQL) {
      return articlesTableExists ? [{ present: 1 }] : [];
    }
    if (statement === POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL) {
      return articles.some((row) => row.source === POLICY_REVIEW_DATE_CORRECTION_SOURCE)
        ? [{ present: 1 }]
        : [];
    }
    if (statement === COPY_NEXT_REVIEW_DATE_SQL) {
      const updated: { id: number }[] = [];
      for (const row of policies) {
        if (row.next_review_date == null && row.review_due_date != null) {
          row.next_review_date = row.review_due_date;
          updated.push({ id: row.id });
        }
      }
      return updated;
    }
    if (statement === INSERT_POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL) {
      if (!articles.some((row) => row.source === POLICY_REVIEW_DATE_CORRECTION_SOURCE)) {
        articles.push({ source: POLICY_REVIEW_DATE_CORRECTION_SOURCE });
        return [{ id: articles.length }];
      }
      return [];
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  };

  return { policies, articles, calls, execute };
}

describe("separatePolicyReviewDates", () => {
  it("uses a non-destructive one-shot copy", () => {
    const statements = [
      NEXT_REVIEW_COLUMN_CHECK_SQL,
      KNOWLEDGE_ARTICLES_TABLE_CHECK_SQL,
      POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL,
      COPY_NEXT_REVIEW_DATE_SQL,
      INSERT_POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL,
    ];
    for (const statement of statements) {
      expect(statement).not.toMatch(/\b(delete|drop|truncate|alter)\b/i);
    }
    expect(COPY_NEXT_REVIEW_DATE_SQL).toMatch(/set next_review_date = review_due_date/i);
    expect(COPY_NEXT_REVIEW_DATE_SQL).toMatch(/next_review_date is null/i);
    expect(COPY_NEXT_REVIEW_DATE_SQL).toMatch(/review_due_date is not null/i);
    expect(COPY_NEXT_REVIEW_DATE_SQL).not.toMatch(/set\s+review_due_date/i);
    expect(COPY_NEXT_REVIEW_DATE_SQL).not.toMatch(/set\s+status/i);
    expect(COPY_NEXT_REVIEW_DATE_SQL).not.toMatch(/set\s+version/i);
  });

  it("copies a legacy review date once and leaves later request due dates alone", async () => {
    const db = memoryDb({
      policies: [
        { id: 1, next_review_date: null, review_due_date: "2027-10-21" },
        { id: 2, next_review_date: "2028-01-01", review_due_date: "2026-11-01" },
        { id: 3, next_review_date: null, review_due_date: null },
      ],
    });

    const first = await separatePolicyReviewDates(db.execute);
    expect(first).toEqual({ copied: 1, skipped: false, alreadyApplied: false });
    expect(db.policies[0]).toEqual({ id: 1, next_review_date: "2027-10-21", review_due_date: "2027-10-21" });
    expect(db.policies[1]).toEqual({ id: 2, next_review_date: "2028-01-01", review_due_date: "2026-11-01" });
    expect(db.policies[2]).toEqual({ id: 3, next_review_date: null, review_due_date: null });
    expect(db.articles).toEqual([{ source: POLICY_REVIEW_DATE_CORRECTION_SOURCE }]);

    db.policies.push({ id: 4, next_review_date: null, review_due_date: "2026-12-01" });
    const callsBefore = db.calls.length;
    const second = await separatePolicyReviewDates(db.execute);
    expect(second).toEqual({ copied: 0, skipped: false, alreadyApplied: true });
    expect(db.policies[3]).toEqual({ id: 4, next_review_date: null, review_due_date: "2026-12-01" });
    expect(db.calls.slice(callsBefore)).not.toContain(COPY_NEXT_REVIEW_DATE_SQL);
    expect(db.articles).toHaveLength(1);
  });

  it("is a no-op when the marker is already present", async () => {
    const db = memoryDb({
      policies: [{ id: 1, next_review_date: null, review_due_date: "2027-10-21" }],
      articles: [{ source: POLICY_REVIEW_DATE_CORRECTION_SOURCE }],
    });
    const result = await separatePolicyReviewDates(db.execute);
    expect(result.alreadyApplied).toBe(true);
    expect(result.copied).toBe(0);
    expect(db.policies[0].next_review_date).toBeNull();
    expect(db.calls).not.toContain(COPY_NEXT_REVIEW_DATE_SQL);
  });

  it("copies without a marker when knowledge_articles is missing", async () => {
    const db = memoryDb({
      articlesTableExists: false,
      policies: [{ id: 1, next_review_date: null, review_due_date: "2027-10-21" }],
    });

    const result = await separatePolicyReviewDates(db.execute);

    expect(result).toEqual({ copied: 1, skipped: false, alreadyApplied: false });
    expect(db.policies[0].next_review_date).toBe("2027-10-21");
    expect(db.policies[0].review_due_date).toBe("2027-10-21");
    expect(db.calls).not.toContain(POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL);
    expect(db.calls).not.toContain(INSERT_POLICY_REVIEW_DATE_CORRECTION_MARKER_SQL);
  });

  it("skips the copy when the column is missing and does not change schema", async () => {
    const db = memoryDb({
      columnExists: false,
      policies: [{ id: 1, next_review_date: null, review_due_date: "2027-10-21" }],
    });
    const result = await separatePolicyReviewDates(db.execute);
    expect(result).toEqual({ copied: 0, skipped: true, alreadyApplied: false });
    expect(db.policies[0].next_review_date).toBeNull();
    expect(db.calls).toEqual([NEXT_REVIEW_COLUMN_CHECK_SQL]);
  });

  it("runs from the docker bootstrap and the server entry", () => {
    const root = path.resolve(here, "../../../../../");
    const bootstrap = readFileSync(path.join(root, "docker/bootstrap.ts"), "utf8");
    const entry = readFileSync(path.join(root, "server_entry.ts"), "utf8");
    expect(bootstrap).toContain("separatePolicyReviewDates()");
    expect(entry).toContain("separatePolicyReviewDates()");
    expect(entry).toContain("policyReviewDateCorrection.finally");
  });
});
