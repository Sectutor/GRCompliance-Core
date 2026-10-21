/**
 * The policy editor used to keep two dates in one field:
 * the periodic next-review date, and the due date of an ad-hoc review request.
 * Both were saved to client_policies.review_due_date.
 * next_review_date is the periodic date. review_due_date is only the request due date.
 */

export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

/** Policy Details save. Never includes the review-request due date. */
export function policyDetailsDateUpdate(nextReviewDate: string): { nextReviewDate: string | null } {
  return { nextReviewDate: nextReviewDate ? nextReviewDate : null };
}

/** Review-request dialog. Never includes the periodic next-review date. */
export function reviewRequestDateInput(requestDueDate: string): { dueDate?: string } {
  if (!requestDueDate) return {};
  return { dueDate: requestDueDate };
}

export function parsePolicyDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value);
}

export function buildReviewRequestUpdate(input: {
  reviewers: string[];
  dueDate?: string | null;
  now?: Date;
}): {
  approvalStatus: "requested";
  reviewers: string[];
  reviewDueDate: Date | null;
  status: "review";
  updatedAt: Date;
} {
  return {
    approvalStatus: "requested",
    reviewers: input.reviewers,
    reviewDueDate: input.dueDate ? new Date(input.dueDate) : null,
    status: "review",
    updatedAt: input.now ?? new Date(),
  };
}
