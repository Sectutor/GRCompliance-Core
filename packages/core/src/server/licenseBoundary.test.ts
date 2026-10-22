import { readFileSync } from "node:fs";
import http from "node:http";
import type { Server } from "node:http";
import path from "node:path";
import express from "express";
import { describe, expect, it, vi } from "vitest";
import {
    canCreateAnotherWorkspace,
    communityWorkspaceAllows,
    LATORE_DEMO_NAME,
    premiumRouteAllowed,
} from "../lib/edition";

vi.mock("../db", () => ({
    getDb: async () => {
        throw new Error("premium gate must not touch the database");
    },
    getUserById: async () => {
        throw new Error("premium gate must not touch the database");
    },
}));

import { requirePremiumEdition } from "./trpc";

const guard = (requirePremiumEdition as unknown as {
    _middlewares: Array<(opts: unknown) => Promise<unknown>>;
})._middlewares[0];

const repoRoot = path.resolve(__dirname, "../../../..");

async function expectForbidden(role: string, clientRole: string, flag: string | undefined) {
    const previous = process.env.VITE_ENABLE_PREMIUM;
    if (flag === undefined) delete process.env.VITE_ENABLE_PREMIUM;
    else process.env.VITE_ENABLE_PREMIUM = flag;
    try {
        await expect(guard({
            ctx: {
                user: { id: 1, role, email: `${role}@example.com` },
                clientRole,
                clientId: 1,
                req: {},
                res: {},
            },
            rawInput: { clientId: 1 },
            path: "adversaryIntel.getSecurityFeeds",
            type: "query",
            next: () => ({ ok: true }),
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
        if (previous === undefined) delete process.env.VITE_ENABLE_PREMIUM;
        else process.env.VITE_ENABLE_PREMIUM = previous;
    }
}

describe("premium edition gate", () => {
    it("forbids the seeded admin when the flag is false or unset", async () => {
        await expectForbidden("admin", "owner", "false");
        await expectForbidden("admin", "owner", undefined);
    });

    it("forbids a client owner when the flag is false or unset", async () => {
        await expectForbidden("member", "owner", "false");
        await expectForbidden("member", "owner", undefined);
    });

    it("forbids a client admin the same way", async () => {
        await expectForbidden("member", "admin", "false");
        await expectForbidden("member", "admin", undefined);
    });

    it("allows the procedure only for the exact flag, ignoring role and plan", async () => {
        const previous = process.env.VITE_ENABLE_PREMIUM;
        process.env.VITE_ENABLE_PREMIUM = "true";
        try {
            const result = await guard({
                ctx: {
                    user: { id: 1, role: "admin", email: "admin@example.com" },
                    clientRole: "owner",
                    clientId: 1,
                    req: {},
                    res: {},
                },
                rawInput: { clientId: 1 },
                path: "adversaryIntel.getSecurityFeeds",
                type: "query",
                next: () => ({ ok: true }),
            });
            expect(result).toEqual({ ok: true });
        } finally {
            if (previous === undefined) delete process.env.VITE_ENABLE_PREMIUM;
            else process.env.VITE_ENABLE_PREMIUM = previous;
        }
    });

    it("does not treat an administrator or owner as premium in the route guard", () => {
        const actor = { globalRole: "admin", clientRole: "owner", planTier: "enterprise" };
        expect(premiumRouteAllowed("false", actor)).toBe(false);
        expect(premiumRouteAllowed(undefined, actor)).toBe(false);
        expect(premiumRouteAllowed("TRUE", actor)).toBe(false);
        expect(premiumRouteAllowed("true", { globalRole: "admin", clientRole: "owner", planTier: "free" })).toBe(true);
    });
});

describe("workspace capacity includes administrators", () => {
    it("lets Latore seed data sit beside one real workspace", () => {
        expect(canCreateAnotherWorkspace({
            premiumFlag: undefined,
            ownedNames: [LATORE_DEMO_NAME],
            maxClients: 2,
        })).toBe(true);
        expect(canCreateAnotherWorkspace({
            premiumFlag: "false",
            ownedNames: [LATORE_DEMO_NAME, "Acme"],
            maxClients: 2,
        })).toBe(false);
        expect(canCreateAnotherWorkspace({
            premiumFlag: undefined,
            ownedNames: ["Acme"],
            maxClients: 2,
        })).toBe(false);
    });

    it("counts a premium administrator against maxClients", () => {
        expect(canCreateAnotherWorkspace({
            premiumFlag: "true",
            ownedNames: [LATORE_DEMO_NAME, "Acme"],
            maxClients: 2,
        })).toBe(false);
        expect(canCreateAnotherWorkspace({
            premiumFlag: "true",
            ownedNames: ["Acme"],
            maxClients: 2,
        })).toBe(true);
    });

    it("keeps the second real workspace closed, including for an admin membership", () => {
        const memberships = [
            { clientId: 1, name: LATORE_DEMO_NAME },
            { clientId: 2, name: "Acme" },
            { clientId: 3, name: "Beta" },
        ];
        expect(communityWorkspaceAllows(memberships, 1)).toBe(true);
        expect(communityWorkspaceAllows(memberships, 2)).toBe(true);
        expect(communityWorkspaceAllows(memberships, 3)).toBe(false);
    });

    it("does not exempt administrators in the create path", () => {
        const source = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/clients.ts"), "utf8");
        expect(source).toContain("assertCanOwnAnotherWorkspace");
        expect(source).not.toContain("!isGlobalAdmin");
    });
});

describe("community seed stays non-destructive", () => {
    it("still seeds controls and the Latore demo without deleting rows", () => {
        const bootstrap = readFileSync(path.join(repoRoot, "docker/bootstrap.ts"), "utf8");
        const db = readFileSync(path.join(repoRoot, "packages/core/src/db.ts"), "utf8");
        expect(bootstrap).toContain("ensureDefaultDataSeeded()");
        expect(bootstrap).toContain("Latore LTD");
        expect(bootstrap).not.toMatch(/DELETE\s+FROM/i);
        expect(db).toContain("export async function ensureDefaultDataSeeded");
        expect(db).toContain("export async function seedSampleData");
        const seeder = db.slice(db.indexOf("export async function ensureDefaultDataSeeded"));
        expect(seeder.slice(0, 800)).not.toMatch(/\.(delete|truncate)\(/);
    });
});

describe("public AI entry points stay closed", () => {
    it("returns 401 for an anonymous generate-stream call", async () => {
        const { aiRouter } = await import("./routers/ai");
        const app = express();
        app.use("/api/ai", aiRouter);
        const server: Server = await new Promise((resolve) => {
            const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
        });
        try {
            const address = server.address();
            if (!address || typeof address === "string") throw new Error("listener has no port");
            const payload = JSON.stringify({ userPrompt: "draft a policy" });
            const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
                const req = http.request({
                    hostname: "127.0.0.1",
                    port: address.port,
                    path: "/api/ai/generate-stream",
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "content-length": Buffer.byteLength(payload),
                    },
                }, (res) => {
                    const chunks: Buffer[] = [];
                    res.on("data", (chunk) => chunks.push(chunk));
                    res.on("end", () => resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString("utf8"),
                    }));
                });
                req.on("error", reject);
                req.end(payload);
            });
            expect(response.status).toBe(401);
            expect(JSON.parse(response.body)).toEqual({ error: "Unauthorized" });
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it("removes the public legacy generators", () => {
        const routers = readFileSync(path.join(repoRoot, "packages/core/src/routers.ts"), "utf8");
        const evidence = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/evidence.ts"), "utf8");
        const ai = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/ai.ts"), "utf8");
        expect(routers).not.toContain("aiLegacy1");
        expect(routers).not.toContain("aiLegacy2");
        expect(evidence).not.toContain("analyze: publicProcedure");
        expect(evidence).not.toContain("llmService");
        expect(ai).not.toContain("llmService");
        expect(ai).toContain("status(401)");
    });
});

describe("premium product routers use the fail-closed gate", () => {
    it("wraps the named premium routers and leaves community procedures open", () => {
        const routers = readFileSync(path.join(repoRoot, "packages/core/src/routers.ts"), "utf8");
        const gated = [
            "crm: createCrmRouter(t, clientProcedure.use(requirePremiumEdition))",
            "sales: createSalesRouter(t, clientProcedure.use(requirePremiumEdition))",
            "federal: createFederalRouter(t, clientProcedure.use(requirePremiumEdition))",
            "threatModels: createThreatModelsRouter(t, clientProcedure.use(requirePremiumEdition))",
            "globalCrm: createGlobalCrmRouter(t, adminProcedure.use(requirePremiumEdition))",
            "systems: createAiSystemsRouter(t, clientProcedure.use(requirePremiumEdition))",
            "studio: createStudioRouter(t, protectedProcedure.use(requirePremiumEdition))",
            "backupRestore: createBackupRestoreRouter(t, clientProcedure.use(requirePremiumEdition))",
            "advisor: createAdvisorRouter(t, clientProcedure.use(requirePremiumEdition)",
        ];
        for (const line of gated) expect(routers).toContain(line);
        expect(routers).toContain("controls: createControlsRouter(t, adminProcedure, publicProcedure)");
        expect(routers).toContain("clientPolicies: createClientPoliciesRouter(t, clientProcedure, adminProcedure, publicProcedure, clientEditorProcedure)");
        expect(routers).toContain("evidence: createEvidenceRouter(t, adminProcedure, publicProcedure, protectedProcedure)");
        expect(routers).toContain("risks: createRisksRouter(t, clientProcedure)");
        expect(routers).toContain("riskSettings: createRiskSettingsRouter(t, clientProcedure)");

        const policies = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/clientPolicies.ts"), "utf8");
        const controls = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/controls.ts"), "utf8");
        const implementation = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/implementation.ts"), "utf8");
        const risks = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/risks.ts"), "utf8");
        const settings = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/riskSettings.ts"), "utf8");
        expect(policies).toContain("refine: clientEditorProcedure.use(checkPremiumAccess)");
        expect(policies).toContain("list: clientProcedure");
        expect(controls).toContain("generateGuidance: adminProcedure.use(checkPremiumAccess)");
        expect(controls).toContain("list: publicProcedure");
        expect(implementation).toContain("autoAssignPdca: adminProcedure.use(checkPremiumAccess)");
        expect(implementation).toContain("generateSubtasks: adminProcedure.use(checkPremiumAccess)");
        expect(implementation).toContain("generateSubtaskSolution: adminProcedure.use(checkPremiumAccess)");
        expect(implementation).toContain("list: publicProcedure");
        expect(risks).toContain("exportReport: procedure");
        expect(risks).not.toContain("premiumClientProcedure");
        expect(settings).not.toContain("premiumClientProcedure");
    });
});

describe("clients.update rejects a plan write", () => {
    it("rejects planTier, activeModules, and branding", async () => {
        const { clientUpdateSchema } = await import("./routers/clients");
        const allowed = clientUpdateSchema.safeParse({ id: 1, name: "Acme" });
        expect(allowed.success).toBe(true);

        for (const input of [
            { id: 1, planTier: "enterprise" },
            { id: 1, activeModules: ["crm"] },
            { id: 1, brandPrimaryColor: "#000000" },
            { id: 1, portalTitle: "Premium" },
        ]) {
            const parsed = clientUpdateSchema.safeParse(input);
            expect(parsed.success).toBe(false);
        }
    });
});

describe("Gumroad activation fails closed", () => {
    it("upgrades only a verified paid purchase", async () => {
        const { tierFromVerifiedPurchase, EnhancedLicenseValidator, GumroadLicenseValidator } = await import("../lib/gumroad/license-validator");
        expect(tierFromVerifiedPurchase({
            type: "enterprise",
            status: "valid",
            metadata: { gumroad: { saleId: "sale-1", purchaseId: "purchase-1" } },
        })).toBe("enterprise");
        expect(tierFromVerifiedPurchase({
            type: "trial",
            status: "valid",
            metadata: { gumroad: { saleId: "sale-1", purchaseId: "purchase-1" } },
        })).toBe("pro");
        expect(() => tierFromVerifiedPurchase({
            type: "community",
            status: "valid",
            metadata: { gumroad: { saleId: "sale-1", purchaseId: "purchase-1" } },
        })).toThrow(/could not be verified/);
        expect(() => tierFromVerifiedPurchase({
            type: "enterprise",
            status: "valid",
            metadata: { gumroad: { saleId: "sale-1" } },
        })).toThrow(/could not be verified/);

        const previousPremium = process.env.VITE_ENABLE_PREMIUM;
        const previousKey = process.env.VITE_LICENSE_KEY;
        const previousToken = process.env.GUMROAD_ACCESS_TOKEN;
        process.env.VITE_ENABLE_PREMIUM = "true";
        process.env.VITE_LICENSE_KEY = "not-a-purchase";
        delete process.env.GUMROAD_ACCESS_TOKEN;
        try {
            const validator = new EnhancedLicenseValidator();
            await expect(validator.validateLicense("not-a-purchase")).rejects.toThrow(/could not be verified/);
        } finally {
            if (previousPremium === undefined) delete process.env.VITE_ENABLE_PREMIUM;
            else process.env.VITE_ENABLE_PREMIUM = previousPremium;
            if (previousKey === undefined) delete process.env.VITE_LICENSE_KEY;
            else process.env.VITE_LICENSE_KEY = previousKey;
            if (previousToken === undefined) delete process.env.GUMROAD_ACCESS_TOKEN;
            else process.env.GUMROAD_ACCESS_TOKEN = previousToken;
        }

        const failing = new GumroadLicenseValidator({
            validateLicense: async () => {
                throw new Error("network down");
            },
        } as any);
        await expect(failing.validateGumroadLicense("any-key")).rejects.toThrow(/network down/);
    });

    it("does not ship the mock license server, test keys, or open webhook routes", () => {
        const server = readFileSync(path.join(repoRoot, "packages/core/src/lib/license/server.ts"), "utf8");
        const app = readFileSync(path.join(repoRoot, "packages/core/src/App.tsx"), "utf8");
        const webhooks = readFileSync(path.join(repoRoot, "packages/core/src/server/webhooks/gumroad.ts"), "utf8");
        const gumroad = readFileSync(path.join(repoRoot, "packages/core/src/server/routers/gumroad.ts"), "utf8");
        const validator = readFileSync(path.join(repoRoot, "packages/core/src/lib/gumroad/license-validator.ts"), "utf8");
        expect(server).not.toContain("MockLicenseServerClient");
        expect(server).not.toContain("example-enterprise-license");
        expect(server).not.toContain("TRIAL-123456-7890");
        expect(server).not.toContain("EXPIRED-123456-7890");
        expect(app).not.toContain("/license-test");
        expect(webhooks).not.toContain("'/gumroad/test'");
        expect(webhooks).not.toContain("'/gumroad/status'");
        expect(webhooks).toContain("router.post('/gumroad'");
        expect(validator).not.toContain("validateFromEnvironment");
        expect(validator).not.toContain("getCommunityLicense");
        const verifyAt = gumroad.indexOf("tierFromVerifiedPurchase(licenseInfo)");
        const writeAt = gumroad.indexOf("createLicenseActivation");
        expect(verifyAt).toBeGreaterThan(-1);
        expect(writeAt).toBeGreaterThan(verifyAt);
    });
});
