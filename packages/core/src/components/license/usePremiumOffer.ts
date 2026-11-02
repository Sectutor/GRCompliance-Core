import { trpc } from "@/lib/trpc";
import { premiumOfferHref } from "@/lib/licenseLabel";

/** Purchase URL from PREMIUM_PURCHASE_URL, or the public site when that var is unset. */
export function usePremiumOffer() {
    const query = trpc.gumroad.getPremiumOffer.useQuery(undefined, {
        staleTime: 60_000,
        retry: false,
    });
    const purchaseUrl = (query.data?.purchaseUrl || "").trim();
    return {
        purchaseUrl: purchaseUrl || null,
        href: premiumOfferHref(purchaseUrl),
    };
}
