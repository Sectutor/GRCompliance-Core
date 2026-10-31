/**
 * Automatic evidence collection is a Premium feature.
 * These slugs must not be registered or executed in the community core.
 */
export const PREMIUM_COLLECTOR_SLUGS = [
    "github",
    "siem",
    "soar",
    "threat-intel",
    "vulnerability-scanner",
] as const;

const collectorSlugs = new Set<string>(PREMIUM_COLLECTOR_SLUGS);

export function isPremiumCollector(slug: string): boolean {
    return collectorSlugs.has(slug);
}
