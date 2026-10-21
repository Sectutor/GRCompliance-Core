import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("policy review reminders", () => {
  it("still keys reminders off the review-request due date", () => {
    const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "policyReviewScheduler.ts"), "utf8");
    expect(source).toContain("clientPolicies.reviewDueDate");
    expect(source).not.toContain("clientPolicies.nextReviewDate");
    expect(source).not.toContain("next_review_date");
  });
});
