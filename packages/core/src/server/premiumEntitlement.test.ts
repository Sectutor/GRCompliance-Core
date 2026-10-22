import { readFileSync } from "node:fs";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    assertPremiumEntitled,
    clearPremiumEntitlementProvider,
    PREMIUM_EDITION_FORBIDDEN_MESSAGE,
    registerPremiumEntitlement,
} from "./premiumEntitlement";
import { enforceExistingPremium } from "./recordAccess";
import { publicProcedure, requirePremiumEdition, router } from "./trpc";

const repoRoot = path.resolve(__dirname, "../../../..");

const callerCtx = {
    user: { id: 7, role: "admin", email: "admin@example.com" },
    clientId: 4,
    clientRole: "owner",
    req: {},
    res: {},
};

function premiumRouter() {
    return router({
        communityPing: publicProcedure.query(() => "community-ok"),
        premiumPing: publicProcedure.use(requirePremiumEdition).query(() => "premium-ok"),
    });
}

describe("premium entitlement registry", () => {
    const envKeys = [
        "VITE_ENABLE_PREMIUM",
        "VITE_LICENSE_KEY",
        "BUILD_TYPE",
        "INSTANCE_LICENSE_TIER",
        "ENABLE_PREMIUM",
        "PREMIUM",
    ] as const;
    const previous: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of envKeys) previous[key] = process.env[key];
    });

    afterEach(() => {
        clearPremiumEntitlementProvider();
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });

    function setPublicPremiumEnv() {
        process.env.VITE_ENABLE_PREMIUM = "true";
        process.env.VITE_LICENSE_KEY = "not-a-license";
        process.env.BUILD_TYPE = "COMMERCIAL";
        process.env.INSTANCE_LICENSE_TIER = "enterprise";
        process.env.ENABLE_PREMIUM = "true";
        process.env.PREMIUM = "1";
    }

    it("forbids a premium procedure when public env is set and no provider is registered", async () => {
        setPublicPremiumEnv();
        const caller = premiumRouter().createCaller(callerCtx as never);
        await expect(caller.premiumPing()).rejects.toMatchObject({
            code: "FORBIDDEN",
            message: PREMIUM_EDITION_FORBIDDEN_MESSAGE,
        });
        await expect(assertPremiumEntitled({
            user: { id: 7, role: "admin" },
            clientId: 4,
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(enforceExistingPremium(4, { id: 7, role: "admin" }, "owner")).rejects.toMatchObject({
            code: "FORBIDDEN",
            message: PREMIUM_EDITION_FORBIDDEN_MESSAGE,
        });
    });

    it("allows a premium procedure when a test provider grants it", async () => {
        setPublicPremiumEnv();
        const seen: Array<{ clientId?: number | null; path?: string }> = [];
        registerPremiumEntitlement(async (ctx) => {
            seen.push({ clientId: ctx.clientId, path: ctx.path });
            return { allowed: true };
        });
        const caller = premiumRouter().createCaller(callerCtx as never);
        await expect(caller.premiumPing()).resolves.toBe("premium-ok");
        expect(seen).toEqual([{ clientId: 4, path: "premiumPing" }]);
        await expect(enforceExistingPremium(9, { id: 3, role: "member" }, "editor")).resolves.toBeUndefined();
    });

    it("stays forbidden when the provider denies or throws", async () => {
        registerPremiumEntitlement(async () => ({ allowed: false, message: "license expired" }));
        await expect(assertPremiumEntitled()).rejects.toMatchObject({
            code: "FORBIDDEN",
            message: "license expired",
        });

        clearPremiumEntitlementProvider();
        registerPremiumEntitlement(async () => {
            throw new Error("license store down");
        });
        await expect(assertPremiumEntitled()).rejects.toMatchObject({
            code: "FORBIDDEN",
            message: PREMIUM_EDITION_FORBIDDEN_MESSAGE,
        });

        clearPremiumEntitlementProvider();
        registerPremiumEntitlement(async () => {
            throw new TRPCError({ code: "FORBIDDEN", message: "paid edition denied" });
        });
        await expect(assertPremiumEntitled()).rejects.toMatchObject({
            code: "FORBIDDEN",
            message: "paid edition denied",
        });
    });

    it("leaves a community procedure callable with the premium flag set and no provider", async () => {
        setPublicPremiumEnv();
        const caller = premiumRouter().createCaller(callerCtx as never);
        await expect(caller.communityPing()).resolves.toBe("community-ok");
    });

    it("does not let the server gate read the Vite flag", () => {
        const trpc = readFileSync(path.join(repoRoot, "packages/core/src/server/trpc.ts"), "utf8");
        const access = readFileSync(path.join(repoRoot, "packages/core/src/server/recordAccess.ts"), "utf8");
        const entitlement = readFileSync(path.join(repoRoot, "packages/core/src/server/premiumEntitlement.ts"), "utf8");
        const scripts = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).scripts as Record<string, string>;
        const gate = trpc.slice(
            trpc.indexOf("export const requirePremiumEdition"),
            trpc.indexOf("export const checkPremiumAccess"),
        );
        expect(gate).toContain("assertPremiumEntitled");
        expect(gate).not.toContain("VITE_ENABLE_PREMIUM");
        expect(gate).not.toContain("process.env");
        expect(access).not.toContain("isPremiumEditionEnabled");
        expect(entitlement).not.toContain("process.env");
        expect(scripts["server:enterprise"]).not.toContain("VITE_ENABLE_PREMIUM=true");
        expect(scripts["server:trial"]).not.toContain("VITE_ENABLE_PREMIUM=true");
        expect(scripts["server:enterprise"]).toContain("does not unlock premium APIs");
        expect(scripts["server:trial"]).toContain("does not unlock premium APIs");
    });
});
