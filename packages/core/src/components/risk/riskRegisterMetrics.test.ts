import { describe, expect, it } from "vitest";
import {
    compareRegisterScores,
    displayedTreatmentOption,
    hasTreatmentOption,
    inherentLevel,
    isHighOrCritical,
    matchesInherentLevel,
    residualLevel,
} from "./riskRegisterMetrics";

describe("risk register score metrics", () => {
    it("derives the inherent level from the stored score and ignores the stored word", () => {
        expect(inherentLevel({ inherentScore: 20, inherentRisk: "High" })).toBe("Critical");
        expect(inherentLevel({ inherentScore: 15, inherentRisk: "High" })).toBe("Very High");
        expect(inherentLevel({ inherentScore: 8, inherentRisk: "Medium" })).toBe("High");
        expect(inherentLevel({ inherentScore: 7 })).toBe("Medium");
        expect(inherentLevel({ inherentScore: 3 })).toBe("Low");
    });

    it("falls back to likelihood times impact when the inherent score is missing", () => {
        expect(inherentLevel({ likelihood: "4", impact: 4, inherentRisk: "Low" })).toBe("Very High");
        expect(inherentLevel({})).toBe("");
    });

    it("derives the residual level from residualScore only", () => {
        const risk = {
            residualScore: 6,
            residualRisk: "Low",
            contextSnapshot: { residualRisk: "Critical" },
        };
        expect(residualLevel(risk)).toBe("Medium");
        expect(residualLevel({ residualRisk: "Critical", contextSnapshot: { residualRisk: "High" } })).toBe("");
    });

    it("filters on the inherent level and counts High, Very High, and Critical", () => {
        const critical = { inherentScore: 25, residualScore: 2, residualRisk: "Critical" };
        const high = { inherentScore: 9 };
        const medium = { inherentScore: 6, residualScore: 20 };
        expect(matchesInherentLevel(critical, "Critical")).toBe(true);
        expect(matchesInherentLevel(critical, "High")).toBe(false);
        expect(matchesInherentLevel(medium, "Critical")).toBe(false);
        expect(matchesInherentLevel(high, "all")).toBe(true);
        expect(isHighOrCritical(critical)).toBe(true);
        expect(isHighOrCritical(high)).toBe(true);
        expect(isHighOrCritical(medium)).toBe(false);
    });

    it("sorts inherent and residual columns by the numeric scores", () => {
        const low = { inherentScore: 3, residualScore: 16 };
        const high = { inherentScore: 22, residualScore: 2 };
        expect(compareRegisterScores(low, high, "inherent")).toBeLessThan(0);
        expect(compareRegisterScores(low, high, "residual")).toBeGreaterThan(0);
        expect(compareRegisterScores({ inherentScore: null }, low, "inherent")).toBeLessThan(0);
    });

    it("counts a treatment when the Treatment column has a non-empty option", () => {
        expect(hasTreatmentOption({ contextSnapshot: { treatmentStrategy: "mitigate" }, treatmentOption: "" })).toBe(true);
        expect(hasTreatmentOption({ treatmentOption: "accept" })).toBe(true);
        expect(displayedTreatmentOption({ contextSnapshot: { treatmentStrategy: " transfer " } })).toBe("transfer");
        expect(hasTreatmentOption({ treatmentOption: "  " })).toBe(false);
        expect(hasTreatmentOption({ treatmentCount: 3 })).toBe(false);
    });
});
