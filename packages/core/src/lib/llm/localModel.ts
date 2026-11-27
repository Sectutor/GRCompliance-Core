export const BUNDLED_MODEL = "qwen2.5:0.5b";
export const BUNDLED_DOWNLOAD_MB = 400;
export const BUNDLED_RAM_GB = 4;

const ALLOWED_HOSTS = new Set(["ollama", "127.0.0.1", "localhost"]);

export function allowedLocalBase(raw: string | undefined): URL | null {
    if (!raw) return null;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!ALLOWED_HOSTS.has(url.hostname)) return null;
    return url;
}

export function localModelOffer(baseUrl: string | undefined, freeRamBytes: number) {
    const base = allowedLocalBase(baseUrl);
    return {
        configured: !!base,
        model: BUNDLED_MODEL,
        downloadMb: BUNDLED_DOWNLOAD_MB,
        ramGb: BUNDLED_RAM_GB,
        freeRamGb: Math.max(0, Math.round(freeRamBytes / (1024 * 1024 * 1024))),
        command: "docker compose --profile ai up -d ollama",
        note: "The model stays on this server. Customer data is not sent to us. The download starts only after an administrator asks for it.",
    };
}
