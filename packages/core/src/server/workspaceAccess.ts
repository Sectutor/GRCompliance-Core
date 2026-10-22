import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import * as db from "../db";
import * as schema from "../schema";
import { userClients } from "../schema";
import { middleware } from "./trpc-base";

export const PLATFORM_ADMIN_ROLES = [
    "admin",
    "owner",
    "super_admin",
    "super",
    "enterprise_admin",
    "ent_admin",
];

const EDITOR_ROLES = new Set(["owner", "admin", "editor"]);

/**
 * Procedures whose input `id` is the workspace itself (clients.get({ id })).
 * Everywhere else, `id` is a row id and must not authorize a workspace.
 */
export const WORKSPACE_ID_PATHS = new Set(["clients.get"]);

/**
 * Procedures whose `id` (or other row key) is not a workspace id.
 * checkClientAccess ignores input.id for these paths. The procedure
 * authorizes from the row's client_id instead, so a caller that only
 * sends the row id still works when they belong to that row's workspace.
 */
export const RECORD_ID_PATHS = new Set([
    "clientPolicies.get",
    "clientPolicies.getRACI",
    "clientPolicies.updateRACI",
    "clientPolicies.getLinkedRisks",
    "clientPolicies.getLinkedControls",
    "clientPolicies.linkRisk",
    "clientPolicies.unlinkRisk",
    "clientPolicies.activity",
    "policyManagement.getAssignments",
    "policyManagement.viewPolicy",
    "policyManagement.assignPolicy",
    "policyManagement.requestException",
    "policyManagement.reviewException",
    "policyManagement.getExceptions",
    "policyManagement.getMyPolicies",
    "clientControls.get",
    "clientControls.update",
    "clientControls.getLinkedPolicies",
    "compliance.clientControls.get",
    "compliance.clientControls.update",
    "compliance.remediationTasks.update",
    "compliance.remediationTasks.list",
    "compliance.remediationTasks.create",
    "compliance.gapQuestionnaireRequests.create",
    "universalTasks.update",
    "gapQuestionnaire.create",
]);

export function normalizeClientId(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
    if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
        const parsed = Number(value);
        if (Number.isSafeInteger(parsed)) return parsed;
    }
    return null;
}

/** Row ids, including the negative ids used for framework controls. */
export function normalizeRecordId(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value !== 0) return value;
    if (typeof value === "string" && /^-?[1-9]\d*$/.test(value)) {
        const parsed = Number(value);
        if (Number.isSafeInteger(parsed) && parsed !== 0) return parsed;
    }
    return null;
}

/**
 * Workspace id claimed by the caller.
 * Explicit `clientId` wins. `input.id` is a workspace id only for
 * WORKSPACE_ID_PATHS. Other existing procedures keep the previous
 * `id`-then-header fallback so those callers still authenticate.
 * Record procedures are excluded: their row id must not authorize.
 */
export function resolveClaimedWorkspaceId(input: any, path: string, headerClientId: unknown): number | null {
    const explicit = normalizeClientId(input?.clientId);
    if (explicit != null) return explicit;

    const header = normalizeClientId(headerClientId);
    const idField = normalizeClientId(input?.id);

    if (WORKSPACE_ID_PATHS.has(path)) {
        return idField ?? header;
    }

    if (RECORD_ID_PATHS.has(path)) {
        return header;
    }

    return idField ?? header;
}

export function assertSameWorkspace(recordClientId: number, supplied: unknown) {
    const suppliedId = normalizeClientId(supplied);
    if (suppliedId != null && suppliedId !== recordClientId) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Record does not belong to the specified workspace",
        });
    }
}

export type WorkspaceMembership = {
    role: string;
    accessExpiresAt?: Date | string | null;
};

export type WorkspaceAccessDirectory = {
    findMembership(userId: number, clientId: number): Promise<WorkspaceMembership | null>;
    listMemberships(userId: number): Promise<Array<{ clientId: number; role: string }>>;
    getUser(userId: number): Promise<{ maxClients?: number | null } | null>;
    listOwnedClientIds(userId: number): Promise<number[]>;
};

