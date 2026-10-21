import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import { calculateMultiControlResidualScore, getMatrixScoreLevel, parseLikelihoodImpact, residualHeatmapAxes } from "../../lib/riskCalculations";

export const recalculateRiskScore = async (db: any, riskAssessmentId: number) => {
    try {
        const [risk] = await db.select().from(schema.riskAssessments).where(eq(schema.riskAssessments.id, riskAssessmentId));
        if (!risk) return;

        const treatments = await db.select()
            .from(schema.riskTreatments)
            .where(eq(schema.riskTreatments.riskAssessmentId, riskAssessmentId));

        const controls: { effectiveness?: string | null }[] = [];
        for (const treatment of treatments) {
            const linked = await db.select()
                .from(schema.treatmentControls)
                .where(eq(schema.treatmentControls.treatmentId, treatment.id));
            controls.push(...linked);
        }

        const likelihood = parseLikelihoodImpact(risk.likelihood);
        const impact = parseLikelihoodImpact(risk.impact);
        const inherentScore = Number(risk.inherentScore) || (likelihood * impact);

        const residualScore = calculateMultiControlResidualScore(inherentScore, controls);
        const residualRisk = getMatrixScoreLevel(residualScore);

        console.log(`[RiskCalc] Risk ${riskAssessmentId}: Inherent ${inherentScore} -> Residual ${residualScore} (${residualRisk})`);

        const snapshot = snapshotObject(risk.contextSnapshot);
        const axes = residualHeatmapAxes(residualScore);
        const contextSnapshot = snapshot
            ? { ...snapshot, residualScore, residualRisk, ...axes }
            : risk.contextSnapshot == null
                ? { residualScore, residualRisk, ...axes }
                : null;
        await db.update(schema.riskAssessments)
            .set({
                residualScore,
                residualRisk,
                ...(contextSnapshot ? { contextSnapshot } : {}),
                updatedAt: new Date()
            })
            .where(eq(schema.riskAssessments.id, riskAssessmentId));
    } catch (error) {
        console.error(`[RiskCalc] Failed to recalculate score for risk ${riskAssessmentId}:`, error);
    }
};

function snapshotObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return { ...(value as Record<string, unknown>) };
}
