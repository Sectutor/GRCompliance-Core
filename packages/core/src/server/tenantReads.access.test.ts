import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";

const harness = vi.hoisted(() => {
    const tables: Record<string, any[]> = {};
    const controlsCalls: Array<{ framework?: string; clientId?: number }> = [];
    function write(result: any[] = [{ id: 1 }]) {
        const api: any = {
            set() { return api; },
            where() { return api; },
            values() { return api; },
            returning() { return Promise.resolve(result); },
            then(ok: any, err: any) { return Promise.resolve(result).then(ok, err); },
        };
        return api;
    }
    return {
        tables,
        controlsCalls,
        reset() {
            controlsCalls.length = 0;
            for (const key of Object.keys(tables)) delete tables[key];
        },
        async getDb() {
            const { getTableName } = await import("drizzle-orm");
            return {
                select(shape?: any) {
                    let name = "";
                    const rows = () => tables[name] ?? [];
                    const api: any = {
                        from(table: any) {
                            name = getTableName(table);
                            return api;
                        },
                        where() { return api; },
                        orderBy() { return Promise.resolve(rows()); },
                        leftJoin() { return api; },
                        innerJoin() { return api; },
                        limit(n?: number) {
                            const all = rows();
                            return Promise.resolve(typeof n === "number" ? all.slice(0, n) : all);
                        },
                        offset() { return api; },
                        then(ok: any, err: any) { return Promise.resolve(rows()).then(ok, err); },
                        selectDistinct() { return api; },
                    };
                    if (shape) return api;
                    return api;
                },
                selectDistinct() {
                    return this.select();
                },
                insert: () => write(),
                update: () => write(),
                delete: () => write(),
            };
        },
    };
});

vi.mock("../db", () => ({
    getDb: () => harness.getDb(),
    getControls: async (framework?: string, clientId?: number) => {
        harness.controlsCalls.push({ framework, clientId });
        const rows = harness.tables.controls ?? [];
        return rows.filter((row) => row.clientId == null || row.clientId === clientId);
    },
    getControlsPaginated: async (_framework?: unknown, clientId?: number) => {
        const rows = (harness.tables.controls ?? []).filter((row) => row.clientId == null || row.clientId === clientId);
        return { items: rows, total: rows.length };
    },
    getOrgRoles: async (clientId: number) => (harness.tables.org_roles ?? []).filter((row) => row.clientId === clientId),
    getOrgRoleById: async (id: number) => (harness.tables.org_roles ?? []).find((row) => row.id === id) ?? null,
    getClientStats: async (clientId: number) => ({ clientId, controls: 1 }),
    globalSearch: async (_query: string, _limit: number, _filters: unknown, allowed?: number[]) => {
        const scope = new Set(allowed ?? []);
        return (harness.tables.search ?? []).filter((hit) => {
            if (hit.type === "control" && hit.clientId == null) return true;
            const owner = hit.type === "client" ? hit.id : hit.clientId;
            return scope.has(owner);
        });
    },
}));

import { createControlsRouter } from "./routers/controls";
import { createImplementationRouter } from "./routers/implementation";
import { createRoadmapRouter } from "./routers/roadmap";
import { createKrisRouter } from "./routers/kris";
import { createClientsRouter } from "./routers/clients";
import { appRouter } from "../routers";

const t = initTRPC.context<{ user: { id: number; role?: string | null } | null }>().create();
const controls = t.router({ controls: createControlsRouter(t, t.procedure, t.procedure) });
const implementation = t.router({
    implementation: createImplementationRouter(t, t.procedure, t.procedure, t.procedure),
});
const roadmap = t.router({ roadmap: createRoadmapRouter(t, t.procedure, t.procedure) });
const kris = t.router({ kris: createKrisRouter(t, t.procedure) });
const clients = t.router({
    clients: createClientsRouter(t, t.procedure, t.procedure, t.procedure, t.procedure, t.middleware(async ({ next }) => next()), t.middleware(async ({ next }) => next())),
});

