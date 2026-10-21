/**
 * Two different risk counts are shown for the same workspace.
 *
 * Residual: assessments whose residual rating is still High or Critical.
 * Inherent untreated: assessments whose inherent score is at least 15 and
 * that have no treatment record. getMatrixScoreLevel names that band
 * Very High from 15 and Critical from 20. A treatment choice stored on
 * the assessment is not a treatment record.
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
