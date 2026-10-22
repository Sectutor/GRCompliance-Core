import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { COMMUNITY_WORKSPACE_LIMIT_MESSAGE, realWorkspaceCount } from "../lib/edition";
import { clients, userClients } from "../schema";

/**
 * Community workspace capacity for the Core server.
 *
 * This module does not read VITE_* variables, planTier, maxClients, or any
 * caller-supplied edition flag. A self-build that sets VITE_ENABLE_PREMIUM
 * does not raise the cap. The seeded Latore LTD demo does not count.
 */
export function communityAllowsAnotherWorkspace(ownedNames: Array<string | null | undefined>): boolean {
    return realWorkspaceCount(ownedNames) < 1;
}

export function assertCommunityWorkspaceCapacity(ownedNames: Array<string | null | undefined>): void {
    if (!Array.isArray(ownedNames)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: COMMUNITY_WORKSPACE_LIMIT_MESSAGE,
        });
    }
    if (communityAllowsAnotherWorkspace(ownedNames)) return;
    throw new TRPCError({
        code: "FORBIDDEN",
        message: COMMUNITY_WORKSPACE_LIMIT_MESSAGE,
    });
}

export async function loadOwnedWorkspaceNames(dbConn: any, userId: number): Promise<string[]> {
    const owned = await dbConn.select({ name: clients.name })
        .from(userClients)
        .innerJoin(clients, eq(userClients.clientId, clients.id))
        .where(and(
            eq(userClients.userId, userId),
            eq(userClients.role, "owner"),
        ));
    return owned.map((row: { name: string }) => row.name);
}
