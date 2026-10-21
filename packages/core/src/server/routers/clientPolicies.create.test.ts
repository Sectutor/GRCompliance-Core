import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
    getDb: vi.fn(),
    getClientById: vi.fn(),
    getClientPolicies: vi.fn(),
    createClientPolicy: vi.fn(),
}));

vi.mock("../../lib/audit", () => ({
    logActivity: vi.fn(),
}));

import * as db from "../../db";
import { policyGenerator } from "../../lib/policy/policy-generation";
import { createClientPoliciesRouter, createClientPolicyInput } from "./clientPolicies";

const procedure = {
    input: () => ({
        query: (handler: any) => handler,
        mutation: (handler: any) => handler,
    }),
};

const t = { router: (handlers: any) => handlers };

function router() {
    return createClientPoliciesRouter(t, procedure, procedure, procedure, procedure);
}

const ctx = { user: { id: 1, name: "Alex Morgan" } };

describe("clientPolicies.create AI flag", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.getClientById).mockResolvedValue({ id: 1, name: "Latore LTD", planTier: "free" } as any);
        vi.mocked(db.getClientPolicies).mockResolvedValue([] as any);
        vi.mocked(db.createClientPolicy).mockImplementation(async (data: any) => ({ id: 42, ...data }));
    });

    it("does not accept isAiGenerated on the create input", () => {
        const parsed = createClientPolicyInput.parse({
            clientId: 1,
            name: "Access Control Policy",
            templateId: 5,
            content: "manual",
            isAiGenerated: true,
        });
        expect(parsed).not.toHaveProperty("isAiGenerated");
    });

    it("does not badge a template draft when the model did not write it", async () => {
        vi.spyOn(policyGenerator, "generate").mockResolvedValue({
            content: "Systems within [System Scope] at Latore LTD.",
            aiGenerated: false,
        });

        const created = await router().create({
            input: {
                clientId: 1,
                templateId: 5,
                name: "Access Control Policy",
                tailor: false,
                isAiGenerated: true,
            },
            ctx,
        });

        expect(policyGenerator.generate).toHaveBeenCalledWith(1, 5, expect.objectContaining({
            tailorToIndustry: false,
            policyName: "Access Control Policy",
        }));
        expect(db.createClientPolicy).toHaveBeenCalledWith(expect.objectContaining({
            content: "Systems within [System Scope] at Latore LTD.",
            isAiGenerated: false,
            name: "Access Control Policy",
        }));
        expect(created.isAiGenerated).toBe(false);
    });

    it("badges the draft when generation reports the model wrote it", async () => {
        vi.spyOn(policyGenerator, "generate").mockResolvedValue({
            content: "AI DRAFT",
            aiGenerated: true,
        });

        await router().create({
            input: {
                clientId: 1,
                templateId: 5,
                name: "Access Control Policy",
                tailor: true,
                instruction: "Use formal UK English",
            },
            ctx,
        });

        expect(db.createClientPolicy).toHaveBeenCalledWith(expect.objectContaining({
            content: "AI DRAFT",
            isAiGenerated: true,
        }));
    });

    it("does not badge a draft when tailoring was requested but the model produced nothing", async () => {
        vi.spyOn(policyGenerator, "generate").mockResolvedValue({
            content: "substituted template",
            aiGenerated: false,
        });

        await router().create({
            input: {
                clientId: 1,
                templateId: 5,
                name: "Access Control Policy",
                tailor: true,
            },
            ctx,
        });

        expect(db.createClientPolicy).toHaveBeenCalledWith(expect.objectContaining({
            isAiGenerated: false,
            content: "substituted template",
        }));
    });

    it("does not badge a section skeleton when AI did not run", async () => {
        vi.spyOn(policyGenerator, "generateFromSections").mockResolvedValue({
            content: "# Access Control Policy\n\n## Purpose",
            aiGenerated: false,
        });

        await router().create({
            input: {
                clientId: 1,
                name: "Access Control Policy",
                sections: ["Purpose"],
                isAiGenerated: true,
            },
            ctx,
        });

        expect(policyGenerator.generate).not.toHaveBeenCalled();
        expect(policyGenerator.generateFromSections).toHaveBeenCalled();
        expect(db.createClientPolicy).toHaveBeenCalledWith(expect.objectContaining({
            isAiGenerated: false,
        }));
    });

    it("does not badge content the client supplied", async () => {
        const generate = vi.spyOn(policyGenerator, "generate");
        await router().create({
            input: {
                clientId: 1,
                templateId: 5,
                name: "Access Control Policy",
                content: "Written by hand",
                tailor: true,
                isAiGenerated: true,
            },
            ctx,
        });

        expect(generate).not.toHaveBeenCalled();
        expect(db.createClientPolicy).toHaveBeenCalledWith(expect.objectContaining({
            content: "Written by hand",
            isAiGenerated: false,
        }));
    });
});
