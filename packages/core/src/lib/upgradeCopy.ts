const GENERIC_FEATURE = "Premium Feature";

/** Confirmed Premium-only capabilities. Do not add items the source does not back. */
export const PREMIUM_CAPABILITIES = [
    "MCP",
    "Automatic evidence collection, including API evidence ingest",
    "Integrations (GitHub, SIEM, SOAR, threat intel, and vulnerability scanners)",
    "Prowler and Trivy scanner add-ons",
    "Multilingual support",
] as const;

function namedFeature(featureName: string): boolean {
    const name = featureName.trim();
    return name.length > 0 && name !== GENERIC_FEATURE && name !== "Premium";
}

/** Heading for /upgrade-required. A generic name must not read "Premium Feature is a Premium Feature". */
export function upgradeHeadline(featureName: string): string {
    if (!namedFeature(featureName)) return "Premium";
    return `${featureName.trim()} is part of Premium`;
}

/** Body copy. Premium is the only paid plan name. No prices, and no unbacked capabilities. */
export function upgradeBody(_featureName?: string): string {
    const [mcp, evidence, integrations, scanners, languages] = PREMIUM_CAPABILITIES;
    return `Premium is the self-hosted paid edition. It includes ${mcp}, ${evidence.charAt(0).toLowerCase()}${evidence.slice(1)}, ${integrations.charAt(0).toLowerCase()}${integrations.slice(1)}, the ${scanners}, and ${languages.charAt(0).toLowerCase()}${languages.slice(1)}.`;
}
