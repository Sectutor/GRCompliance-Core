/**
 * Public base URL for links in server-sent email.
 *
 * `APP_URL` is the documented server setting (docker-compose, .env.example).
 * `VITE_APP_URL` is a client build variable and is not set on the server, so
 * it is intentionally ignored. `NEXT_PUBLIC_APP_URL` is a legacy fallback used
 * by older server mail. When neither is a usable http(s) URL, fall back to
 * localhost on the process port (default 3001, the published app port).
 */
export function getAppBaseUrl(env: Record<string, string | undefined> = process.env): string {
    for (const candidate of [env.APP_URL, env.NEXT_PUBLIC_APP_URL]) {
        const normalized = normalizeBaseUrl(candidate);
        if (normalized) return normalized;
    }

    const port = numericPort(env.PORT) ?? numericPort(env.APP_PORT) ?? "3001";
    return `http://localhost:${port}`;
}

export function appLink(path: string, env?: Record<string, string | undefined>): string {
    const base = getAppBaseUrl(env);
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
}

export function normalizeBaseUrl(raw: string | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;

    parsed.search = "";
    parsed.hash = "";
    const serialized = parsed.toString();
    return serialized.endsWith("/") ? serialized.slice(0, -1) : serialized;
}

function numericPort(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!/^\d{1,5}$/.test(trimmed)) return null;
    const port = Number(trimmed);
    if (port < 1 || port > 65535) return null;
    return String(port);
}
