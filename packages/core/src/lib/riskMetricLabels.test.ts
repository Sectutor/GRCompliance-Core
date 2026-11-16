import { describe, expect, it } from "vitest";
import { INHERENT_UNTREATED_LABEL, RESIDUAL_HIGH_LABEL, isRegisterHighRisk, registerHighRiskInsight, residualRiskInsight, riskHasTreatment } from "./riskMetricLabels";

describe("risk metric labels", () => {
    it("uses different names for residual risk and untreated inherent risk", () => {
        expect(RESIDUAL_HIGH_LABEL).not.toBe(INHERENT_UNTREATED_LABEL);
        expect(RESIDUAL_HIGH_LABEL.toLowerCase()).toContain("residual");
        expect(INHERENT_UNTREATED_LABEL.toLowerCase()).toContain("inherent");
        expect(INHERENT_UNTREATED_LABEL.toLowerCase()).toContain("no treatment");
        expect(INHERENT_UNTREATED_LABEL.toLowerCase()).not.toContain("unmitigated");
    });

    it("states that the dashboard insight is the residual count", () => {
        const insight = residualRiskInsight(2);
        expect(insight.title).toBe("2 high or critical residual risks");
        expect(insight.description.toLowerCase()).toContain("residual");
        expect(insight.description.toLowerCase()).toContain("treatment record");
    });

    it("counts the same inherent bands the risk register footer counts", () => {
        expect(isRegisterHighRisk("High")).toBe(true);
        expect(isRegisterHighRisk("Very High")).toBe(true);
        expect(isRegisterHighRisk("Critical")).toBe(true);
        expect(isRegisterHighRisk("Medium")).toBe(false);
        expect(registerHighRiskInsight(9).title).toBe("9 high risks");
    });

    it("counts a treatment choice stored on the assessment, not only a treatment row", () => {
        expect(riskHasTreatment({ treatmentCount: 0, treatmentOption: "Mitigate" })).toBe(true);
        expect(riskHasTreatment({ treatmentCount: 1, treatmentOption: null })).toBe(true);
        expect(riskHasTreatment({ treatmentCount: 0, treatmentOption: "None" })).toBe(false);
        expect(riskHasTreatment({ treatmentCount: 0, treatmentOption: null, contextSnapshot: { treatmentStrategy: "Accept" } })).toBe(true);
        expect(riskHasTreatment({ treatmentCount: 0, treatmentOption: "" })).toBe(false);
    });
});
