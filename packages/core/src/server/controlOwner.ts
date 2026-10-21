import { TRPCError } from "@trpc/server";

export type ControlOwnerRow = {
    id: number;
    clientId: number;
};

/**
 * Set client_controls.owner using the row's own client_id.
 * Callers must not pass a workspace id: checkClientAccess treats input.id as one.
 */
export async function setControlOwner(args: {
    controlId: number;
    owner: string | null;
    userId: number;
    loadControl: (id: number) => Promise<ControlOwnerRow | null>;
    canEdit: (userId: number, clientId: number) => Promise<boolean>;
    save: (id: number, owner: string | null) => Promise<void>;
}): Promise<{ id: number; clientId: number; owner: string | null }> {
    const row = await args.loadControl(args.controlId);
    if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Control not found" });
    }

    const allowed = await args.canEdit(args.userId, row.clientId);
    if (!allowed) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Editor access to this workspace is required",
        });
    }

    const owner = args.owner?.trim() ? args.owner.trim() : null;
    await args.save(row.id, owner);
    return { id: row.id, clientId: row.clientId, owner };
}
