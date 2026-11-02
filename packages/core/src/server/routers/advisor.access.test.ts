import { describe, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";

const harness = vi.hoisted(() => {
    const tables: Record<string, any[]> = {};
    return {
        tables,
        askQuestion: vi.fn(async () => ({ answer: "workspace data", sources: [] })),
        reset() {
            for (const key of Object.keys(tables)) delete tables[key];
            harness.askQuestion.mockClear();
        },
        async getDb() {
            const { getTableName } = await import("drizzle-orm");
            return {
                select() {
                    let name = "";
                    const rows = () => harness.tables[name] ?? [];
                    const api: any = {
                        from(table: any) {
                            name = getTableName(table);
                            return api;
                        },
                        where() { return api; },
                        orderBy() { return api; },
                        limit(n?: number) {
                            const all = rows();
                            return Promise.resolve(typeof n === "number" ? all.slice(0, n) : all);
                        },
                        then(ok: any, err: any) {
                            return Promise.resolve(rows()).then(ok, err);
                        },
                    };
                    return api;
                },
            };
        },
    };
});

vi.mock("../../db", () => ({
    getDb: () => harness.getDb(),
}));

vi.mock("../../lib/advisor/service", () => ({
    askQuestion: harness.askQuestion,
    suggestTechnologies: vi.fn(),
    generateImplementationPlan: vi.fn(),
    explainMapping: vi.fn(),
    generateVendorMitigationPlan: vi.fn(),
    analyzeRisk: vi.fn(),
    reindexKnowledgeBase: vi.fn(),
    generateRiskMitigationPlan: vi.fn(),
    generateBcpContent: vi.fn(async () => ""),
}));

import { createAdvisorRouter } from "./advisor";
import { createFrameworksRouter } from "./frameworks";
import { createHarmonizationRouter } from "./harmonization";
import { createTrustCenterRouter } from "./trustCenter";

const t = initTRPC.context<{ user: { id: number; role?: string | null } | null }>().create();
const app = t.router({
    advisor: createAdvisorRouter(t, t.procedure),
    frameworks: createFrameworksRouter(t, t.procedure),
    harmonization: createHarmonizationRouter(t, t.procedure),
    trustCenter: createTrustCenterRouter(t, t.procedure, t.procedure),
});

const outsider = app.createCaller({ user: { id: 4, role: "user" } });

describe("workspace id procedures reject a logged-in outsider", () => {
    it("does not let askQuestion read another workspace", async () => {
        harness.reset();
        harness.tables.user_clients = [{ userId: 4, clientId: 7, role: "editor", joinedAt: new Date("2020-01-01") }];
        await expect(outsider.advisor.askQuestion({
            clientId: 9,
            question: "What integrations are connected?",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(harness.askQuestion).not.toHaveBeenCalled();
    });

    it("does not let a logged-in outsider read or delete another workspace's framework work", async () => {
        harness.reset();
        harness.tables.user_clients = [{ userId: 4, clientId: 7, role: "editor", joinedAt: new Date("2020-01-01") }];
        await expect(outsider.frameworks.getWorkProcessData({ clientId: 9, frameworkId: "ISO27001" }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(outsider.frameworks.delete({ clientId: 9, frameworkName: "Custom" }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("does not let a logged-in outsider read another workspace's plan through harmonization", async () => {
        harness.reset();
        harness.tables.user_clients = [{ userId: 4, clientId: 7, role: "editor", joinedAt: new Date("2020-01-01") }];
        harness.tables.implementation_plans = [{ id: 3, clientId: 9, frameworkId: 1, status: "in_progress", title: "Secret" }];
        await expect(outsider.harmonization.analyzePlanHarmonization({ planId: 3 }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("returns not found when the plan does not exist", async () => {
        harness.reset();
        harness.tables.user_clients = [{ userId: 4, clientId: 7, role: "editor", joinedAt: new Date("2020-01-01") }];
        await expect(outsider.harmonization.analyzePlanHarmonization({ planId: 99 }))
            .rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("does not let a logged-in outsider list another workspace's trust-center visitors", async () => {
        harness.reset();
        harness.tables.user_clients = [{ userId: 4, clientId: 7, role: "editor", joinedAt: new Date("2020-01-01") }];
        await expect(outsider.trustCenter.listVisitors({ clientId: 9 }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
});
