import { TRPCError } from "@trpc/server";

export function parseEvidenceDueDate(value?: string | null): Date | null {
    if (value == null || value.trim() === "") return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Due date is not a valid date" });
    }
    return date;
}

/**
 * Evidence is stored against the control row's workspace.
 * input.clientId is not consulted: checkClientAccess would treat a stray id as the workspace.
 */
export async function authorizeEvidenceLink(args: {
    userId: number | null | undefined;
    clientControlId: number;
    dueDate?: string | null;
    loadControl: (id: number) => Promise<{ id: number; clientId: number } | null>;
    canEdit: (userId: number, clientId: number) => Promise<boolean>;
}): Promise<{ clientId: number; clientControlId: number; dueDate: Date | null }> {
    if (!args.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }
    const control = await args.loadControl(args.clientControlId);
    if (!control) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Control not found" });
    }
    const allowed = await args.canEdit(args.userId, control.clientId);
    if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Editor access to this workspace is required" });
    }
    return {
        clientId: control.clientId,
        clientControlId: control.id,
        dueDate: parseEvidenceDueDate(args.dueDate),
    };
}
