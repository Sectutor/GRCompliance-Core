/** Schema generation recorded at boot. Bump when a release changes the database. */
export const SCHEMA_VERSION = 1;

export const CORE_EDITION = "core" as const;

export function airgapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const value = String(env.GRC_AIRGAP || "").toLowerCase();
    return value === "1" || value === "true" || value === "yes";
}

export function currentAppVersion(env: NodeJS.ProcessEnv = process.env): string {
    return env.GRC_VERSION || env.npm_package_version || "dev";
}
