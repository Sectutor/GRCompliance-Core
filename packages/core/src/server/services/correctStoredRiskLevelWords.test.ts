import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getMatrixScoreLevel, MATRIX_SCORE_BANDS } from "../../lib/riskCalculations";
import { correctedRiskLevelPatch, correctStoredRiskLevelWords } from "./correctStoredRiskLevelWords";

describe("getMatrixScoreLevel", () => {
    it("matches the agreed bands for every score from 1 to 25", () => {
        const expected: Record<number, string> = {};
        for (const band of MATRIX_SCORE_BANDS) {
            for (let score = band.min; score <= band.max; score++) expected[score] = band.level;
        }
        for (let score = 1; score <= 25; score++) {
            expect(getMatrixScoreLevel(score)).toBe(expected[score]);
        }
        expect(getMatrixScoreLevel(8)).toBe("High");
        expect(getMatrixScoreLevel(15)).toBe("Very High");
        expect(getMatrixScoreLevel(20)).toBe("Critical");
        expect(getMatrixScoreLevel(0)).toBe("Low");
        expect(getMatrixScoreLevel(26)).toBe("Critical");
    });
});

describe("correctedRiskLevelPatch", () => {
    it("rewrites level words from stored scores and leaves the scores alone", () => {
        const patch = correctedRiskLevelPatch({
            inherentScore: 15,
            residualScore: 20,
            inherentRisk: "High",
            residualRisk: "High",
            contextSnapshot: { residualRisk: "High", residualLikelihood: "2", description: "keep" },
        });

        expect(patch).toEqual({
            inherentRisk: "Very High",
            residualRisk: "Critical",
            contextSnapshot: { residualRisk: "Critical", residualLikelihood: "2", description: "keep" },
        });
        expect(patch).not.toHaveProperty("inherentScore");
        expect(patch).not.toHaveProperty("residualScore");
    });

    it("is idempotent and does not invent a snapshot or a word without a score", () => {
        expect(correctedRiskLevelPatch({
            inherentScore: 8,
            residualScore: null,
            inherentRisk: "High",
            residualRisk: "High",
            contextSnapshot: null,
        })).toBeNull();

        const once = correctedRiskLevelPatch({
            inherentScore: 16,
            residualScore: 8,
            inherentRisk: "High",
            residualRisk: "Medium",
            contextSnapshot: "{\"residualRisk\":\"Medium\"}",
        });
        expect(once).toEqual({
            inherentRisk: "Very High",
            residualRisk: "High",
            contextSnapshot: { residualRisk: "High" },
        });
        expect(correctedRiskLevelPatch({
            inherentScore: 16,
            residualScore: 8,
            inherentRisk: "Very High",
            residualRisk: "High",
            contextSnapshot: once!.contextSnapshot,
        })).toBeNull();
    });
});

describe("correctStoredRiskLevelWords", () => {
    it("updates only rows whose words differ and then stops", async () => {
        const rows = [
            {
                id: 1,
                inherentScore: 20,
                residualScore: 6,
                inherentRisk: "High",
                residualRisk: "Medium",
                contextSnapshot: { residualRisk: "Medium" },
            },
            {
                id: 2,
                inherentScore: 6,
                residualScore: 6,
                inherentRisk: "Medium",
                residualRisk: "Medium",
                contextSnapshot: { residualRisk: "Medium" },
            },
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

        await expect(correctStoredRiskLevelWords(db)).resolves.toEqual({ updated: 1 });
        expect(updates).toEqual([{ inherentRisk: "Critical" }]);

        rows[0] = { ...rows[0], inherentRisk: "Critical" };
        await expect(correctStoredRiskLevelWords(db)).resolves.toEqual({ updated: 0 });
    });

    it("runs from docker bootstrap after the default seed and does not reseed", () => {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const bootstrap = readFileSync(path.resolve(here, "../../../../../docker/bootstrap.ts"), "utf8");
        const seedAt = bootstrap.indexOf("await ensureDefaultDataSeeded()");
        const correctAt = bootstrap.indexOf("await correctStoredRiskLevelWords(");
        expect(correctAt).toBeGreaterThan(seedAt);
        expect(bootstrap).not.toContain("reseed");
    });
});
