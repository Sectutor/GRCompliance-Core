/** User-facing licence name. The free app only says Community or Premium. */
export function visibleLicenseType(type?: string | null): "Community" | "Premium" {
    return (type || "").trim().toLowerCase() === "enterprise" ? "Premium" : "Community";
}

/** Feature ids stay in the API. The licence screen does not print tier names or prices. */
export function visibleFeatureLabel(feature: string): string {
    const cleaned = feature
        .replace(/[._-]+/g, " ")
        .replace(/\benterprise\b/gi, "")
        .replace(/\btrial\b/gi, "")
        .replace(/\$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || "Premium";
}

export const PREMIUM_AVAILABLE = "Premium is available.";

/** Path the upgrade prompt already opens. There is no separate price list in Core. */
export const PREMIUM_PRICING_PATH = "/pricing";
