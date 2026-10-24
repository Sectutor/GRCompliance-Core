import { initTRPC, TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
    active: 0,
    lookup: 0,
    expiring: 0,
    expired: 0,
    logs: 0,
    validate: 0,
}));

vi.mock("../../lib/license/licenseDbService", () => ({
    licenseDbService: {
        isLicenseKeyActive: async () => {
            calls.active += 1;
            return false;
        },
        getActiveLicenseForClient: async () => {
            calls.lookup += 1;
            return null;
        },
        getExpiringLicenses: async () => {
            calls.expiring += 1;
            return [];
        },
        getExpiredLicenses: async () => {
            calls.expired += 1;
            return [];
        },
        getValidationLogsForClient: async () => {
            calls.logs += 1;
            return [];
        },
        createValidationLog: async () => ({}),
        deactivateLicense: async () => {
            throw new Error("deactivate-should-not-run");
        },
        createLicenseActivation: async () => {
            throw new Error("activate-should-not-run");
        },
    },
}));

vi.mock("../../lib/gumroad/license-validator", () => ({
    getEnhancedLicenseValidator: () => ({
        validateLicense: async () => {
            calls.validate += 1;
            throw new Error("validator-reached");
        },
        isGumroadEnabled: () => false,
    }),
    tierFromVerifiedPurchase: () => {
        throw new Error("tier-should-not-run");
    },
}));

vi.mock("../../lib/gumroad", () => ({
    getGumroadClient: () => {
        throw new Error("gumroad-client-should-not-run");
    },
}));

vi.mock("../../lib/config", () => ({
    config: { gumroad: {} },
}));

vi.mock("../../db", () => ({
    getDb: async () => {
        throw new Error("db-should-not-run");
    },
}));

const { createGumroadRouter } = await import("./gumroad");

type Ctx = {
    user?: { id: number; role?: string | null } | null;
    clientRole?: string | null;
};

const t = initTRPC.context<Ctx>().create();
const authed = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }
    return next();
});
const isAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    return next();
});

const gumroad = createGumroadRouter(t, authed, isAuthed, t.procedure);

function caller(ctx: Ctx) {
    return gumroad.createCaller(ctx);
}

describe("license upload, activate, and deactivate", () => {
    beforeEach(() => {
        calls.active = 0;
        calls.lookup = 0;
        calls.expiring = 0;
        calls.expired = 0;
        calls.logs = 0;
        calls.validate = 0;
    });

    it("rejects an unauthenticated caller before any license write", async () => {
        await expect(caller({}).activateLicense({ clientId: 4, licenseKey: "purchase-key" }))
            .rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(caller({}).deactivateLicense({ clientId: 4, licenseKey: "purchase-key" }))
            .rejects.toMatchObject({ code: "UNAUTHORIZED" });
        expect(calls.active).toBe(0);
        expect(calls.lookup).toBe(0);
    });

    it.each(["viewer", "editor", "auditor", "user"])(
        "rejects a %s member from activating or deactivating a license",
        async (clientRole) => {
            const ctx = { user: { id: 7, role: "user" }, clientRole };
            await expect(caller(ctx).activateLicense({ clientId: 4, licenseKey: "purchase-key" }))
                .rejects.toMatchObject({ code: "FORBIDDEN", message: "Admin access required to manage a license" });
            await expect(caller(ctx).deactivateLicense({ clientId: 4, licenseKey: "purchase-key" }))
                .rejects.toMatchObject({ code: "FORBIDDEN", message: "Admin access required to manage a license" });
            await expect(caller(ctx).getValidationLogs({ clientId: 4 }))
                .rejects.toMatchObject({ code: "FORBIDDEN" });
            expect(calls.active).toBe(0);
            expect(calls.lookup).toBe(0);
            expect(calls.logs).toBe(0);
            expect(calls.validate).toBe(0);
        },
    );

    it("lets a workspace admin and owner reach activation, and still refuses non-admins from license key lists", async () => {
        for (const clientRole of ["admin", "owner"]) {
            calls.validate = 0;
            calls.lookup = 0;
            const ctx = { user: { id: 3, role: "user" }, clientRole };
            await expect(caller(ctx).activateLicense({ clientId: 4, licenseKey: "purchase-key" }))
                .rejects.toMatchObject({ code: "BAD_REQUEST", message: "validator-reached" });
            await expect(caller(ctx).deactivateLicense({ clientId: 4, licenseKey: "purchase-key" }))
                .rejects.toMatchObject({ code: "NOT_FOUND" });
            expect(calls.validate).toBeGreaterThan(0);
            expect(calls.lookup).toBeGreaterThan(0);
        }

        const member = { user: { id: 9, role: "user" }, clientRole: "editor" };
        await expect(caller(member).getExpiringLicenses({ days: 30 }))
            .rejects.toMatchObject({ code: "FORBIDDEN", message: "Admin access required" });
        await expect(caller(member).getExpiredLicenses())
            .rejects.toMatchObject({ code: "FORBIDDEN", message: "Admin access required" });
        expect(calls.expiring).toBe(0);
        expect(calls.expired).toBe(0);

        const platform = caller({ user: { id: 1, role: "admin" }, clientRole: "viewer" });
        await expect(platform.getExpiringLicenses({ days: 30 })).resolves.toMatchObject({ success: true });
        await expect(platform.getExpiredLicenses()).resolves.toMatchObject({ success: true });
        expect(calls.expiring).toBe(1);
        expect(calls.expired).toBe(1);
    });
});
