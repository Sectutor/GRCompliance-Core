import { describe, expect, it } from "vitest";
import { buildDiagnostics } from "./bundle";

describe("diagnostics bundle", () => {
    it("keeps secrets, emails, and planted personal data out of the file list", () => {
        const bundle = buildDiagnostics({
            version: "1.0.0",
            edition: "core",
            schemaVersion: 3,
            health: { ok: true },
            containers: [{ name: "app", status: "running" }],
            logLines: [
                "login failed for ada@example.com password=supersecretvalue",
                "postgres://grc:secretpass@db:5432/grcompliance",
                "customer Jordan Example uploaded passport.pdf",
            ],
            env: {
                ADMIN_PASSWORD: "supersecretvalue",
                DATABASE_URL: "postgres://grc:secretpass@db:5432/grcompliance",
                ADMIN_EMAIL: "ada@example.com",
                APP_PORT: "3001",
            },
            diskFreeBytes: 1000,
            ramTotalBytes: 8000,
            ramFreeBytes: 4000,
        });
        const names = bundle.files.map((file) => file.name);
        expect(names).toEqual(["manifest.json", "containers.json", "env-keys.txt", "secret-key-names.txt", "logs.txt"]);
        const joined = bundle.files.map((file) => file.body).join("\n");
        expect(joined).not.toContain("supersecretvalue");
        expect(joined).not.toContain("secretpass");
        expect(joined).not.toContain("ada@example.com");
        expect(joined).not.toContain("Jordan Example");
        expect(joined).not.toContain("passport.pdf");
        expect(joined).toContain("ADMIN_PASSWORD");
        expect(joined).toContain("APP_PORT");
        expect(joined).toContain("[redacted-email]");
    });
});
