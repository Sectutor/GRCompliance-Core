export type UpdaterResult = { status: number; body: Record<string, unknown> };

export async function updaterFetch(path: string, init: RequestInit = {}): Promise<UpdaterResult> {
    const base = process.env.UPDATER_URL || "http://updater:9090";
    const secret = process.env.UPDATER_SECRET || "";
    if (!secret) {
        throw new Error("UPDATER_SECRET is not set");
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${secret}`);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${base}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body: body as Record<string, unknown> };
}
