import { trpc } from "@/lib/trpc";

/**
 * Same gate as `clientPolicies.refine`: `checkPremiumAccess` /
 * `assertPremiumEntitled`. Core has no entitlement provider, so the query
 * is forbidden and the policy editor hides the refine buttons.
 */
export function usePolicyRefineAllowed(clientId: number): boolean {
    const enabled = Number.isFinite(clientId) && clientId > 0;
    const query = trpc.clientPolicies.refineAllowed.useQuery(
        { clientId: enabled ? clientId : 0 },
        { enabled, retry: false },
    );
    return query.data?.allowed === true;
}
