import { TRPCError } from "@trpc/server";

/** Membership on a workspace id the caller named. Writes load the row first and pass that client id. */
export async function requireWorkspaceMember(args: {
    userId: number | null | undefined;
    clientId: number;
    canView: (userId: number, clientId: number) => Promise<boolean>;
}): Promise<number> {
    if (!args.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }
    const allowed = await args.canView(args.userId, args.clientId);
    if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No access to this workspace" });
    }
    return args.clientId;
}
