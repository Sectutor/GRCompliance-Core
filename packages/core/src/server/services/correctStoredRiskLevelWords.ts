import { eq } from "drizzle-orm";
import { riskAssessments } from "../../schema";
import { getMatrixScoreLevel } from "../../lib/riskCalculations";

export interface StoredRiskLevelRow {
    id?: number;
    inherentScore: number | null;
    residualScore: number | null;
    inherentRisk: string | null;
    residualRisk: string | null;
    contextSnapshot: unknown;
}

/**
 * Level words to write for one stored row.
 * Scores, likelihood, impact, and ids are not part of the result.
 * A missing score leaves that word alone. A missing snapshot is not created.
 * Returns null when every stored word already matches getMatrixScoreLevel.
 */
export function correctedRiskLevelPatch(row: StoredRiskLevelRow): {
    inherentRisk?: string;
    residualRisk?: string;
    contextSnapshot?: Record<string, unknown>;
} | null {
    const patch: {
        inherentRisk?: string;
        residualRisk?: string;
        contextSnapshot?: Record<string, unknown>;
    } = {};

    if (isScore(row.inherentScore)) {
        const word = getMatrixScoreLevel(Number(row.inherentScore));
        if (row.inherentRisk !== word) patch.inherentRisk = word;
    }

    let residualWord: string | null = null;
    if (isScore(row.residualScore)) {
        residualWord = getMatrixScoreLevel(Number(row.residualScore));
        if (row.residualRisk !== residualWord) patch.residualRisk = residualWord;
    }

    const snapshot = snapshotObject(row.contextSnapshot);
    if (snapshot && residualWord && snapshot.residualRisk !== residualWord) {
        patch.contextSnapshot = { ...snapshot, residualRisk: residualWord };
    }

    return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Rewrite inherent_risk, residual_risk, and context_snapshot.residualRisk
 * from the stored scores. Running it twice changes nothing.
 * Residual scores themselves are not recalculated.
 */
export async function correctStoredRiskLevelWords(db: {
    select: (...args: any[]) => any;
    update: (...args: any[]) => any;
}): Promise<{ updated: number }> {
    const rows = await db.select({
        id: riskAssessments.id,
        inherentScore: riskAssessments.inherentScore,
        residualScore: riskAssessments.residualScore,
        inherentRisk: riskAssessments.inherentRisk,
        residualRisk: riskAssessments.residualRisk,
        contextSnapshot: riskAssessments.contextSnapshot,
    }).from(riskAssessments);

    let updated = 0;
    for (const row of rows as StoredRiskLevelRow[]) {
        const patch = correctedRiskLevelPatch(row);
        if (!patch || row.id == null) continue;
        await db.update(riskAssessments).set(patch).where(eq(riskAssessments.id, row.id));
        updated += 1;
    }
    return { updated };
}

function isScore(value: number | null): boolean {
    return typeof value === "number" && Number.isFinite(value);
}

function snapshotObject(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "string") {
        try {
            return snapshotObject(JSON.parse(value));
        } catch {
            return null;
        }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>) };
    }
    return null;
}
