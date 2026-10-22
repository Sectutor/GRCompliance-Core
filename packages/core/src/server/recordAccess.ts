import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { communityWorkspaceAllows, isPremiumEditionEnabled } from "../lib/edition";
import { escapeHtml as escapeHtmlText } from "../lib/security/escapeHtml";
import { clients, userClients } from "../schema";

/** HTML escaping for workspace emails. Same helper as the gap-invite mailer. */
export function escapeHtml(value: unknown): string {
    return escapeHtmlText(value);
}

/** Same platform roles as checkClientAccess. A workspace role is not one of these. */
export const PLATFORM_ADMIN_ROLES = [
    "admin",
    "owner",
    "super_admin",
    "super",
    "enterprise_admin",
    "ent_admin",
];

const EDITOR_ROLES = new Set(["owner", "admin", "editor"]);

export type AccessUser = { id: number; role?: string | null } | null | undefined;

export type Membership = {
    clientId: number;
    role: string;
    name?: string | null;
    joinedAt?: Date | string | null;
    accessExpiresAt?: Date | string | null;
};

export type WorkspaceDirectory = {
    listMemberships(userId: number): Promise<Membership[]>;
    /** Used when a platform admin searches across workspaces. */
    listAllClientIds?(): Promise<number[]>;
};

export function isPlatformAdmin(role: string | null | undefined): boolean {
    return PLATFORM_ADMIN_ROLES.includes(role || "");
}

export function normalizeClientId(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && Number.isSafeInteger(value)) {
        return value;
    }
    if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) {
        const parsed = Number(value.trim());
        if (Number.isSafeInteger(parsed)) return parsed;
    }
    if (Array.isArray(value) && value.length > 0) return normalizeClientId(value[0]);
    return null;
}

export function roleSatisfies(role: string | null | undefined, minRole: "viewer" | "editor" | "owner"): boolean {
    if (minRole === "viewer") return role === "viewer" || role === "auditor" || EDITOR_ROLES.has(role || "");
    if (minRole === "editor") return EDITOR_ROLES.has(role || "");
    return role === "owner";
}

/** Fail closed. Named rows use the Latore-plus-one rule; otherwise only the earliest workspace. */
function communityMembershipAllows(memberships: Membership[], clientId: number): boolean {
    if (memberships.length === 0) return false;
    const named = memberships.every((row) => typeof row.name === "string");
    if (!named) return memberships[0].clientId === clientId;
    return communityWorkspaceAllows(
        memberships.map((row) => ({ clientId: row.clientId, name: row.name as string })),
        clientId,
    );
}

async function defaultDirectory(): Promise<WorkspaceDirectory> {
    const dbConn = await getDb();
    return {
        async listMemberships(userId) {
            const rows = await dbConn
                .select()
                .from(userClients)
                .where(eq(userClients.userId, userId))
                .orderBy(asc(userClients.joinedAt));
            return rows.map((row) => ({
                clientId: row.clientId,
                role: row.role,
                joinedAt: row.joinedAt,
                accessExpiresAt: row.accessExpiresAt,
            }));
        },
        async listAllClientIds() {
            const rows = await dbConn.select({ id: clients.id }).from(clients);
            return rows.map((row) => row.id);
        },
    };
}

function assertAuthenticated(user: AccessUser): asserts user is { id: number; role?: string | null } {
    if (!user?.id) {
        throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Authentication required for client access.",
        });
    }
}

async function membershipFor(
    user: { id: number; role?: string | null },
    clientId: number,
    directory: WorkspaceDirectory,
    minRole: "viewer" | "editor" | "owner",
): Promise<string> {
    if (isPlatformAdmin(user.role)) return "owner";

    const memberships = await directory.listMemberships(user.id);
    const membership = memberships.find((row) => row.clientId === clientId) ?? null;
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

    // Community is the default. A paid plan does not open a second workspace
    // unless VITE_ENABLE_PREMIUM is exactly "true".
    if (!isPremiumEditionEnabled(process.env.VITE_ENABLE_PREMIUM)) {
        const ordered = [...memberships].sort((a, b) => {
            const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            return aTime - bTime;
        });
        if (ordered.length > 0 && !communityMembershipAllows(ordered, clientId)) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Community Edition is limited to a single workspace. Please upgrade to Enterprise for multi-tenancy.",
            });
        }
    }

    if (!roleSatisfies(membership.role, minRole)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: minRole === "owner" ? "Owner access required" : "Read-only access",
        });
    }

    return membership.role;
}

