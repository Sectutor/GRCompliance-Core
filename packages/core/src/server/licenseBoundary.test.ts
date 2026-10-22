import { readFileSync } from "node:fs";
import path from "node:path";
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
