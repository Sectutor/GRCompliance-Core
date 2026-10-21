import { getMatrixScoreLevel } from "../../lib/riskCalculations";

const OPTIONAL_UPDATE_FIELDS = [
    "threatId",
    "vulnerabilityId",
    "riskOwner",
    "fismaSystemId",
    "treatmentOption",
    "priority",
    "residualScore",
    "residualRisk",
    "existingControls",
    "controlEffectiveness",
    "threatDescription",
    "projectId",
    "category",
    "owaspCategory",
    "csfFunction",
    "privacyImpact",
    "assessor",
    "method",
    "vulnerabilityDescription",
    "affectedAssets",
    "recommendedActions",
    "targetResidualRisk",
    "notes",
    "controlIds",
    "aiRmfCategory",
] as const;

/**
 * Columns written when an existing assessment is saved from the wizard.
 * Status is never changed. Omitted fields are left out of the patch so
 * notes, review dates, and other columns the wizard does not send stay put.
 * contextSnapshot is merged onto the stored object.
 */
export function riskAssessmentUpdatePatch(input: Record<string, any>, existing: Record<string, any>) {
    const likelihood = input.likelihood;
    const impact = input.impact;
    const inherentScore = likelihood * impact;
    const patch: Record<string, unknown> = {
        clientId: existing.clientId,
        title: input.title,
        likelihood: String(likelihood),
        impact: String(impact),
        inherentScore,
        inherentRisk: getMatrixScoreLevel(inherentScore),
        updatedAt: new Date(),
    };

    for (const key of OPTIONAL_UPDATE_FIELDS) {
        if (input[key] !== undefined) patch[key] = input[key];
    }

    if (input.assessmentDate) patch.assessmentDate = new Date(input.assessmentDate);
    if (input.reviewDueDate) patch.reviewDueDate = new Date(input.reviewDueDate);
    if (input.nextReviewDate) patch.nextReviewDate = new Date(input.nextReviewDate);

    if (input.contextSnapshot !== undefined) {
        const previous = existing.contextSnapshot && typeof existing.contextSnapshot === "object" && !Array.isArray(existing.contextSnapshot)
            ? existing.contextSnapshot
            : {};
        patch.contextSnapshot = { ...previous, ...input.contextSnapshot };
    }

    return patch;
}
