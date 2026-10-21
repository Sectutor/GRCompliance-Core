import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { backfillResidualHeatmapAxes, residualHeatmapBackfillPatch } from "./backfillResidualHeatmapAxes";

describe("residualHeatmapBackfillPatch", () => {
    it("fills both axes only when both are missing and a residual score exists", () => {
        expect(residualHeatmapBackfillPatch({
            residualScore: 11,
            contextSnapshot: { description: "keep", residualRisk: "High" },
        })).toEqual({
            contextSnapshot: {
                description: "keep",
                residualRisk: "High",
                residualLikelihood: "3",
                residualImpact: "4",
            },
        });

        expect(residualHeatmapBackfillPatch({
            residualScore: 16,
            contextSnapshot: null,
        })).toEqual({
            contextSnapshot: { residualLikelihood: "4", residualImpact: "4" },
        });
    });

    it("leaves seeded pairs, a single stored axis, and rows without a residual score", () => {
        const seeded = {
            residualScore: 6,
            contextSnapshot: { residualLikelihood: "5", residualImpact: "1", source: "seed" },
        };
        expect(residualHeatmapBackfillPatch(seeded)).toBeNull();
        expect(residualHeatmapBackfillPatch({
            residualScore: 8,
            contextSnapshot: { residualLikelihood: "2" },
        })).toBeNull();
        expect(residualHeatmapBackfillPatch({
            residualScore: null,
            contextSnapshot: { description: "open" },
        })).toBeNull();
        expect(residualHeatmapBackfillPatch({
            residualScore: 9,
            contextSnapshot: ["not-an-object"],
        })).toBeNull();
    });
});

describe("backfillResidualHeatmapAxes", () => {
    it("updates a missing pair once and does not change the residual score", async () => {
        const rows = [
            { id: 1, residualScore: 7, contextSnapshot: { description: "open" } },
            { id: 2, residualScore: 10, contextSnapshot: { residualLikelihood: "2", residualImpact: "5" } },
        ];
        const updates: unknown[] = [];
        const db = {
            select: () => ({ from: async () => rows }),
            update: () => ({
                set: (patch: unknown) => ({
                    where: async () => {
                        updates.push(patch);
                    },
                }),
            }),
        };

        await expect(backfillResidualHeatmapAxes(db)).resolves.toEqual({ updated: 1 });
        expect(updates).toEqual([{
            contextSnapshot: {
                description: "open",
                residualLikelihood: "2",
                residualImpact: "3",
            },
        }]);
        expect(updates[0]).not.toHaveProperty("residualScore");

        rows[0] = {
            id: 1,
            residualScore: 7,
            contextSnapshot: (updates[0] as { contextSnapshot: { description: string; residualLikelihood: string; residualImpact: string } }).contextSnapshot,
        };
        await expect(backfillResidualHeatmapAxes(db)).resolves.toEqual({ updated: 0 });
    });

    it("runs from docker bootstrap after the stored-word correction", () => {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const bootstrap = readFileSync(path.resolve(here, "../../../../../docker/bootstrap.ts"), "utf8");
        const correctAt = bootstrap.indexOf("await correctStoredRiskLevelWords(");
        const backfillAt = bootstrap.indexOf("await backfillResidualHeatmapAxes(");
        expect(backfillAt).toBeGreaterThan(correctAt);
    });
});
