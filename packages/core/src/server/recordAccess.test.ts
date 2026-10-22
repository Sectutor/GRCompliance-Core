import { describe, expect, it } from "vitest";
import { requireRecordWorkspace, requireWorkspaceRole, type Membership, type WorkspaceDirectory } from "./recordAccess";

function directory(rows: Membership[]): WorkspaceDirectory {
    return {
        async listMemberships() {
            return rows;
        },
    };
}

const member = { id: 4, role: "user" };

describe("requireRecordWorkspace", () => {
    it("rejects an anonymous caller before loading the row", async () => {
        let loaded = false;
        await expect(
            requireRecordWorkspace({
                user: null,
                loadRow: async () => {
                    loaded = true;
                    return { clientId: 1 };
                },
                workspaceId: (row) => row.clientId,
                directory: directory([]),
            }),
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        expect(loaded).toBe(false);
    });

    it("forbids a member of workspace A from a row owned by workspace B", async () => {
        await expect(
            requireRecordWorkspace({
                user: member,
                loadRow: async () => ({ id: 9, clientId: 2 }),
                workspaceId: (row) => row.clientId,
                suppliedClientId: 1,
                directory: directory([{ clientId: 1, role: "editor" }]),
            }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("forbids the id-collision case where the row id equals the caller's workspace id", async () => {
        await expect(
            requireRecordWorkspace({
                user: member,
                loadRow: async () => ({ id: 7, clientId: 9 }),
                workspaceId: (row) => row.clientId,
                directory: directory([{ clientId: 7, role: "editor" }]),
            }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lets a viewer read and refuses a viewer write", async () => {
        const dir = directory([{ clientId: 7, role: "viewer" }]);
        const read = await requireRecordWorkspace({
            user: member,
            loadRow: async () => ({ id: 3, clientId: 7 }),
            workspaceId: (row) => row.clientId,
            minRole: "viewer",
            directory: dir,
        });
        expect(read.clientRole).toBe("viewer");
        await expect(
            requireRecordWorkspace({
                user: member,
                loadRow: async () => ({ id: 3, clientId: 7 }),
                workspaceId: (row) => row.clientId,
                minRole: "editor",
                directory: dir,
            }),
        ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Read-only access" });
    });

    it("lets an editor write and an owner pass an owner-only check", async () => {
        const editor = await requireWorkspaceRole({
            user: member,
            clientId: 7,
            minRole: "editor",
            directory: directory([{ clientId: 7, role: "editor" }]),
        });
        expect(editor.clientId).toBe(7);
        await expect(
            requireWorkspaceRole({
                user: member,
                clientId: 7,
                minRole: "owner",
                directory: directory([{ clientId: 7, role: "editor" }]),
            }),
        ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Owner access required" });
        const owner = await requireWorkspaceRole({
            user: member,
            clientId: 7,
            minRole: "owner",
            directory: directory([{ clientId: 7, role: "owner" }]),
        });
        expect(owner.clientRole).toBe("owner");
    });

    it("allows a platform admin across workspaces", async () => {
        const access = await requireRecordWorkspace({
            user: { id: 1, role: "admin" },
            loadRow: async () => ({ id: 5, clientId: 9 }),
            workspaceId: (row) => row.clientId,
            minRole: "editor",
            directory: directory([]),
        });
        expect(access.clientId).toBe(9);
        expect(access.clientRole).toBe("owner");
    });

    it("returns not found when the row does not exist", async () => {
        await expect(
            requireRecordWorkspace({
                user: member,
                loadRow: async () => null,
                workspaceId: () => 1,
                directory: directory([{ clientId: 1, role: "owner" }]),
            }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
});
