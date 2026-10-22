import { TRPCError } from "@trpc/server";

/**
 * Server entitlement for premium procedures.
 *
 * Core does not decide that a deployment is premium. The paid edition
 * registers a provider at process start. With no provider, every premium
 * procedure is forbidden. Public env vars, including VITE_ENABLE_PREMIUM,
 * BUILD_TYPE, and INSTANCE_LICENSE_TIER, are not consulted here. The client
 * flag may still show or hide navigation. It never authorizes an API.
 */
export const PREMIUM_EDITION_FORBIDDEN_MESSAGE =
    "Premium features are not included in the Community edition.";

export type PremiumEntitlementContext = {
    user?: { id?: number; role?: string | null; email?: string | null } | null;
    clientId?: number | null;
    clientRole?: string | null;
    path?: string;
    type?: string;
};

export type PremiumEntitlementDecision = {
    allowed: boolean;
    message?: string;
};

export type PremiumEntitlementProvider = (
    ctx: PremiumEntitlementContext,
) => Promise<PremiumEntitlementDecision> | PremiumEntitlementDecision;

let provider: PremiumEntitlementProvider | null = null;

export function registerPremiumEntitlement(next: PremiumEntitlementProvider): void {
    if (typeof next !== "function") {
        throw new Error("Premium entitlement provider must be a function");
    }
    if (provider && provider !== next) {
        console.warn("[premium] Replacing the registered entitlement provider");
    }
    provider = next;
}

/** Test hook. Production boot does not clear a provider. */
export function clearPremiumEntitlementProvider(): void {
    provider = null;
}

export function hasPremiumEntitlementProvider(): boolean {
    return provider !== null;
}

function forbidden(message?: string): TRPCError {
    const text = typeof message === "string" && message.trim().length > 0
        ? message
        : PREMIUM_EDITION_FORBIDDEN_MESSAGE;
    return new TRPCError({ code: "FORBIDDEN", message: text });
}

/**
 * Fail closed. A missing provider, a thrown provider, and any decision other
 * than `{ allowed: true }` deny access. This function does not read the
 * environment.
 */
export async function assertPremiumEntitled(ctx: PremiumEntitlementContext = {}): Promise<void> {
    if (!provider) {
        throw forbidden();
    }

    let decision: PremiumEntitlementDecision;
    try {
        decision = await provider(ctx);
    } catch (err) {
        if (err instanceof TRPCError) throw err;
        const detail = err instanceof Error ? err.message : "unknown";
        console.error("[premium] Entitlement provider failed closed:", detail);
        throw forbidden();
    }

    if (!decision || decision.allowed !== true) {
        throw forbidden(decision?.message);
    }
}
