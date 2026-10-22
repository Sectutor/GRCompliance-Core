import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    memberships: [] as Array<{ clientId: number; role: string; userId: number }>,
}));

vi.mock("../../db", () => ({
    getDb: async () => ({
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => state.memberships,
                    orderBy: async () => state.memberships,
                }),
                innerJoin: () => ({
                    where: () => ({
                        orderBy: async () => [],
                    }),
                }),
            }),
        }),
    }),
    getUserById: async () => ({ maxClients: 5 }),
}));

import { checkClientAccess } from "../trpc";

const guard = (checkClientAccess as unknown as {
    _middlewares: Array<(opts: unknown) => Promise<unknown>>;
})._middlewares[0];

const user = { id: 10, role: "user", email: "user@example.test" };

async function run(path: string, input: unknown, headerClientId?: number) {
    return guard({
        ctx: { user, clientId: headerClientId, req: {}, res: {} },
        path,
        type: "query",
        rawInput: input,
        input,
        next: (opts?: { ctx?: { clientId?: number; clientRole?: string } }) => opts?.ctx ?? { ok: true },
    });
}

describe("checkClientAccess", () => {
    it("does not treat a policy id as a workspace the caller belongs to", async () => {
        state.memberships = [{ clientId: 4, role: "editor", userId: user.id }];
        await expect(run("clientPolicies.get", { id: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(run("compliance.remediationTasks.update", { id: 4, status: "resolved" })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
        await expect(run("compliance.clientControls.get", { id: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("still accepts the workspace id for clients.get", async () => {
        state.memberships = [{ clientId: 4, role: "editor", userId: user.id }];
        const ctx = await run("clients.get", { id: 4 });
        expect(ctx).toMatchObject({ clientId: 4, clientRole: "editor" });
    });

    it("still authenticates a non-record procedure that passes the workspace as id", async () => {
        state.memberships = [{ clientId: 7, role: "editor", userId: user.id }];
        const ctx = await run("legacy.workspaceById", { id: 7 });
        expect(ctx).toMatchObject({ clientId: 7, clientRole: "editor" });
    });

    it("uses the selected workspace header for a record procedure that also sends a row id", async () => {
        state.memberships = [{ clientId: 9, role: "viewer", userId: user.id }];
        const ctx = await run("clientPolicies.get", { id: 4 }, 9);
        expect(ctx).toMatchObject({ clientId: 9, clientRole: "viewer" });
    });
});
