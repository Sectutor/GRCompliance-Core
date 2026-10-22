/**
 * Edition switch for the Community build.
 *
 * Premium is on only when the flag is the exact string "true" (or boolean true
 * in tests). Unset, "false", "TRUE", and any other value are the Community edition.
 * Role and planTier are not an edition.
 */

export const LATORE_DEMO_NAME = "Latore LTD";

/** Stable server message for the one-real-workspace cap. The UI matches this text. */
export const COMMUNITY_WORKSPACE_LIMIT_MESSAGE =
    "Community Edition is limited to a single workspace. Please upgrade to Enterprise for multi-tenancy.";

export function isCommunityWorkspaceLimitMessage(message: string | null | undefined): boolean {
    return typeof message === "string" && message.includes("Community Edition is limited to a single workspace");
}

export function isPremiumEditionEnabled(premiumFlag: string | boolean | undefined | null): boolean {
    return premiumFlag === true || premiumFlag === "true";
}

export function isCommunityEdition(premiumFlag: string | boolean | undefined | null): boolean {
    return !isPremiumEditionEnabled(premiumFlag);
}

/**
 * Route guard. globalRole, clientRole, and planTier are accepted so callers
 * can pass them, and ignored so an administrator or owner is not premium.
 */
export function premiumRouteAllowed(
    premiumFlag: string | boolean | undefined | null,
    _actor?: {
        globalRole?: string | null;
        clientRole?: string | null;
        planTier?: string | null;
    },
): boolean {
    return isPremiumEditionEnabled(premiumFlag);
}

export function realWorkspaceCount(names: Array<string | null | undefined>): number {
    return names.filter((name) => !!name && name !== LATORE_DEMO_NAME).length;
}

export function canCreateAnotherWorkspace(opts: {
    premiumFlag: string | boolean | undefined | null;
    ownedNames: string[];
    maxClients: number;
}): boolean {
    if (!isPremiumEditionEnabled(opts.premiumFlag)) {
        return realWorkspaceCount(opts.ownedNames) < 1;
    }
    return opts.ownedNames.length < opts.maxClients;
}

/** Community may open the seeded Latore demo plus the earliest other workspace. */
export function communityWorkspaceAllows(
    memberships: Array<{ clientId: number; name: string }>,
    clientId: number,
): boolean {
    const allowed = new Set<number>();
    const latore = memberships.find((membership) => membership.name === LATORE_DEMO_NAME);
    if (latore) allowed.add(latore.clientId);
    const real = memberships.find((membership) => membership.name !== LATORE_DEMO_NAME);
    if (real) allowed.add(real.clientId);
    return allowed.has(clientId);
}
