import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { setControlOwner } from "./controlOwner";

describe("setControlOwner", () => {
    const row = { id: 4, clientId: 9 };

    it("saves against the row's workspace, not a caller-supplied client id", async () => {
        const save = vi.fn(async () => undefined);
        const canEdit = vi.fn(async () => true);
        const result = await setControlOwner({
            controlId: 4,
            owner: "  Grace Smith  ",
            userId: 3,
            loadControl: async () => row,
            canEdit,
            save,
        });

        expect(canEdit).toHaveBeenCalledWith(3, 9);
        expect(save).toHaveBeenCalledWith(4, "Grace Smith");
        expect(result).toEqual({ id: 4, clientId: 9, owner: "Grace Smith" });
    });

    it("rejects a viewer and does not write", async () => {
        const save = vi.fn();
        await expect(setControlOwner({
            controlId: 4,
            owner: "Grace Smith",
            userId: 3,
            loadControl: async () => row,
            canEdit: async () => false,
            save,
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(save).not.toHaveBeenCalled();
    });

    it("returns not found without checking a guessed workspace", async () => {
        const canEdit = vi.fn();
        await expect(setControlOwner({
            controlId: 99,
            owner: null,
            userId: 3,
            loadControl: async () => null,
            canEdit,
            save: vi.fn(),
        })).rejects.toBeInstanceOf(TRPCError);
        expect(canEdit).not.toHaveBeenCalled();
    });

    it("stores null when the owner is cleared", async () => {
        const save = vi.fn(async () => undefined);
        const result = await setControlOwner({
            controlId: 4,
            owner: "   ",
            userId: 3,
            loadControl: async () => row,
            canEdit: async () => true,
            save,
        });
        expect(save).toHaveBeenCalledWith(4, null);
        expect(result.owner).toBeNull();
    });
});
