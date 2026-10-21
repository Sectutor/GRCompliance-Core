import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    client: null as any,
    template: null as any,
    scope: null as string | null,
    scopeThrows: false,
}));

vi.mock("../../db", () => ({
    getDb: vi.fn(async () => ({
        query: {
            clients: { findFirst: async () => state.client },
            policyTemplates: { findFirst: async () => state.template },
        },
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => {
                        if (state.scopeThrows) {
                            throw new Error("relation risk_settings does not exist");
                        }
                        return state.scope == null ? [] : [{ scope: state.scope }];
                    },
                }),
            }),
        }),
    })),
}));

import { policyGenerator } from "./policy-generation";
import { MISSING_SYSTEM_SCOPE } from "./placeholders";

const client = {
    id: 7,
    name: "Latore LTD",
    industry: "Software",
    policyLanguage: "en",
};

const template = {
    id: 5,
    templateId: "POL-002",
    name: "Access Control Policy",
    content: "This policy {{policy_name}} covers systems within {{system_scope}} at {{company_name}}. Effective {{effective_date}}. Review {{review_date}}.",
    sections: null,
};

describe("PolicyGenerator.generate", () => {
    beforeEach(() => {
        state.client = client;
        state.template = template;
        state.scope = null;
        state.scopeThrows = false;
        policyGenerator.clearCaches();
        vi.restoreAllMocks();
    });

    function llm() {
        return vi.spyOn((policyGenerator as any).llmService, "generate");
    }

    it("fills advertised placeholders without calling the model when tailoring is off", async () => {
        const spy = llm();
        const result = await policyGenerator.generate(7, 5, { policyName: "Access Control Policy" });

        expect(spy).not.toHaveBeenCalled();
        expect(result.aiGenerated).toBe(false);
        expect(result.content).toContain("This policy Access Control Policy covers systems within");
        expect(result.content).toContain(MISSING_SYSTEM_SCOPE);
        expect(result.content).toContain("at Latore LTD");
        expect(result.content).not.toMatch(/\{\{/);
    });

    it("uses the workspace scope and lets a tailoring answer win", async () => {
        state.scope = "<p>Production SaaS</p>";
        const fromWorkspace = await policyGenerator.generate(7, 5, {});
        expect(fromWorkspace.aiGenerated).toBe(false);
        expect(fromWorkspace.content).toContain("within Production SaaS at Latore LTD");
        expect(fromWorkspace.content).toContain("Access Control Policy");

        policyGenerator.clearCaches();
        const fromAnswer = await policyGenerator.generate(7, 5, {
            answers: { system_scope: "the billing API only" },
        });
        expect(fromAnswer.content).toContain("within the billing API only at Latore LTD");
        expect(fromAnswer.aiGenerated).toBe(false);
    });

    it("marks the draft AI-generated only when the model returns text", async () => {
        const spy = llm();
        spy.mockResolvedValueOnce({ text: "AI DRAFT for Latore", provider: "test", model: "test" } as any);

        const written = await policyGenerator.generate(7, 5, { tailorToIndustry: true });
        expect(written.aiGenerated).toBe(true);
        expect(written.content).toBe("AI DRAFT for Latore");
        expect(spy).toHaveBeenCalledTimes(1);

        policyGenerator.clearCaches();
        spy.mockResolvedValueOnce({ text: "   ", provider: "test", model: "test" } as any);
        const empty = await policyGenerator.generate(7, 5, { customInstruction: "Make it shorter" });
        expect(empty.aiGenerated).toBe(false);
        expect(empty.content).toContain(MISSING_SYSTEM_SCOPE);
        expect(empty.content).not.toMatch(/\{\{/);

        policyGenerator.clearCaches();
        spy.mockRejectedValueOnce(new Error("No API key configured"));
        const failed = await policyGenerator.generate(7, 5, { tailorToIndustry: true });
        expect(failed.aiGenerated).toBe(false);
        expect(failed.content).toContain("Latore LTD");
        expect(failed.content).not.toMatch(/\{\{/);
    });

    it("still returns a substituted draft when the scope lookup fails", async () => {
        state.scopeThrows = true;
        const result = await policyGenerator.generate(7, 5, {});
        expect(result.aiGenerated).toBe(false);
        expect(result.content).toContain(MISSING_SYSTEM_SCOPE);
        expect(result.content).not.toMatch(/\{\{/);
    });
});
