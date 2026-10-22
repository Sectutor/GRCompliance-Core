import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import { rateLimiter } from "../lib/redis";
import { isPremiumEditionEnabled } from "../lib/edition";
import { router, publicProcedure, middleware, t } from "./trpc-base";
import {
    authorizeWorkspace,
    bindRecordWorkspace,
    PLATFORM_ADMIN_ROLES,
    resolveClaimedWorkspaceId,
} from "./workspaceAccess";
export { router, publicProcedure, middleware, t };
export { authorizeWorkspace, bindRecordWorkspace, PLATFORM_ADMIN_ROLES };

// Import enterprise middlewares after defining base exports to avoid circular dependency issues
import { performanceTracker, auditLogger } from "./enterprise-middleware";

// Debug flag for auth logging - disabled in production by default
const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';

// Helper function for conditional debug logging
const debugLog = (message: string, ...args: any[]) => {
    if (DEBUG_AUTH) {
        console.log(message, ...args);
    }
};

// Helper function for conditional debug error logging
const debugError = (message: string, ...args: any[]) => {
    if (DEBUG_AUTH) {
        console.error(message, ...args);
    }
};

export const isAuthed = middleware(async ({ ctx, next, path }) => {
    debugLog(`[isAuthed Debug] Checking auth for path: ${path}, user present: ${!!ctx.user}`);

    if (!ctx.user) {
        debugError(`[isAuthed Debug] UNAUTHORIZED for path: ${path}`);

        // Provide specific error message based on auth header presence
        const authInfo = (ctx as any).authInfo;
        let message = "Authentication required. Please sign in.";

        if (authInfo) {
            if (!authInfo.hasAuthHeader) {
                message = "No authentication token provided. Please sign in.";
            } else if (!authInfo.supabaseUser) {
                message = "Invalid or expired session. Please sign in again.";
            } else if (!authInfo.dbUser) {
                message = "Your account was not found in our database. Please contact support.";
            }
        }

        throw new TRPCError({
            code: "UNAUTHORIZED",
            message: message
        });
    }

    debugLog(`[isAuthed Debug] Auth successful for user: ${ctx.user.id}`);

    if (ctx.user.accessExpiresAt && new Date() > ctx.user.accessExpiresAt) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Your access to GRCompliance has expired. Please contact support to renew."
        });
    }

    return next({
        ctx: {
            ...ctx,
            user: ctx.user,
        },
    });
});

/**
 * Enterprise Rate Limiting Middleware - AL 3 Tiered Implementation
 */
export const rateLimit = middleware(async ({ ctx, next, path }) => {
    // Skip rate limiting if disabled in env
    if (process.env.RATE_LIMITING_ENABLED !== 'true') return next();

    const isAuthed = !!ctx.user;
    const isPremium = (ctx as any).isPremium;
    const isSensitive = path.includes('ai') || path.includes('auth') || path.includes('users.create') || path.includes('export');

    const identifier = ctx.user?.id?.toString() || ctx.ip || 'anonymous';

    // Tiered Logic
    let limit = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
    if (!isAuthed) limit = Math.ceil(limit / 2); // Unauthed is 50% stricter
    if (isPremium) limit = limit * 2; // Premium has 2x capacity
    if (isSensitive) limit = Math.min(limit, 10); // Sensitive paths limited to 10 per window

    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000;

    const limited = await rateLimiter.isRateLimited(`rl:${path}:${identifier}`, limit, windowMs);

    if (limited) {
        throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: isSensitive
                ? 'Rate limit exceeded for sensitive operation. Please wait before trying again.'
                : 'Too many requests. Please try again later.'
        });
    }

    return next();
});

export const isAdmin = middleware(async ({ ctx, next, path }) => {
    if (!PLATFORM_ADMIN_ROLES.includes(ctx.user?.role || '')) {
        debugLog(`[isAdmin Debug] Forbidden access attempt for path ${path} by user ${ctx.user?.id} (${ctx.user?.role})`);
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required. Current role: " + (ctx.user?.role || 'none') });
    }
    return next();
});

