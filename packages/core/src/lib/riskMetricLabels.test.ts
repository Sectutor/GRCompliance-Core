import { describe, expect, it } from "vitest";
import { INHERENT_UNTREATED_LABEL, RESIDUAL_HIGH_LABEL, residualRiskInsight } from "./riskMetricLabels";

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
});
