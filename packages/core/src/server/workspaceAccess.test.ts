import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { LATORE_DEMO_NAME } from "../lib/edition";
import {
    accessRecordWorkspace,
    authorizeWorkspace,
    resolveClaimedWorkspaceId,
    type WorkspaceAccessDirectory,
} from "./workspaceAccess";

const user = { id: 10, role: "user" };

function directory(options: {
    memberships?: Array<{ clientId: number; role: string; name?: string | null; accessExpiresAt?: Date | null }>;
    maxClients?: number;
    owned?: number[];
}): WorkspaceAccessDirectory {
    const memberships = options.memberships ?? [];
    return {
        async findMembership(_userId, clientId) {
            return memberships.find((row) => row.clientId === clientId) ?? null;
        },
        async listMemberships() {
            return memberships.map(({ clientId, role, name }) => ({ clientId, role, name }));
        },
        async getUser() {
            return { maxClients: options.maxClients ?? 5 };
        },
        async listOwnedClientIds() {
            return options.owned ?? memberships.filter((row) => row.role === "owner").map((row) => row.clientId);
        },
    };
}

describe("resolveClaimedWorkspaceId", () => {
    it("keeps clients.get working when the caller sends the workspace as id", () => {
        expect(resolveClaimedWorkspaceId({ id: 4 }, "clients.get", null)).toBe(4);
    });

    it("does not treat a policy or task id as the workspace", () => {
        expect(resolveClaimedWorkspaceId({ id: 4 }, "clientPolicies.get", null)).toBeNull();
        expect(resolveClaimedWorkspaceId({ id: 4 }, "compliance.remediationTasks.update", null)).toBeNull();
        expect(resolveClaimedWorkspaceId({ id: 4 }, "compliance.clientControls.get", 9)).toBe(9);
    });

    it("prefers an explicit clientId over a row id", () => {
        expect(resolveClaimedWorkspaceId({ id: 4, clientId: 2 }, "clientControls.update", 9)).toBe(2);
    });

    it("keeps the previous id fallback for procedures that are not record-scoped", () => {
        expect(resolveClaimedWorkspaceId({ id: 7 }, "legacy.workspaceById", null)).toBe(7);
        expect(resolveClaimedWorkspaceId({ id: 7 }, "legacy.workspaceById", 3)).toBe(7);
    });
});

describe("record workspace access", () => {
    const memberOf = (clientId: number, role = "editor") =>
        directory({ memberships: [{ clientId, role }] });

    it("denies a policy whose id matches a workspace the caller belongs to when another workspace owns it", async () => {
        await expect(
            accessRecordWorkspace(
                { user },
                { id: 1 },
                async () => 2,
                { directory: memberOf(1) },
            ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("allows the same workspace when the policy id and the workspace id differ", async () => {
        const access = await accessRecordWorkspace(
            { user },
            { id: 50 },
            async () => 1,
            { directory: memberOf(1) },
        );
        expect(access).toEqual({ clientId: 1, clientRole: "editor" });
    });

    it("denies a control update when the supplied workspace does not own the row", async () => {
        await expect(
            accessRecordWorkspace(
                { user },
                { id: 8, clientId: 1 },
                async () => 2,
                { directory: directory({ memberships: [{ clientId: 1, role: "editor" }, { clientId: 2, role: "editor" }] }) },
            ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("allows a remediation task update for an editor of the task's workspace", async () => {
        const access = await accessRecordWorkspace(
            { user },
            { id: 8, status: "resolved" },
            async () => 3,
            { minRole: "editor", directory: memberOf(3, "editor") },
        );
        expect(access.clientId).toBe(3);
    });

    it("denies a viewer from an editor-only record update", async () => {
        await expect(
            accessRecordWorkspace(
                { user },
                { id: 8 },
                async () => 3,
                { minRole: "editor", directory: memberOf(3, "viewer") },
            ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("requires a signed-in user", async () => {
        await expect(
            accessRecordWorkspace({ user: null }, { id: 1 }, async () => 1, { directory: memberOf(1) }),
        ).rejects.toBeInstanceOf(TRPCError);
        await expect(
            accessRecordWorkspace({ user: null }, { id: 1 }, async () => 1, { directory: memberOf(1) }),
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns not found when the row does not exist", async () => {
        await expect(
            accessRecordWorkspace({ user }, { id: 99 }, async () => null, { directory: memberOf(1) }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("lets a platform admin read a record in a workspace they have no membership for", async () => {
        const access = await accessRecordWorkspace(
            { user: { id: 1, role: "admin" } },
            { id: 4 },
            async () => 9,
            { directory: directory({ memberships: [] }) },
        );
        expect(access).toEqual({ clientId: 9, clientRole: "owner" });
    });
});

describe("authorizeWorkspace", () => {
    it("rejects an expired membership", async () => {
        const expired = new Date(Date.now() - 60_000);
        await expect(
            authorizeWorkspace({ user }, 1, directory({
                memberships: [{ clientId: 1, role: "editor", accessExpiresAt: expired }],
            })),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("keeps Community edition on the caller's first workspace", async () => {
        const previous = process.env.VITE_ENABLE_PREMIUM;
        process.env.VITE_ENABLE_PREMIUM = "false";
        const dir = directory({
            memberships: [
                { clientId: 1, role: "editor" },
                { clientId: 2, role: "editor" },
            ],
        });
        try {
            await expect(authorizeWorkspace({ user }, 1, dir)).resolves.toMatchObject({ clientRole: "editor" });
            await expect(authorizeWorkspace({ user }, 2, dir)).rejects.toMatchObject({ code: "FORBIDDEN" });
        } finally {
            if (previous === undefined) delete process.env.VITE_ENABLE_PREMIUM;
            else process.env.VITE_ENABLE_PREMIUM = previous;
        }
    });

    it("keeps Latore and the first real workspace readable when the premium flag is set", async () => {
        const previous = process.env.VITE_ENABLE_PREMIUM;
        process.env.VITE_ENABLE_PREMIUM = "true";
        const dir = directory({
            maxClients: 50,
            owned: [1, 2, 3],
            memberships: [
                { clientId: 1, role: "owner", name: LATORE_DEMO_NAME },
                { clientId: 2, role: "owner", name: "Acme" },
                { clientId: 3, role: "owner", name: "Beta" },
            ],
        });
        try {
            await expect(authorizeWorkspace({ user: { id: 10, role: "admin" } }, 1, dir)).resolves.toMatchObject({ clientRole: "owner" });
            await expect(authorizeWorkspace({ user }, 2, dir)).resolves.toMatchObject({ clientRole: "owner" });
            await expect(authorizeWorkspace({ user }, 3, dir)).rejects.toMatchObject({
                code: "FORBIDDEN",
                message: expect.stringContaining("Community Edition is limited to a single workspace"),
            });
            await expect(authorizeWorkspace({ user }, 2, dir)).resolves.toMatchObject({ clientRole: "owner" });
        } finally {
            if (previous === undefined) delete process.env.VITE_ENABLE_PREMIUM;
            else process.env.VITE_ENABLE_PREMIUM = previous;
        }
    });
});
