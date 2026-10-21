import { describe, expect, it } from "vitest";
import {
  buildReviewRequestUpdate,
  policyDetailsDateUpdate,
  reviewRequestDateInput,
  toDateInputValue,
} from "./reviewDates";

describe("policy review dates", () => {
  it("saves the periodic next-review date without the request due date", () => {
    expect(policyDetailsDateUpdate("2027-10-21")).toEqual({ nextReviewDate: "2027-10-21" });
    expect(policyDetailsDateUpdate("")).toEqual({ nextReviewDate: null });
    expect(policyDetailsDateUpdate("2027-10-21")).not.toHaveProperty("reviewDueDate");
    expect(policyDetailsDateUpdate("2027-10-21")).not.toHaveProperty("dueDate");
  });

  it("sends a review-request due date without the next-review date", () => {
    expect(reviewRequestDateInput("2026-11-01")).toEqual({ dueDate: "2026-11-01" });
    expect(reviewRequestDateInput("")).toEqual({});
    expect(reviewRequestDateInput("2026-11-01")).not.toHaveProperty("nextReviewDate");
  });

  it("clears only the request due date when a review is requested without one", () => {
    const nextReview = new Date("2027-10-21T00:00:00.000Z");
    const patch = buildReviewRequestUpdate({ reviewers: ["8"] });

    expect(patch.reviewDueDate).toBeNull();
    expect(patch).not.toHaveProperty("nextReviewDate");
    expect(patch.approvalStatus).toBe("requested");
    expect(patch.status).toBe("review");
    expect(nextReview.toISOString()).toBe("2027-10-21T00:00:00.000Z");
  });

  it("stores a provided request due date and still omits the next-review date", () => {
    const patch = buildReviewRequestUpdate({
      reviewers: ["8"],
      dueDate: "2026-12-01",
      now: new Date("2026-10-21T12:00:00.000Z"),
    });

    expect(patch.reviewDueDate?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(patch.updatedAt.toISOString()).toBe("2026-10-21T12:00:00.000Z");
    expect(Object.keys(patch).sort()).toEqual([
      "approvalStatus",
      "reviewDueDate",
      "reviewers",
      "status",
      "updatedAt",
    ]);
  });

  it("formats stored dates for the two separate inputs", () => {
    expect(toDateInputValue("2027-10-21T00:00:00.000Z")).toBe("2027-10-21");
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("")).toBe("");
  });
});
