/**
 * Shared posture math.
 * Score = implemented / in-scope controls. Not-applicable controls are out of scope.
 * A rate is null when nothing is in scope, so an empty workspace is not 0%.
 */

export type ControlStatusCounts = {
  implemented?: number;
  inProgress?: number;
  notStarted?: number;
  notApplicable?: number;
};

export type PostureScore = {
  implemented: number;
  inProgress: number;
  notStarted: number;
  notApplicable: number;
  inScope: number;
  rate: number | null;
};

function nonNegative(value: number | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function postureScore(counts: ControlStatusCounts): PostureScore {
  const implemented = nonNegative(counts.implemented);
  const inProgress = nonNegative(counts.inProgress);
  const notStarted = nonNegative(counts.notStarted);
  const notApplicable = nonNegative(counts.notApplicable);
  const inScope = implemented + inProgress + notStarted;
  const rate = inScope > 0 ? Math.round((implemented / inScope) * 100) : null;
  return { implemented, inProgress, notStarted, notApplicable, inScope, rate };
}

export function postureScoreFromStatuses(
  statuses: Array<string | null | undefined>
): PostureScore {
  const counts: Required<ControlStatusCounts> = {
    implemented: 0,
    inProgress: 0,
    notStarted: 0,
    notApplicable: 0,
  };
  for (const status of statuses) {
    if (status === "implemented") counts.implemented += 1;
    else if (status === "in_progress") counts.inProgress += 1;
    else if (status === "not_implemented") counts.notStarted += 1;
    else if (status === "not_applicable") counts.notApplicable += 1;
  }
  return postureScore(counts);
}

export type PolicyCoverage = {
  inScope: number;
  mapped: number;
  unmapped: number;
  rate: number | null;
};

/** Mapped in-scope controls divided by in-scope controls. Never a stored percentage. */
export function policyCoverage(input: { inScope?: number; mappedInScope?: number }): PolicyCoverage {
  const inScope = nonNegative(input.inScope);
  const mapped = Math.min(inScope, nonNegative(input.mappedInScope));
  const unmapped = inScope - mapped;
  const rate = inScope > 0 ? Math.round((mapped / inScope) * 100) : null;
  return { inScope, mapped, unmapped, rate };
}
