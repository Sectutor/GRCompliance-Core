import { describe, expect, it } from "vitest";
import { riskAssessments, riskTreatments, treatmentControls } from "../../schema";
import { recalculateRiskScore } from "./riskService";

describe("recalculateRiskScore", () => {
    it("stores the shared multi-control score and the matching level word", async () => {
        const risk = {
            id: 4,
            likelihood: "4",
            impact: "4",
            inherentScore: 16,
            contextSnapshot: { description: "keep", residualRisk: "Medium" },
        };
        let written: Record<string, unknown> | null = null;
        const db = {
            select() {
                const state: { table: unknown } = { table: null };
                const chain: any = {
                    from(table: unknown) {
                        state.table = table;
                        return chain;
                    },
                    where() {
                        if (state.table === riskAssessments) return Promise.resolve([risk]);
                        if (state.table === riskTreatments) return Promise.resolve([{ id: 8 }]);
                        if (state.table === treatmentControls) {
                            return Promise.resolve([
                                { effectiveness: "effective" },
                                { effectiveness: "partially_effective" },
                            ]);
                        }
                        return Promise.resolve([]);
                    },
                };
                return chain;
            },
            update() {
                return {
                    set(patch: Record<string, unknown>) {
                        written = patch;
                        return { where: async () => [] };
                    },
                };
            },
        };

        await recalculateRiskScore(db, 4);

        expect(written).toMatchObject({
            residualScore: 6,
            residualRisk: "Medium",
            contextSnapshot: {
                description: "keep",
                residualScore: 6,
                residualRisk: "Medium",
            },
        });
        expect(written).not.toHaveProperty("inherentScore");
    });
});
