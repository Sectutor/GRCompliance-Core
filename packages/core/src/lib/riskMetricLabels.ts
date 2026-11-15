/**
 * Two different risk counts are shown for the same workspace.
 *
 * Residual: assessments whose residual rating is still High or Critical.
 * Inherent untreated: assessments whose inherent score is at least 15 and
 * that have no treatment record. The seed labels that band "High", and a
 * treatment choice stored on the assessment is not a treatment record.
 */
export const RESIDUAL_HIGH_LABEL = "high or critical residual risks";
export const INHERENT_UNTREATED_LABEL = "High inherent risks with no treatment";

export function residualRiskInsight(count: number) {
    const noun = count === 1 ? "high or critical residual risk" : RESIDUAL_HIGH_LABEL;
    return {
        title: `${count} ${noun}`,
        description: "Residual rating is still high or critical. This is not the count of high inherent risks that have no treatment record.",
    };
}

/** Same bands as the risk register footer: stored inherent High, Very High, or Critical. */
export function isRegisterHighRisk(inherentRisk: string | null | undefined): boolean {
    return inherentRisk === "High" || inherentRisk === "Very High" || inherentRisk === "Critical";
}

export function registerHighRiskInsight(count: number) {
    const noun = count === 1 ? "high risk" : "high risks";
    return {
        title: `${count} ${noun}`,
        description: "Inherent rating is high, very high, or critical. This is the same count as High/Critical on the risk register.",
    };
}

/**
 * A risk has a treatment when a treatment row exists, or when the register
 * already shows a treatment choice on the assessment.
 */
export function riskHasTreatment(risk: {
    treatmentCount?: number | null;
    treatmentOption?: string | null;
    contextSnapshot?: { treatmentStrategy?: string | null } | null;
}): boolean {
    const count = Number(risk.treatmentCount ?? 0);
    if (Number.isFinite(count) && count > 0) return true;
    const strategy = (risk.treatmentOption || risk.contextSnapshot?.treatmentStrategy || "").trim();
    if (!strategy || strategy === "-") return false;
    return strategy.toLowerCase() !== "none";
}
