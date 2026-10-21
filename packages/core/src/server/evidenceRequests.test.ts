import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
    createEvidenceRequest,
    normalizeEvidenceRequestStatus,
    resolveEvidenceRequestListScope,
    updateEvidenceRequestStatus,
} from "./evidenceRequests";

const control = { id: 6, clientId: 4 };

describe("normalizeEvidenceRequestStatus", () => {
    it("stores closed as fulfilled", () => {
        expect(normalizeEvidenceRequestStatus("closed")).toBe("fulfilled");
        expect(normalizeEvidenceRequestStatus("Fulfilled")).toBe("fulfilled");
    });

    it("rejects an unknown status", () => {
        expect(() => normalizeEvidenceRequestStatus("done")).toThrow(TRPCError);
    });
});

describe("createEvidenceRequest", () => {
    it("stores the control's workspace and the employee, ignoring a caller-supplied workspace id", async () => {
        const insert = vi.fn(async () => undefined);
        const row = await createEvidenceRequest({
            userId: 3,
            input: {
                clientControlId: 6,
                assigneeEmployeeId: 15,
                dueDate: "2026-11-30",
                description: " Upload the restore test ",
            },
            loadControl: async () => control,
            loadEmployee: async () => ({ clientId: 4 }),
            userInWorkspace: async () => false,
            canEdit: async () => true,
            insert,
        });

        expect(row.clientId).toBe(4);
        expect(row.assigneeId).toBeNull();
        expect(row.assigneeEmployeeId).toBe(15);
        expect(row.description).toBe("Upload the restore test");
        expect(row.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-30");
        expect(insert).toHaveBeenCalledWith(row);
    });

    it("stores a workspace user on assignee_id", async () => {
        const insert = vi.fn(async () => undefined);
        const row = await createEvidenceRequest({
            userId: 3,
            input: { clientControlId: 6, assigneeId: 1 },
            loadControl: async () => control,
            loadEmployee: async () => null,
            userInWorkspace: async (userId, clientId) => userId === 1 && clientId === 4,
            canEdit: async () => true,
            insert,
        });
        expect(row).toMatchObject({ assigneeId: 1, assigneeEmployeeId: null, clientId: 4 });
    });

    it("does not write when the caller cannot edit the control's workspace", async () => {
        const insert = vi.fn();
        const canEdit = vi.fn(async () => false);
        await expect(createEvidenceRequest({
            userId: 3,
            input: { clientControlId: 6, assigneeId: 1 },
            loadControl: async () => control,
            loadEmployee: async () => null,
            userInWorkspace: async () => true,
            canEdit,
            insert,
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(canEdit).toHaveBeenCalledWith(3, 4);
        expect(insert).not.toHaveBeenCalled();
    });

    it("rejects an assignee from another workspace", async () => {
        const insert = vi.fn();
        await expect(createEvidenceRequest({
            userId: 3,
            input: { clientControlId: 6, assigneeEmployeeId: 15 },
            loadControl: async () => control,
            loadEmployee: async () => ({ clientId: 9 }),
            userInWorkspace: async () => true,
            canEdit: async () => true,
            insert,
        })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(insert).not.toHaveBeenCalled();
    });
});

describe("updateEvidenceRequestStatus", () => {
    it("authorizes with the request row's workspace and stores fulfilled", async () => {
        const save = vi.fn(async () => undefined);
        const result = await updateEvidenceRequestStatus({
            userId: 3,
            requestId: 12,
            status: "closed",
            loadRequest: async () => ({ id: 12, clientId: 4 }),
            canEdit: async () => true,
            save,
        });
        expect(result).toEqual({ id: 12, clientId: 4, status: "fulfilled" });
        expect(save).toHaveBeenCalledWith(12, "fulfilled");
    });

    it("does not write when the caller cannot edit that workspace", async () => {
        const save = vi.fn();
        const canEdit = vi.fn(async () => false);
        await expect(updateEvidenceRequestStatus({
            userId: 8,
            requestId: 12,
            status: "fulfilled",
            loadRequest: async () => ({ id: 12, clientId: 4 }),
            canEdit,
            save,
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(canEdit).toHaveBeenCalledWith(8, 4);
        expect(save).not.toHaveBeenCalled();
    });
});

describe("resolveEvidenceRequestListScope", () => {
    it("keeps the control id when the workspace id is also sent", async () => {
        const canView = vi.fn(async () => true);
        await expect(resolveEvidenceRequestListScope({
            userId: 3,
            input: { clientId: 4, clientControlId: 6 },
            loadControl: async () => control,
            canView,
        })).resolves.toEqual({ clientId: 4, clientControlId: 6 });
        expect(canView).toHaveBeenCalledWith(3, 4);
    });

    it("uses the control row's workspace when only a control id is sent", async () => {
        const canView = vi.fn(async () => true);
        await expect(resolveEvidenceRequestListScope({
            userId: 3,
            input: { clientControlId: 6 },
            loadControl: async () => control,
            canView,
        })).resolves.toEqual({ clientId: 4, clientControlId: 6 });
        expect(canView).toHaveBeenCalledWith(3, 4);
    });

    it("rejects a control that is not in the named workspace", async () => {
        const canView = vi.fn(async () => true);
        await expect(resolveEvidenceRequestListScope({
            userId: 3,
            input: { clientId: 1, clientControlId: 6 },
            loadControl: async () => control,
            canView,
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(canView).not.toHaveBeenCalled();
    });

    it("rejects a non-member and an empty query", async () => {
        await expect(resolveEvidenceRequestListScope({
            userId: 3,
            input: { clientId: 4 },
            loadControl: async () => null,
            canView: async () => false,
        })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const canView = vi.fn();
        await expect(resolveEvidenceRequestListScope({
            userId: 3,
            input: {},
            loadControl: async () => null,
            canView,
        })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(canView).not.toHaveBeenCalled();
    });
});
