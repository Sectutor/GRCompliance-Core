import { describe, expect, it } from "vitest";
import { policyCoverage, postureScore, postureScoreFromStatuses } from "./postureScore";

describe("postureScore", () => {
  it("divides implemented controls by in-scope controls and excludes not-applicable", () => {
    const score = postureScore({
      implemented: 14,
      inProgress: 8,
      notStarted: 4,
      notApplicable: 4,
    });

    expect(score.inScope).toBe(26);
    expect(score.rate).toBe(54);
    expect(score.rate).not.toBe(Math.round((14 / 30) * 100));
  });

  it("returns null when every control is not applicable", () => {
    expect(postureScore({ implemented: 0, notApplicable: 6 }).rate).toBeNull();
    expect(postureScore({ implemented: 0, notApplicable: 6 }).inScope).toBe(0);
  });

  it("returns null for an empty workspace", () => {
    expect(postureScore({}).rate).toBeNull();
    expect(postureScore({}).inScope).toBe(0);
  });

  it("counts a fully implemented in-scope set as 100", () => {
    expect(postureScore({ implemented: 3, inProgress: 0, notStarted: 0 }).rate).toBe(100);
  });

  it("reads the same rate from status lists, including a framework subset", () => {
    const statuses = [
      "implemented",
      "implemented",
      "in_progress",
      "not_implemented",
      "not_applicable",
    ];
    const score = postureScoreFromStatuses(statuses);
    expect(score).toEqual(postureScore({
      implemented: 2,
      inProgress: 1,
      notStarted: 1,
      notApplicable: 1,
    }));
    expect(score.rate).toBe(50);
  });
});

describe("policyCoverage", () => {
  it("computes mapped in-scope controls over in-scope controls", () => {
    const coverage = policyCoverage({ inScope: 26, mappedInScope: 10 });
    expect(coverage.mapped).toBe(10);
    expect(coverage.unmapped).toBe(16);
    expect(coverage.rate).toBe(38);
  });

  it("does not invent a percentage when nothing is in scope", () => {
    expect(policyCoverage({ inScope: 0, mappedInScope: 0 }).rate).toBeNull();
  });
});
