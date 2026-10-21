import { eq } from "drizzle-orm";
import { riskAssessments } from "../../schema";
import { residualHeatmapAxes } from "../../lib/riskCalculations";

/**
 * Add residualLikelihood and residualImpact to contextSnapshot when both are missing
 * and residualScore is a finite number. Seeded pairs, a single existing axis, and
 * null residual scores are left alone. Scores and level words are not rewritten.
 * A snapshot that is not an object (and not JSON for an object) is left alone.
 * A null snapshot becomes an object that holds only the two axes.
 */
export function residualHeatmapBackfillPatch(row: {
    residualScore: unknown;
    contextSnapshot: unknown;
}): { contextSnapshot: Record<string, unknown> } | null {
    if (typeof row.residualScore !== "number" || !Number.isFinite(row.residualScore)) return null;

    const parsed = snapshotObject(row.contextSnapshot);
    if (parsed === undefined) return null;
    const snapshot = parsed ?? {};
    if (axisPresent(snapshot.residualLikelihood) || axisPresent(snapshot.residualImpact)) return null;

    return {
        contextSnapshot: {
            ...snapshot,
            ...residualHeatmapAxes(row.residualScore),
        },
    };
}

export async function backfillResidualHeatmapAxes(db: {
    select: (...args: any[]) => any;
    update: (...args: any[]) => any;
}): Promise<{ updated: number }> {
    const rows = await db.select({
        id: riskAssessments.id,
        residualScore: riskAssessments.residualScore,
        contextSnapshot: riskAssessments.contextSnapshot,
    }).from(riskAssessments);

    let updated = 0;
    for (const row of rows as { id?: number; residualScore: unknown; contextSnapshot: unknown }[]) {
        const patch = residualHeatmapBackfillPatch(row);
        if (!patch || row.id == null) continue;
        await db.update(riskAssessments).set(patch).where(eq(riskAssessments.id, row.id));
        updated += 1;
    }
    return { updated };
}

function axisPresent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    return true;
}

/** null when there is no snapshot. undefined when the value cannot be merged safely. */
function snapshotObject(value: unknown): Record<string, unknown> | null | undefined {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
        try {
            return snapshotObject(JSON.parse(value));
        } catch {
            return undefined;
        }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>) };
    }
    return undefined;
}
