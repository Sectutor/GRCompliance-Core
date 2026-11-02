/** User-facing licence name. The free app only says Community or Premium. */
export function visibleLicenseType(type?: string | null): "Community" | "Premium" {
    const presented = presentStoredLicense({ type });
    return presented.type === "enterprise" ? "Premium" : "Community";
}

/**
 * Paid plan rows. `premium` is the current name. `pro` and `enterprise` are
 * stored legacy values and stay paid.
 */
export function isPremiumPlan(tier?: string | null): boolean {
    const value = (tier || "").trim().toLowerCase();
    return value === "premium" || value === "pro" || value === "enterprise";
}

/**
 * Stored plan values stay in the database. The screen only says Community or Premium.
 * A legacy enterprise or pro row reads as Premium.
 */
export function visiblePlanTier(tier?: string | null): "Community" | "Premium" {
    return isPremiumPlan(tier) ? "Premium" : "Community";
}

const FEATURE_LABELS: Record<string, string> = {
    "enterprise scalability": "Scalability",
    "enterprise storage": "External storage",
    "managed saas": "Managed hosting",
    "enterprise.scalability": "Scalability",
    "integration.enterprise_storage": "External storage",
    "deployment.managed_saas": "Managed hosting",
};

/** Feature ids stay in the API. The licence screen does not print tier names or prices. */
export function visibleFeatureLabel(feature: string): string {
    const key = feature.trim().toLowerCase();
    if (FEATURE_LABELS[key]) return FEATURE_LABELS[key];
    const cleaned = feature
        .replace(/[._-]+/g, " ")
        .replace(/\benterprise\b/gi, "")
        .replace(/\btrial\b/gi, "")
        .replace(/\bsaas\b/gi, "")
        .replace(/\$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return FEATURE_LABELS[cleaned.toLowerCase()] || cleaned || "Premium";
}

export const PREMIUM_AVAILABLE = "Premium is available.";

/** Site shown when PREMIUM_PURCHASE_URL is unset. There is no in-app price list. */
export const COMMUNITY_SITE_URL = "https://grcompliance.com";

/** @deprecated Use COMMUNITY_SITE_URL or premiumOfferHref. Kept so older imports stay external. */
export const PREMIUM_PRICING_PATH = COMMUNITY_SITE_URL;

/** Purchase page when configured, otherwise the public site. */
export function premiumOfferHref(purchaseUrl?: string | null): string {
    const value = (purchaseUrl || "").trim();
    return value || COMMUNITY_SITE_URL;
}

/**
 * A stored trial is not a paid plan. The UI and the server both show Community
 * and an expired status, so a trial key cannot unlock Premium.
 */
export function presentStoredLicense(input: {
    type?: string | null;
    status?: string | null;
}): { type: "community" | "enterprise"; status: string; paid: boolean } {
    const raw = (input.type || "").trim().toLowerCase();
    if (raw === "trial") {
        return { type: "community", status: "expired", paid: false };
    }
    if (raw === "enterprise") {
        const status = (input.status || "valid").trim().toLowerCase() || "valid";
        const paid = status === "valid" || status === "active";
        return { type: "enterprise", status, paid };
    }
    const status = (input.status || "valid").trim().toLowerCase() || "valid";
    return { type: "community", status, paid: false };
}