async function defaultDirectory(): Promise<WorkspaceAccessDirectory> {
    const dbConn = await db.getDb();
    return {
        async findMembership(userId, clientId) {
            const membership = await dbConn
                .select()
                .from(userClients)
                .where(and(eq(userClients.userId, userId), eq(userClients.clientId, clientId)))
                .limit(1);
            return membership[0] ?? null;
        },
        async listMemberships(userId) {
            return dbConn
                .select()
                .from(userClients)
                .where(eq(userClients.userId, userId))
                .orderBy(asc(userClients.joinedAt));
        },
        async getUser(userId) {
            const user = await db.getUserById(userId);
            return user ?? null;
        },
        async listOwnedClientIds(userId) {
            const allOwned = await dbConn
                .select({ clientId: userClients.clientId })
                .from(userClients)
                .innerJoin(schema.clients, eq(userClients.clientId, schema.clients.id))
                .where(and(eq(userClients.userId, userId), eq(userClients.role, "owner")))
                .orderBy(asc(schema.clients.createdAt));
            return allOwned.map((row: { clientId: number }) => row.clientId);
        },
    };
}

export function isPlatformAdmin(role: string | null | undefined): boolean {
    return PLATFORM_ADMIN_ROLES.includes(role || "");
}

export function canEditWorkspace(clientRole: string | null | undefined): boolean {
    return EDITOR_ROLES.has(clientRole || "");
}

/**
 * Login is enforced by the caller. This checks that `clientId` is a
 * workspace the user may use, including Community single-workspace
 * and plan limits. Platform admins are allowed without a membership row.
 */
export async function authorizeWorkspace(
    ctx: { user?: { id: number; role?: string | null } | null },
    clientId: number,
    directory?: WorkspaceAccessDirectory,
): Promise<{ clientRole: string }> {
    if (!ctx.user) {
        throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Authentication required for client access.",
        });
    }

    if (!Number.isInteger(clientId) || clientId <= 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Client ID is required for this operation" });
    }

    if (isPlatformAdmin(ctx.user.role)) {
        return { clientRole: "owner" };
    }

    const dir = directory ?? (await defaultDirectory());
    const membership = await dir.findMembership(ctx.user.id, clientId);
    if (!membership) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "No access to this client workspace. Membership required.",
        });
    }

    if (membership.accessExpiresAt && new Date() > new Date(membership.accessExpiresAt)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Your access to this workspace has expired.",
        });
    }

    if (process.env.VITE_ENABLE_PREMIUM === "false") {
        const allMemberships = await dir.listMemberships(ctx.user.id);
        if (allMemberships.length > 0 && allMemberships[0].clientId !== clientId) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message:
                    "Community Edition is limited to a single workspace. Please upgrade to Enterprise for multi-tenancy.",
            });
        }
    }

    if (membership.role === "owner" && process.env.VITE_ENABLE_PREMIUM !== "false") {
        const fullUser = await dir.getUser(ctx.user.id);
        const maxClients = fullUser?.maxClients || 2;
        const allowedClientIds = (await dir.listOwnedClientIds(ctx.user.id)).slice(0, maxClients);
        if (!allowedClientIds.includes(clientId)) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: `This workspace exceeds your plan limit of ${maxClients} organizations. Please upgrade or remove excess workspaces.`,
            });
        }
    }

    return { clientRole: membership.role };
}

export async function accessRecordWorkspace(
    ctx: { user?: { id: number; role?: string | null } | null },
    rawInput: any,
    loadOwnerClientId: (raw: any) => Promise<number | null | undefined>,
    options?: { minRole?: "viewer" | "editor"; directory?: WorkspaceAccessDirectory },
): Promise<{ clientId: number; clientRole: string }> {
    if (!ctx?.user) {
        throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Authentication required for client access.",
        });
    }

    const owner = await loadOwnerClientId(rawInput ?? {});
    if (owner == null || !Number.isInteger(owner) || owner <= 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Record not found" });
    }

    assertSameWorkspace(owner, rawInput?.clientId);
    const access = await authorizeWorkspace(ctx, owner, options?.directory);
    if (options?.minRole === "editor" && !canEditWorkspace(access.clientRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Read-only access" });
    }
    return { clientId: owner, clientRole: access.clientRole };
}

export function bindRecordWorkspace(
    loadOwnerClientId: (raw: any) => Promise<number | null | undefined>,
    options?: { minRole?: "viewer" | "editor"; directory?: WorkspaceAccessDirectory },
) {
    return middleware(async (opts) => {
        const raw = (opts as any).rawInput ?? (opts as any).input ?? {};
        const access = await accessRecordWorkspace(opts.ctx, raw, loadOwnerClientId, options);
        return opts.next({
            ctx: {
                ...opts.ctx,
                clientId: access.clientId,
                clientRole: access.clientRole,
            },
        });
    });
}
