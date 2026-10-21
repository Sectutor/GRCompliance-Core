import { describe, expect, it } from "vitest";
import { residualHeatmapAxes, splitResidualScore } from "./riskCalculations";

describe("splitResidualScore", () => {
    it("picks the 1-5 pair whose product is closest, then the tighter spread, then the smaller likelihood", () => {
        expect(splitResidualScore(6)).toEqual({ likelihood: 2, impact: 3 });
        expect(splitResidualScore(7)).toEqual({ likelihood: 2, impact: 3 });
        expect(splitResidualScore(8)).toEqual({ likelihood: 2, impact: 4 });
        expect(splitResidualScore(11)).toEqual({ likelihood: 3, impact: 4 });
        expect(splitResidualScore(13)).toEqual({ likelihood: 3, impact: 4 });
        expect(splitResidualScore(16)).toEqual({ likelihood: 4, impact: 4 });
        expect(splitResidualScore(20)).toEqual({ likelihood: 4, impact: 5 });
        expect(splitResidualScore(22)).toEqual({ likelihood: 4, impact: 5 });
        expect(splitResidualScore(23)).toEqual({ likelihood: 5, impact: 5 });
        expect(splitResidualScore(25)).toEqual({ likelihood: 5, impact: 5 });
        expect(splitResidualScore(1)).toEqual({ likelihood: 1, impact: 1 });
        expect(splitResidualScore(4)).toEqual({ likelihood: 2, impact: 2 });
        expect(residualHeatmapAxes(6)).toEqual({ residualLikelihood: "2", residualImpact: "3" });
    });
});
