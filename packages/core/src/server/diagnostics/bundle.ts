const SECRET_KEY = /PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL/i;

export type DiagnosticsInput = {
    version: string;
    edition: "core";
    schemaVersion: number;
    health: { ok: boolean };
    containers: { name: string; status: string }[];
    logLines: string[];
    env: Record<string, string | undefined>;
    diskFreeBytes: number | null;
    ramTotalBytes: number;
    ramFreeBytes: number;
};

export type DiagnosticsFile = { name: string; body: string };

export function redactDiagnosticLine(line: string): string {
    return String(line)
        .replace(/postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/gi, "postgres://[redacted]@")
        .replace(/\b(PASSWORD|SECRET|TOKEN|KEY|PGPASSWORD)=([^\s]+)/gi, "$1=[redacted]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
        .slice(0, 500);
}

/**
 * Allow-listed diagnostics. Callers cannot add database rows, uploads, or
 * secret values by passing extra fields: only the fields read below are written.
 */
export function buildDiagnostics(input: DiagnosticsInput): { files: DiagnosticsFile[] } {
    const envKeys = Object.keys(input.env || {})
        .filter((key) => typeof key === "string" && key.length > 0)
        .sort();
    const secretKeyNames = envKeys.filter((key) => SECRET_KEY.test(key));
    const manifest = {
        version: input.version,
        edition: "core" as const,
        schemaVersion: input.schemaVersion,
        healthOk: input.health?.ok === true,
        diskFreeBytes: input.diskFreeBytes,
        ramTotalBytes: input.ramTotalBytes,
        ramFreeBytes: input.ramFreeBytes,
        note: "This file lists what an administrator chose to download. It is not sent anywhere.",
    };
    const containers = (input.containers || []).map((item) => ({
        name: String(item.name || "").slice(0, 120),
        status: String(item.status || "").slice(0, 40),
    }));
    const logs = (input.logLines || [])
        .slice(-200)
        .map(redactDiagnosticLine)
        .filter((line) => !/\buploaded\b/i.test(line) && !/\.(pdf|docx|xlsx|png|jpg|csv)\b/i.test(line));
    return {
        files: [
            { name: "manifest.json", body: `${JSON.stringify(manifest, null, 2)}\n` },
            { name: "containers.json", body: `${JSON.stringify(containers, null, 2)}\n` },
            { name: "env-keys.txt", body: `${envKeys.join("\n")}\n` },
            { name: "secret-key-names.txt", body: `${secretKeyNames.join("\n")}\n` },
            { name: "logs.txt", body: `${logs.join("\n")}\n` },
        ],
    };
}