function member(clientId: number, role = "viewer") {
    harness.tables.user_clients = [{ userId: 4, clientId, role, joinedAt: new Date(0) }];
}

describe("unauthenticated tenant reads", () => {
    it("rejects anonymous search and returns only the caller's workspace hits", async () => {
        harness.reset();
        harness.tables.search = [
            { id: 7, type: "client", title: "A" },
            { id: 9, type: "client", title: "B" },
            { id: 3, type: "policy", title: "Secret", clientId: 9 },
            { id: 4, type: "control", title: "Public", clientId: null },
        ];
        const anon = appRouter.createCaller({ user: null } as any);
        await expect(anon.search.global({ query: "acme" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

        member(7, "editor");
        const caller = appRouter.createCaller({ user: { id: 4, role: "user" } } as any);
        const hits = await caller.search.global({ query: "acme" });
        expect(hits.map((hit: any) => hit.id).sort()).toEqual([4, 7]);
    });

    it("keeps the control catalogue public and requires membership for a workspace", async () => {
        harness.reset();
        harness.tables.controls = [
            { id: 1, clientId: null, controlId: "A.5", name: "Public", framework: "ISO" },
            { id: 2, clientId: 9, controlId: "PRIV", name: "Private", framework: "ISO" },
        ];
        const anon = controls.createCaller({ user: null });
        const catalogue = await anon.controls.list();
        expect(catalogue.map((row: any) => row.id)).toEqual([1]);
        expect(harness.controlsCalls[0].clientId).toBeUndefined();

        await expect(anon.controls.list({ clientId: 9 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        member(7, "viewer");
        const caller = controls.createCaller({ user: { id: 4, role: "user" } });
        await expect(caller.controls.list({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const own = await caller.controls.list({ clientId: 7 });
        expect(own.map((row: any) => row.id)).toEqual([1]);

        const source = readFileSync(path.resolve(__dirname, "../db.ts"), "utf8");
        expect(source).toContain("isNull(controls.clientId)");
    });

    it("requires membership for implementation, roadmap, kris, posture, org roles, and stats", async () => {
        harness.reset();
        member(7, "viewer");
        harness.tables.implementation_plans = [{ id: 7, clientId: 9 }];
        harness.tables.remediation_plans = [{ id: 7, clientId: 9 }];
        harness.tables.roadmaps = [{ id: 3, clientId: 9 }];
        harness.tables.kris = [{ id: 7, clientId: 9, name: "K" }];
        harness.tables.org_roles = [{ id: 7, clientId: 9, title: "CISO" }];
        harness.tables.compliance_snapshots = [{ id: 1, clientId: 9 }];

        const anonImpl = implementation.createCaller({ user: null });
        await expect(anonImpl.implementation.list({ clientId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(anonImpl.implementation.getPlan({ planId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

        const userImpl = implementation.createCaller({ user: { id: 4, role: "user" } });
        await expect(userImpl.implementation.getPlan({ planId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(userImpl.implementation.getPlanTasks({ planId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(userImpl.implementation.list({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const userRoad = roadmap.createCaller({ user: { id: 4, role: "user" } });
        await expect(userRoad.roadmap.get({ planId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(userRoad.roadmap.getStrategic({ roadmapId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(userRoad.roadmap.list({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const userKris = kris.createCaller({ user: { id: 4, role: "user" } });
        await expect(userKris.kris.list({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(userKris.kris.update({ id: 7, name: "nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const anonApp = appRouter.createCaller({ user: null } as any);
        await expect(anonApp.postureTrending.getHistory({ clientId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(anonApp.postureTrending.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(anonApp.orgRoles.list({ clientId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

        const userApp = appRouter.createCaller({ user: { id: 4, role: "user" } } as any);
        await expect(userApp.postureTrending.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(userApp.orgRoles.get({ id: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(userApp.postureTrending.getForecast({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const userClients = clients.createCaller({ user: { id: 4, role: "user" } });
        await expect(userClients.clients.stats({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const stats = await userClients.clients.stats({ clientId: 7 });
        expect(stats).toEqual({ clientId: 7, controls: 1 });
    });
});
