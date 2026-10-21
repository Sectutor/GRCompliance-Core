import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { requireWorkspaceMember } from "./workspaceAccess";

describe("requireWorkspaceMember", () => {
    it("requires a signed-in member of the workspace", async () => {
        const canView = vi.fn(async () => true);
        await expect(requireWorkspaceMember({ userId: 3, clientId: 1, canView })).resolves.toBe(1);
        expect(canView).toHaveBeenCalledWith(3, 1);
    });

    it("rejects a missing user and a non-member", async () => {
        await expect(requireWorkspaceMember({
            userId: null,
            clientId: 1,
            canView: async () => true,
        })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

        const canView = vi.fn(async () => false);
        await expect(requireWorkspaceMember({ userId: 3, clientId: 9, canView })).rejects.toBeInstanceOf(TRPCError);
        expect(canView).toHaveBeenCalledWith(3, 9);
    });
});
