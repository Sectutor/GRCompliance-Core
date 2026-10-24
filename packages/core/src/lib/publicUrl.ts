/**
 * Origin used in links this instance sends (invites, email, OAuth callbacks).
 *
 * The value comes from the operator's own address: APP_URL, then
 * NEXT_PUBLIC_APP_URL, then VITE_APP_URL. A missing value in production
 * throws. Development falls back to the local dev server. Hosts on
 * grcompliance.com are refused so a self-hosted instance cannot emit
 * vendor links.
 */

const DEV_ORIGIN = "http://localhost:3001";

export function isVendorHostname(hostname: string): boolean {
    const host = hostname.trim().toLowerCase().replace(/\.$/, "");
    return host === "grcompliance.com" || host.endsWith(".grcompliance.com");
}

function readConfiguredOrigin(): string | null {
    const candidates = [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL, process.env.VITE_APP_URL];
    for (const raw of candidates) {
        if (typeof raw !== "string" || raw.trim() === "") continue;
        let url: URL;
        try {
            url = new URL(raw.trim());
        } catch {
            throw new Error("APP_URL must be an absolute http(s) URL");
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("APP_URL must be an absolute http(s) URL");
        }
        if (url.username || url.password) {
            throw new Error("APP_URL must not include credentials");
        }
        if (isVendorHostname(url.hostname)) {
            throw new Error("APP_URL must be this instance's own address");
        }
        return url.origin;
    }
    return null;
}

export function appOrigin(): string {
    const configured = readConfiguredOrigin();
    if (configured) return configured;
    if (process.env.NODE_ENV === "production") {
        throw new Error("APP_URL is required in production and must be this instance's own address");
    }
    return DEV_ORIGIN;
}
