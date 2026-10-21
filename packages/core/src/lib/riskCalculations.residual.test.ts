import { describe, expect, it } from "vitest";
import { calculateMultiControlResidualScore, getMatrixScoreLevel } from "./riskCalculations";
import { riskAssessmentUpdatePatch } from "../server/services/riskAssessmentWrite";

describe("calculateMultiControlResidualScore", () => {
    it("weights effective controls at 40% and partial controls at 20%, capped at 90%", () => {
        expect(calculateMultiControlResidualScore(16, [])).toBe(16);
        expect(calculateMultiControlResidualScore(16, [{ effectiveness: "effective" }])).toBe(10);
        expect(calculateMultiControlResidualScore(16, [{ effectiveness: "partially_effective" }])).toBe(13);
        expect(calculateMultiControlResidualScore(16, [{ effectiveness: "ineffective" }])).toBe(16);
        expect(calculateMultiControlResidualScore(16, [
            { effectiveness: "effective" },
            { effectiveness: "effective" },
            { effectiveness: "effective" },
        ])).toBe(2);
        expect(calculateMultiControlResidualScore(16, [
            { effectiveness: "Partially Effective" },
            { effectiveness: "effective" },
        ])).toBe(6);
        expect(getMatrixScoreLevel(2)).toBe("Low");
        expect(getMatrixScoreLevel(10)).toBe("High");
    });
});

describe("riskAssessmentUpdatePatch", () => {
    it("keeps the stored status and omits columns the wizard did not send", () => {
        const patch = riskAssessmentUpdatePatch({
            id: 4,
            clientId: 9,
            title: "Edited",
            likelihood: 4,
            impact: 4,
            status: "draft",
            riskOwner: "Ada",
            contextSnapshot: { description: "new" },
        }, {
            clientId: 2,
            status: "approved",
            notes: "keep me",
            nextReviewDate: "2027-01-01",
            contextSnapshot: { source: "Threat Model", residualLikelihood: "2" },
        });

        expect(patch.status).toBeUndefined();
        expect(patch.notes).toBeUndefined();
        expect(patch.nextReviewDate).toBeUndefined();
        expect(patch.clientId).toBe(2);
        expect(patch.inherentScore).toBe(16);
        expect(patch.inherentRisk).toBe("Very High");
        expect(patch.contextSnapshot).toEqual({
            source: "Threat Model",
            residualLikelihood: "2",
            description: "new",
        });
        expect(patch.riskOwner).toBe("Ada");
    });
});