/**
 * Load a row, then require the caller to belong to that row's workspace
 * with at least `minRole`. Viewers (and auditors) can read. Writes pass
 * `minRole: "editor"`. Owner-only actions pass `minRole: "owner"`.
 *
 * A caller-supplied workspace id must match the row. Sending only `{ id }`
 * does not treat that id as the workspace.
 */
export async function requireRecordWorkspace<T>(args: {
    user: AccessUser;
    loadRow: () => Promise<T | null | undefined>;
    workspaceId: (row: T) => number | null | undefined;
    suppliedClientId?: unknown;
    minRole?: "viewer" | "editor" | "owner";
    directory?: WorkspaceDirectory;
}): Promise<{ row: T; clientId: number; clientRole: string }> {
    assertAuthenticated(args.user);
    const row = await args.loadRow();
    if (row == null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Record not found" });
    }

    const clientId = args.workspaceId(row);
    if (typeof clientId !== "number" || !Number.isInteger(clientId) || clientId <= 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Client ID is required for this operation" });
    }

    if (args.suppliedClientId !== undefined && args.suppliedClientId !== null && args.suppliedClientId !== "") {
        const supplied = normalizeClientId(args.suppliedClientId);
        if (supplied == null || supplied !== clientId) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Record does not belong to the specified workspace",
            });
        }
    }

    const directory = args.directory ?? (await defaultDirectory());
    const clientRole = await membershipFor(args.user, clientId, directory, args.minRole ?? "viewer");
    return { row, clientId, clientRole };
}

/** Membership and role for a workspace id the caller named (lists and creates). */
export async function requireWorkspaceRole(args: {
    user: AccessUser;
    clientId: number;
    minRole?: "viewer" | "editor" | "owner";
    directory?: WorkspaceDirectory;
}): Promise<{ clientId: number; clientRole: string }> {
    const access = await requireRecordWorkspace({
        user: args.user,
        loadRow: async () => ({ clientId: args.clientId }),
        workspaceId: (row) => row.clientId,
        minRole: args.minRole,
        directory: args.directory,
    });
    return { clientId: access.clientId, clientRole: access.clientRole };
}

/**
 * Load one row by primary key. Callers pass the row into requireRecordWorkspace
 * through `loadRow`, so the membership check stays in one place.
 */
export async function loadRowById<T>(table: any, idColumn: any, id: number): Promise<T | null> {
    const dbConn = await getDb();
    const [row] = await dbConn.select().from(table).where(eq(idColumn, id)).limit(1);
    return (row as T | undefined) ?? null;
}

/**
 * Load one row by id and require membership in that row's workspace.
 * `id` is the record id, never the workspace id.
 */
export async function requireOwnedRow<T extends { clientId?: number | null }>(args: {
    user: AccessUser;
    table: any;
    id: number;
    idColumn?: any;
    suppliedClientId?: unknown;
    minRole?: "viewer" | "editor" | "owner";
    directory?: WorkspaceDirectory;
}): Promise<{ row: T; clientId: number; clientRole: string }> {
    return requireRecordWorkspace({
        user: args.user,
        loadRow: () => loadRowById<T>(args.table, args.idColumn ?? args.table.id, args.id),
        workspaceId: (row) => row.clientId,
        suppliedClientId: args.suppliedClientId,
        minRole: args.minRole,
        directory: args.directory,
    });
}

/**
 * Same fail-closed gate as requirePremiumEdition. Role and plan tier do not
 * unlock premium. Unset, "false", and any value other than exact "true" deny.
 */
export async function enforceExistingPremium(_clientId: number, _user: AccessUser, _clientRole?: string | null): Promise<void> {
    if (!isPremiumEditionEnabled(process.env.VITE_ENABLE_PREMIUM)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Premium features are not included in the Community edition.",
        });
    }
}
/** Workspaces the caller may read. Platform admins may read every workspace. */
export async function listAuthorizedClientIds(args: {
    user: AccessUser;
    directory?: WorkspaceDirectory;
}): Promise<number[]> {
    assertAuthenticated(args.user);
    const directory = args.directory ?? (await defaultDirectory());
    if (isPlatformAdmin(args.user.role)) {
        if (directory.listAllClientIds) return directory.listAllClientIds();
    }
    const memberships = await directory.listMemberships(args.user.id);
    const active = memberships.filter((row) => !row.accessExpiresAt || new Date() <= new Date(row.accessExpiresAt));
    if (!isPremiumEditionEnabled(process.env.VITE_ENABLE_PREMIUM)) {
        const ordered = [...active].sort((a, b) => {
            const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            return aTime - bTime;
        });
        return ordered
            .filter((row) => communityMembershipAllows(ordered, row.clientId))
            .map((row) => row.clientId);
    }
    return active.map((row) => row.clientId);
}
