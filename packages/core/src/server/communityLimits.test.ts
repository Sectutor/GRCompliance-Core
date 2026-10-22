import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LATORE_DEMO_NAME } from "../lib/edition";
import { userClients } from "../schema";
import { assertCommunityWorkspaceCapacity } from "./communityLimits";

const harness = vi.hoisted(() => ({
    tables: {} as Record<string, any[]>,
    getUserById: vi.fn(async () => ({ id: 4, maxClients: 99, planTier: "enterprise", role: "admin" })),
    onboardClient: vi.fn(async () => ({ id: 21, name: "Beta" })),
    seedSampleData: vi.fn(async () => ({ id: 22, name: "Beta DEMO" })),
    deleted: vi.fn(),
}));

vi.mock("../db", () => {
    const { getTableName: tableName } = require("drizzle-orm") as typeof import("drizzle-orm");
    function select() {
        let rows: any[] = [];
        const chain: any = {
            from(table: any) {
                try {
                    rows = harness.tables[tableName(table)] ?? [];
                } catch {
                    rows = [];
                }
                return chain;
            },
            where() { return chain; },
            orderBy() { return chain; },
            innerJoin() { return chain; },
            leftJoin() { return chain; },
            limit(n?: number) { return Promise.resolve(typeof n === "number" ? rows.slice(0, n) : rows); },
            then(onFulfilled: any, onRejected: any) { return Promise.resolve(rows).then(onFulfilled, onRejected); },
        };
        return chain;
    }
    return {
        getDb: async () => ({
            select,
            delete() {
                harness.deleted();
                return { where: () => Promise.resolve() };
            },
        }),
        getUserById: harness.getUserById,
        onboardClient: harness.onboardClient,
        seedSampleData: harness.seedSampleData,
        getUserByEmail: vi.fn(async () => undefined),
        createUser: vi.fn(),
        updateClient: vi.fn(),
        getClientById: vi.fn(),
    };
});

vi.mock("../lib/email/transporter", () => ({
    sendEmail: vi.fn(async () => ({ success: true })),
}));

import { createClientsRouter } from "./routers/clients";
import { adminProcedure, clientEditorProcedure, clientProcedure, isAuthed, publicProcedure, requiresMFA, t } from "./trpc";

const api = t.router({
    clients: createClientsRouter(t, adminProcedure, clientProcedure, clientEditorProcedure, publicProcedure, isAuthed, requiresMFA),
});

function caller() {
    return api.createCaller({
        user: { id: 4, role: "admin", email: "admin@example.com", planTier: "enterprise", maxClients: 99 },
        aal: "aal2",
        isPremium: true,
    } as any);
}

function own(names: string[]) {
    harness.tables[getTableName(userClients)] = names.map((name) => ({
        name,
        role: "owner",
        userId: 4,
    }));
}

describe("community workspace capacity", () => {
    beforeEach(() => {
        harness.tables = {};
        harness.deleted.mockClear();
        harness.onboardClient.mockClear();
        harness.seedSampleData.mockClear();
        harness.getUserById.mockClear();
    });

    it("counts Latore as the demo slot and rejects a second real workspace", () => {
        expect(() => assertCommunityWorkspaceCapacity([LATORE_DEMO_NAME])).not.toThrow();
        expect(() => assertCommunityWorkspaceCapacity(["Acme"])).toThrow(/single workspace/);
        expect(() => assertCommunityWorkspaceCapacity([LATORE_DEMO_NAME, "Acme"])).toThrow(/single workspace/);
        expect(() => assertCommunityWorkspaceCapacity({ premiumFlag: "true", ownedNames: [], maxClients: 99 } as any)).toThrow(/single workspace/);
    });

    it("rejects a second real workspace on the server even if the client claims premium", async () => {
        const previous = process.env.VITE_ENABLE_PREMIUM;
        process.env.VITE_ENABLE_PREMIUM = "true";
        own([LATORE_DEMO_NAME, "Acme"]);
        try {
            await expect(caller().clients.create({
                name: "Beta",
                premium: true,
                planTier: "enterprise",
                maxClients: 99,
            } as any)).rejects.toMatchObject({
                code: "FORBIDDEN",
                message: expect.stringContaining("Community Edition is limited to a single workspace"),
            });
            await expect(caller().clients.onboard({
                name: "Beta",
                industry: "Technology",
                companyName: "Beta",
                premium: true,
            } as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
            await expect(caller().clients.autoSetup({
                name: "Beta",
                industry: "Technology",
                frameworks: [],
            })).rejects.toMatchObject({ code: "FORBIDDEN" });
            await expect(caller().clients.createSampleData({
                name: "Beta DEMO",
                industry: "Technology",
            })).rejects.toMatchObject({ code: "FORBIDDEN" });
            expect(harness.onboardClient).not.toHaveBeenCalled();
            expect(harness.seedSampleData).not.toHaveBeenCalled();
            expect(harness.deleted).not.toHaveBeenCalled();
        } finally {
            if (previous === undefined) delete process.env.VITE_ENABLE_PREMIUM;
            else process.env.VITE_ENABLE_PREMIUM = previous;
        }
    });

    it("still lets an owner create the one real workspace beside Latore", async () => {
        const previous = process.env.VITE_ENABLE_PREMIUM;
        process.env.VITE_ENABLE_PREMIUM = "true";
        own([LATORE_DEMO_NAME]);
        try {
            const created = await caller().clients.create({ name: "Acme" });
            expect(created).toMatchObject({ id: 21 });
            expect(harness.onboardClient).toHaveBeenCalledTimes(1);
            expect(harness.deleted).not.toHaveBeenCalled();
        } finally {
            if (previous === undefined) delete process.env.VITE_ENABLE_PREMIUM;
            else process.env.VITE_ENABLE_PREMIUM = previous;
        }
    });

    it("does not consult VITE_ENABLE_PREMIUM when deciding workspace capacity", () => {
        const root = path.resolve(__dirname, "../../../..");
        const clients = readFileSync(path.join(root, "packages/core/src/server/routers/clients.ts"), "utf8");
        const access = readFileSync(path.join(root, "packages/core/src/server/workspaceAccess.ts"), "utf8");
        expect(clients).toContain("assertCanOwnAnotherWorkspace");
        expect(clients).not.toContain("VITE_ENABLE_PREMIUM");
        expect(access).not.toContain("VITE_ENABLE_PREMIUM");
        expect(clients).not.toContain("premiumFlag");
    });
});
