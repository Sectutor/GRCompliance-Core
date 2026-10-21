import { TRPCError } from "@trpc/server";
import { evidenceRequestAssignee } from "../lib/evidenceRequestAssignee";
import { evidenceRequestScope } from "../lib/evidenceRequestScope";
import { requireWorkspaceMember } from "./workspaceAccess";

const REQUEST_STATUSES = new Set(["open", "submitted", "verified", "rejected", "fulfilled"]);

export function normalizeEvidenceRequestStatus(status: string): string {
    const value = status.trim().toLowerCase();
    if (value === "closed") return "fulfilled";
    if (!REQUEST_STATUSES.has(value)) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Status must be open, fulfilled, or closed",
        });
    }
    return value;
}

export function parseEvidenceRequestDueDate(value?: string | null): Date | null {
    if (value == null || value.trim() === "") return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Due date is not a valid date" });
    }
    return date;
}

type ControlRow = { id: number; clientId: number };

export async function createEvidenceRequest(args: {
    userId: number | null | undefined;
    input: {
        clientControlId: number;
        assigneeId?: number | null;
        assigneeEmployeeId?: number | null;
        dueDate?: string | null;
        description?: string | null;
    };
    loadControl: (id: number) => Promise<ControlRow | null>;
    loadEmployee: (id: number) => Promise<{ clientId: number } | null>;
    userInWorkspace: (userId: number, clientId: number) => Promise<boolean>;
    canEdit: (userId: number, clientId: number) => Promise<boolean>;
    insert: (row: {
        clientId: number;
        clientControlId: number;
        requesterId: number;
        assigneeId: number | null;
        assigneeEmployeeId: number | null;
        dueDate: Date | null;
        description: string | null;
        status: "open";
    }) => Promise<void>;
}) {
    if (!args.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    let target;
    try {
        target = evidenceRequestAssignee(args.input);
    } catch (err) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Choose a platform user or a workspace employee",
        });
    }

    const control = await args.loadControl(args.input.clientControlId);
    if (!control) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Control not found" });
    }

    const allowed = await args.canEdit(args.userId, control.clientId);
    if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Editor access to this workspace is required" });
    }

    if (target.assigneeEmployeeId != null) {
        const employee = await args.loadEmployee(target.assigneeEmployeeId);
        if (!employee || employee.clientId !== control.clientId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That person is not in this workspace" });
        }
    } else if (!(await args.userInWorkspace(target.assigneeId!, control.clientId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That user is not in this workspace" });
    }

    const row = {
        clientId: control.clientId,
        clientControlId: control.id,
        requesterId: args.userId,
        assigneeId: target.assigneeId,
        assigneeEmployeeId: target.assigneeEmployeeId,
        dueDate: parseEvidenceRequestDueDate(args.input.dueDate),
        description: args.input.description?.trim() ? args.input.description.trim() : null,
        status: "open" as const,
    };
    await args.insert(row);
    return row;
}

export async function updateEvidenceRequestStatus(args: {
    userId: number | null | undefined;
    requestId: number;
    status: string;
    loadRequest: (id: number) => Promise<{ id: number; clientId: number } | null>;
    canEdit: (userId: number, clientId: number) => Promise<boolean>;
    save: (id: number, status: string) => Promise<void>;
}) {
    if (!args.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }
    const row = await args.loadRequest(args.requestId);
    if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Evidence request not found" });
    }
    const allowed = await args.canEdit(args.userId, row.clientId);
    if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Editor access to this workspace is required" });
    }
    const status = normalizeEvidenceRequestStatus(args.status);
    await args.save(row.id, status);
    return { id: row.id, clientId: row.clientId, status };
}

export async function resolveEvidenceRequestListScope(args: {
    userId: number | null | undefined;
    input: { clientId?: number | null; clientControlId?: number | null };
    loadControl: (id: number) => Promise<ControlRow | null>;
    canView: (userId: number, clientId: number) => Promise<boolean>;
}): Promise<{ clientId: number; clientControlId?: number }> {
    const scope = evidenceRequestScope(args.input);
    if (scope.clientId === undefined && scope.clientControlId === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A workspace or control is required" });
    }

    let clientId = scope.clientId;
    if (scope.clientControlId !== undefined) {
        const control = await args.loadControl(scope.clientControlId);
        if (!control) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Control not found" });
        }
        if (clientId !== undefined && clientId !== control.clientId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Control is not in this workspace" });
        }
        clientId = control.clientId;
    }

    await requireWorkspaceMember({
        userId: args.userId,
        clientId: clientId!,
        canView: args.canView,
    });

    return scope.clientControlId !== undefined
        ? { clientId: clientId!, clientControlId: scope.clientControlId }
        : { clientId: clientId! };
}