export const checkClientAccess = middleware(async (opts) => {
    const { ctx, next, path } = opts;
    const rawInput = (opts as any).rawInput;
    const typedInput = (opts as any).input; // Try to get parsed input

    if (!ctx.user) {
        debugError(`[checkClientAccess Debug] UNAUTHORIZED for path: ${path}`);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: "Authentication required for client access." });
    }

    const input = typedInput || rawInput || {};
    // Do not treat a row id as a workspace id. clients.get still accepts `{ id }`.
    // Other legacy callers that pass the workspace as `id` are handled inside
    // resolveClaimedWorkspaceId. Record procedures are excluded.
    const clientId = resolveClaimedWorkspaceId(input, path, ctx.clientId);
    const platformAdmin = PLATFORM_ADMIN_ROLES.includes(ctx.user.role || '');

    if (!clientId) {
        if (!platformAdmin) {
            debugLog('[DEBUG checkClientAccess] No clientId found for path:', path);
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Client ID is required for this operation' });
        }
        debugLog('[DEBUG checkClientAccess] Admin access granted without a workspace id');
        return next({ ctx: { ...ctx, clientId, clientRole: 'owner' } });
    }

    // authorizeWorkspace applies the Community workspace cap. The cap does
    // not read VITE_ENABLE_PREMIUM, planTier, or a client-supplied flag.
    const { clientRole } = await authorizeWorkspace(ctx, clientId);
    debugLog('[DEBUG checkClientAccess] Access granted with role:', clientRole);
    return next({ ctx: { ...ctx, clientId, clientRole } });
});

export const checkClientEditor = middleware(({ ctx, next }) => {
    const clientRole = (ctx as any).clientRole;
    if (clientRole !== 'owner' && clientRole !== 'admin' && clientRole !== 'editor') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Read-only access' });
    }
    return next();
});

/**
 * Premium procedure gate. Platform admin, workspace owner, and client admin
 * do not unlock premium. This still honors VITE_ENABLE_PREMIUM === "true".
 * That server env switch is intentionally left in place and called out in
 * the pull request: it unlocks premium routers, not the workspace cap.
 * Workspace capacity does not consult this flag.
 */
export const requirePremiumEdition = middleware(async ({ ctx, next }) => {
    if (!isPremiumEditionEnabled(process.env.VITE_ENABLE_PREMIUM)) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Premium features are not included in the Community edition.'
        });
    }

    return next({ ctx: { ...ctx, isPremium: true } });
});

export const checkPremiumAccess = requirePremiumEdition;

/**
 * MFA Enforcement Middleware - AL 3 High Assurance
 * Enforces aal2 for all privileged/sensitive operations.
 */
export const requiresMFA = middleware(async ({ ctx, next, path }) => {
    const aal = (ctx as any).aal;
    const dbUser = ctx.user;
    if (!dbUser) return next();

    // Local authentication has no MFA enrollment. Blocking privileged routes
    // on aal2 would make every admin and client call fail for a self-hosted install.
    if (process.env.AUTH_MODE === 'local') {
        return next();
    }

    // AL 3: Mandatory MFA for all Global Admins and Owners
    const isPrivilegedRole = PLATFORM_ADMIN_ROLES.includes(dbUser.role || '');

    if (aal === 'aal2') return next(); // Already at max level

    const clientId = (ctx as any).clientId;

    try {
        const dbConn = await db.getDb();

        let must = isPrivilegedRole; // Forced for admins

        if (!must && clientId) {
            console.log('[DEBUG requiresMFA] Checking client MFA req for clientId:', clientId);
            // Check specific client's requirement for standard users
            const [client] = await dbConn.select({ requireMfa: schema.clients.requireMfa })
                .from(schema.clients)
                .where(eq(schema.clients.id, clientId))
                .limit(1);
            must = !!client?.requireMfa;
        }

        if (must && aal !== 'aal2') {
            throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: isPrivilegedRole
                    ? 'Administrative access requires active Multi-factor Authentication (MFA).'
                    : 'This organization requires Multi-factor authentication to proceed.'
            });
        }
    } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error('[MFA Middleware Error]', err);
        // Don't proceed if there was a database error - fail secure
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to verify MFA requirements'
        });
    }

    return next();
});


/**
 * Demo Mode Guard
 * Blocks all mutations in demo environment, except for authentication-related ones.
 */
export const demoModeGuard = middleware(async ({ ctx, type, path, next }) => {
    if (process.env.VITE_APP_MODE === 'demo' && type === 'mutation') {
        const allowedMutations = ['auth.', 'users.login', 'users.register', 'users.logout'];
        const isAllowed = allowedMutations.some(p => path.startsWith(p));

        if (!isAllowed) {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'This is a read-only demo environment. Data modifications are disabled.'
            });
        }
    }
    return next();
});

export const protectedProcedure = publicProcedure.use(rateLimit).use(performanceTracker).use(auditLogger).use(demoModeGuard).use(isAuthed);
export const adminProcedure = protectedProcedure.use(requiresMFA).use(isAdmin);
export const clientProcedure = protectedProcedure.use(requiresMFA).use(checkClientAccess);
export const clientEditorProcedure = clientProcedure.use(checkClientEditor);
/** Logged-in procedure that binds the workspace from the row, not from input.id. */
export const recordProcedure = protectedProcedure.use(requiresMFA);
export const premiumClientProcedure = clientProcedure.use(checkPremiumAccess);
