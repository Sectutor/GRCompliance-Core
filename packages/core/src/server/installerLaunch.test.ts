/**
 * @vitest-environment node
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");

function read(relative: string): string {
    return readFileSync(path.join(repoRoot, relative), "utf8");
}

function resolvePublicUrl(env: { APP_URL?: string; PUBLIC_URL?: string }): { status: number; output: string } {
    const install = read("install.sh");
    const start = install.indexOf("validate_public_url()");
    const end = install.indexOf("write_env()");
    const functions = install.slice(start, end);
    try {
        const childEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH };
        if (env.APP_URL !== undefined) childEnv.APP_URL = env.APP_URL;
        if (env.PUBLIC_URL !== undefined) childEnv.PUBLIC_URL = env.PUBLIC_URL;
        const output = execFileSync("bash", ["-c", `${functions}\nresolve_public_url 3001`], {
            encoding: "utf8",
            env: childEnv,
        });
        return { status: 0, output: output.trim() };
    } catch (error) {
        const failed = error as { status?: number; stderr?: Buffer | string; stdout?: Buffer | string };
        const stderr = typeof failed.stderr === "string" ? failed.stderr : failed.stderr?.toString("utf8") ?? "";
        const stdout = typeof failed.stdout === "string" ? failed.stdout : failed.stdout?.toString("utf8") ?? "";
        return { status: failed.status ?? 1, output: `${stdout}${stderr}`.trim() };
    }
}

describe("one-line installer contract", () => {
    it("points the README one-liners at main and explains the public address", () => {
        const readme = read("README.md");
        expect(readme).toContain("curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash");
        expect(readme).toContain("irm https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.ps1 | iex");
        expect(readme).toContain("## Installing on a server or with your own domain");
        expect(readme).toContain("APP_URL");
        expect(readme).toContain("PUBLIC_URL");
    });

    it("checks Docker, generates secrets, prints the accepted URL, and does not wipe data on re-run", () => {
        const install = read("install.sh");
        const windows = read("install.ps1");
        expect(install).toContain("command -v docker");
        expect(install).toContain("docker compose version");
        expect(install).toContain("Docker is not installed or not on PATH.");
        expect(install).toContain("The Docker Compose plugin is missing.");
        expect(install).toContain("openssl rand -hex 24");
        expect(install).toContain("openssl rand -hex 32");
        expect(install).not.toMatch(/ADMIN_PASSWORD=(admin|password|changeme|secret)\b/);
        expect(install).not.toContain("GRCompliance is up: http://127.0.0.1");
        expect(install).toContain('echo "GRCompliance is up: ${public_url}"');
        expect(install).toContain("Re-run left the existing database and uploaded files in place.");
        expect(install).not.toContain("compose down");
        expect(install).not.toContain("volume rm");
        expect(install).not.toContain("--renew-anon-volumes");
        expect(windows).toContain('Write-Host "GRCompliance is up: $appUrl"');
        expect(windows).not.toContain("GRCompliance is up: http://127.0.0.1");
        expect(windows).toContain("New-SecretHex");
        expect(windows).toContain("Re-run left the existing database and uploaded files in place.");

        expect(resolvePublicUrl({})).toEqual({ status: 0, output: "http://localhost:3001" });
        expect(resolvePublicUrl({ APP_URL: "https://grc.example.com" })).toEqual({
            status: 0,
            output: "https://grc.example.com",
        });
        expect(resolvePublicUrl({ PUBLIC_URL: "http://203.0.113.10:3001" })).toEqual({
            status: 0,
            output: "http://203.0.113.10:3001",
        });
        expect(resolvePublicUrl({
            APP_URL: "https://grc.example.com",
            PUBLIC_URL: "http://203.0.113.10:3001",
        }).output).toBe("https://grc.example.com");
        expect(resolvePublicUrl({ APP_URL: "https://demo.grcompliance.com" }).status).not.toBe(0);
        expect(resolvePublicUrl({ APP_URL: "https://user:pass@grc.example.com" }).output).toContain("must not include credentials");
    });

    it("uses fully qualified compose image names", () => {
        const compose = read("docker-compose.yml");
        const dockerfile = read("Dockerfile");
        expect(compose).toContain("image: docker.io/library/redis:7-alpine");
        expect(compose).toContain("image: docker.io/pgvector/pgvector:pg16");
        expect(compose).toContain("image: ghcr.io/sectutor/grcompliance-core:${GRC_VERSION:-latest}");
        expect(compose).not.toMatch(/^\s*image:\s+redis:/m);
        expect(compose).not.toMatch(/^\s*image:\s+pgvector\//m);
        expect(dockerfile).toContain("FROM docker.io/library/node:20-bookworm-slim");
        expect(dockerfile).not.toMatch(/^FROM node:/m);
    });
});
