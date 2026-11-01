const GENERIC_FEATURE = "Premium Feature";

function namedFeature(featureName: string): boolean {
    const name = featureName.trim();
    return name.length > 0 && name !== GENERIC_FEATURE && name !== "Premium";
}

/** Heading for /upgrade-required. A generic name must not read "Premium Feature is a Premium Feature". */
export function upgradeHeadline(featureName: string): string {
    if (!namedFeature(featureName)) return "Premium";
    return `${featureName.trim()} is part of Premium`;
}

/** Body copy. Premium is the only paid plan name. No prices. */
export function upgradeBody(featureName: string): string {
    const subject = namedFeature(featureName) ? featureName.trim() : "this capability";
    return `Premium is the self-hosted paid edition. It includes ${subject}, advanced reporting, and AI automation.`;
}
