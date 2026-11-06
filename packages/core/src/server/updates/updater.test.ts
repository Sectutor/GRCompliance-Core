/**
 * @vitest-environment node
 */
import http from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverRelease } from "../../../../../updater/src/discover.mjs";
import { upsertEnvKeys } from "../../../../../updater/src/envfile.mjs";
import { assertCoreManifest, assertPublicCoreUrl, isNewerVersion, schemaAllowsUpgrade, selectNewerManifest } from "../../../../../updater/src/manifest.mjs";
import { createUpdaterServer, initialStatus, secretMatches } from "../../../../../updater/src/server.mjs";
import { executeUpgrade } from "../../../../../updater/src/upgrade.mjs";
import { buildReleaseManifest } from "../../../../../scripts/write-release-manifest.mjs";
import { createUpdateRouter, type UpdateDeps } from "./routes";

const image = "ghcr.io/sectutor/grcompliance-core";
const digest = (char: string) => `sha256:${char.repeat(64)}`;

function release(version: string, char = "b", minSchemaVersion = 1) {
    return {
        edition: "core",
        version,
        releasedAt: "2026-11-06T00:00:00.000Z",
        notes: "notes",
        image: { name: image, tag: version, digest: digest(char) },
        artifact: null,
        minSchemaVersion,
    };
}

function context(overrides: Record<string, unknown> = {}) {
    const calls: string[] = [];
    let schema = 1;
    const status: Record<string, unknown> = {};
    const ctx = {
        calls,
        manifest: release("1.1.0"),
        allowedImages: [image],
        previousImage: { ref: "grc-rollback:prev", digest: digest("a"), version: "1.0.0" },
        report(patch: Record<string, unknown>) { Object.assign(status, patch); calls.push(`state:${patch.state}`); },
        snapshot() { return { ...status }; },
        async readSchemaVersion() { calls.push("schema"); return schema; },
        async diskFreeBytes() { calls.push("disk"); return 9_000_000_000; },
        async requiredBytes() { calls.push("need"); return 100; },
        async backup() { calls.push("backup"); return { dir: "/backups/run" }; },
        async verifyChecksums() { calls.push("checksum"); },
        async pullPinned() { calls.push("pull"); return { ref: `${image}@${digest("b")}`, digest: digest("b"), version: "1.1.0" }; },
        async pinPrevious() { calls.push("pin"); },
        async recreate(next: { ref: string }) {
            calls.push(`recreate:${next.ref}`);
            if (String(next.ref).includes(digest("b"))) schema = 2;
        },
        async waitHealthy() { calls.push("health"); return { ok: true, body: { version: "1.1.0", edition: "core" } }; },
        async restore() { calls.push("restore"); schema = 1; },
        async commitRelease() { calls.push("commit"); },
        ...overrides,
    };
    return ctx;
}

describe("core release manifest", () => {
    it("rejects latest, a missing digest, and a non-core edition", () => {
        expect(() => assertCoreManifest(release("latest"))).toThrow(/semver|latest/);
        const missing = release("1.2.0");
        missing.image.digest = "sha256:short";
        expect(() => assertCoreManifest(missing)).toThrow(/digest/);
        expect(() => assertCoreManifest({ ...release("1.2.0"), edition: "premium" })).toThrow(/core/);
        expect(() => assertCoreManifest({ ...release("1.2.0"), artifact: { url: "https://example.com/a.tgz" } })).toThrow(/artifact/);
        expect(() => assertCoreManifest({
            ...release("1.2.0"),
            image: { name: "grcompliance-premium", tag: "1.2.0", digest: digest("a") },
        }, { allowedImages: ["grcompliance-premium"] })).toThrow(/Premium/);
        expect(() => assertCoreManifest({
            ...release("1.2.0"),
            image: { name: "ghcr.io/sectutor/grcompliance-premium", tag: "1.2.0", digest: digest("a") },
        }, { allowedImages: ["ghcr.io/sectutor/grcompliance-premium"] })).toThrow(/Premium/);
        expect(() => assertPublicCoreUrl("https://license.example/api/v1/releases/1/artifact")).toThrow(/GitHub|artifact/);
        expect(schemaAllowsUpgrade(0, 1)).toBe(true);
        expect(schemaAllowsUpgrade(0, 2)).toBe(false);
        expect(schemaAllowsUpgrade(1, 2)).toBe(false);
        expect(isNewerVersion("latest", "1.2.3")).toBe(true);
        expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
        expect(isNewerVersion("1.2.3", "1.2.4-rc.1")).toBe(false);
        const selected = selectNewerManifest([
            assertCoreManifest(release("1.2.0", "c")),
            assertCoreManifest(release("1.4.0", "d")),
            assertCoreManifest(release("1.3.0", "e")),
        ], "1.2.0", "");
        expect(selected?.version).toBe("1.4.0");
    });

    it("writes a pinned manifest and refuses latest", () => {
        const manifest = buildReleaseManifest({
            version: "v1.2.3",
            digest: digest("a"),
            releasedAt: "2026-11-06T00:00:00.000Z",
        });
        expect(manifest.image.tag).toBe("1.2.3");
        expect(manifest.artifact).toBeNull();
        expect(manifest.image.name).toBe(image);
        expect(() => buildReleaseManifest({ version: "latest", digest: digest("a") })).toThrow();
    });

    it("keeps env writes to safe keys", () => {
        const next = upsertEnvKeys("GRC_VERSION=latest\nADMIN_PASSWORD=keep\n", {
            GRC_VERSION: "1.2.3",
            GRC_IMAGE: `${image}@${digest("a")}`,
        });
        expect(next).toContain("GRC_VERSION=1.2.3");
        expect(next).toContain("ADMIN_PASSWORD=keep");
        expect(next).toContain(`GRC_IMAGE=${image}@${digest("a")}`);
        expect(() => upsertEnvKeys("", { GRC_VERSION: "1.2.3\nEVIL=1" })).toThrow(/unsafe/);
    });
});

describe("upgrade flow", () => {
    it("backs up, pulls a pinned image, and commits on a healthy app", async () => {
        const ctx = context();
        const result = await executeUpgrade(ctx);
        expect(ctx.calls).toEqual([
            "schema", "state:disk_check", "disk", "need", "state:backing_up", "backup", "checksum",
            "state:pulling", "pull", "pin", "state:recreating", "recreate:ghcr.io/sectutor/grcompliance-core@" + digest("b"),
            "state:waiting_healthy", "health", "schema", "commit", "state:succeeded",
        ]);
        expect(result.state).toBe("succeeded");
        expect(ctx.calls).not.toContain("restore");
    });

    it("does not replace the app when the disk check fails", async () => {
        const ctx = context({
            async diskFreeBytes() { ctx.calls.push("disk"); return 1; },
        });
        const result = await executeUpgrade(ctx);
        expect(result.state).toBe("failed");
        expect(ctx.calls).not.toContain("backup");
        expect(ctx.calls.some((call) => call.startsWith("recreate:"))).toBe(false);
    });

    it("rolls the image back and restores the database when schema_version changed", async () => {
        const ctx = context({
            async waitHealthy() {
                ctx.calls.push("health");
                if (ctx.calls.filter((call) => call === "health").length === 1) {
                    return { ok: false, body: { fatal: true, version: "1.1.0" } };
                }
                return { ok: true, body: { version: "1.0.0", edition: "core" } };
            },
        });
        const result = await executeUpgrade(ctx);
        expect(ctx.calls).toContain("restore");
        expect(ctx.calls).toContain("recreate:grc-rollback:prev");
        expect(result.rolledBack).toBe(true);
        expect(result.state).toBe("failed");
    });

    it("rolls the image back without a database restore when the schema did not change", async () => {
        const ctx = context({
            async recreate() { ctx.calls.push("recreate:same"); },
            async waitHealthy() {
                ctx.calls.push("health");
                return { ok: ctx.calls.filter((call) => call === "health").length > 1, body: { version: "1.1.0", edition: "core" } };
            },
        });
        const result = await executeUpgrade(ctx);
        expect(ctx.calls).not.toContain("restore");
        expect(result.rolledBack).toBe(true);
    });
});

describe("release discovery", () => {
    it("uses a GitHub release manifest and ignores latest", async () => {
        const seen: string[] = [];
        const fetchImpl = async (url: string) => {
            seen.push(String(url));
            if (String(url).includes("release-manifest.json")) {
                return new Response(JSON.stringify(release("1.3.0", "c")), { status: 200 });
            }
            if (String(url).includes("/releases")) {
                return new Response(JSON.stringify([{
                    draft: false,
                    prerelease: false,
                    tag_name: "v1.3.0",
                    published_at: "2026-11-06T00:00:00.000Z",
                    body: "from github",
                    html_url: "https://github.com/Sectutor/GRCompliance-Core/releases/tag/v1.3.0",
                    assets: [{
                        name: "release-manifest.json",
                        browser_download_url: "https://github.com/Sectutor/GRCompliance-Core/releases/download/v1.3.0/release-manifest.json",
                    }],
                }]), { status: 200 });
            }
            return new Response("missing", { status: 404 });
        };
        const found = await discoverRelease({
            fetchImpl,
            currentVersion: "1.2.0",
            imageName: image,
            allowedImages: [image],
            repo: "Sectutor/GRCompliance-Core",
        });
        expect(found.manifest?.version).toBe("1.3.0");
        expect(found.manifest?.image.tag).not.toBe("latest");
        expect(seen.some((url) => url.includes("/artifact"))).toBe(false);
        const sidecar = readFileSync(path.resolve(__dirname, "../../../../../updater/src/index.mjs"), "utf8");
        expect(sidecar).not.toMatch(/docker\(\s*\[\s*"load"/);
        expect(sidecar).toContain('["pull"');
        await expect(discoverRelease({
            fetchImpl,
            manifestUrl: "https://license.example/api/v1/releases/1/artifact",
            currentVersion: "1.2.0",
            imageName: image,
            allowedImages: [image],
        })).rejects.toThrow(/GitHub|artifact/);
    });
});

describe("updater http", () => {
    it("rejects a bad secret and refuses an air-gapped upgrade", async () => {
        expect(secretMatches("Bearer no", "yes")).toBe(false);
        expect(secretMatches("Bearer yes", "yes")).toBe(true);
        const state = {
            current: { ...initialStatus({ GRC_VERSION: "1.0.0", GRC_AIRGAP: "1" }), available: release("1.1.0") },
            get() { return structuredClone(this.current); },
            update(patch: Record<string, unknown>) { this.current = { ...this.current, ...patch }; return this.get(); },
        };
        let upgraded = false;
        const server = createUpdaterServer({
            state,
            secret: () => "yes",
            airgap: () => true,
            discover: async () => ({ manifest: null, message: "no" }),
            upgradeContext() { upgraded = true; return {}; },
        });
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        const denied = await fetch(`http://127.0.0.1:${port}/v1/status`);
        const blocked = await fetch(`http://127.0.0.1:${port}/v1/upgrade`, {
            method: "POST",
            headers: { Authorization: "Bearer yes" },
        });
        server.close();
        expect(denied.status).toBe(401);
        expect(blocked.status).toBe(403);
        expect(upgraded).toBe(false);
    });
});

describe("admin update route", () => {
    async function listen(user: { id: number; role: string } | null, deps: Partial<UpdateDeps> = {}) {
        const audits: UpdateDeps["audit"] extends (event: infer E) => Promise<void> ? E[] : never[] = [];
        const calls: string[] = [];
        const app = (await import("express")).default();
        app.use((req, _res, next) => {
            (req as { user?: typeof user }).user = user || undefined;
            next();
        });
        app.use("/api/updates", createUpdateRouter({
            airgap: () => false,
            currentVersion: () => "1.0.0",
            schemaVersion: 1,
            callUpdater: async (path) => {
                calls.push(path);
                return {
                    status: path === "/v1/upgrade" ? 202 : 200,
                    body: {
                        state: path === "/v1/upgrade" ? "disk_check" : "idle",
                        runId: "run-1",
                        currentVersion: "1.0.0",
                        available: release("1.1.0"),
                    },
                };
            },
            audit: async (event) => { audits.push(event); },
            noteTerminal: async () => undefined,
            markStarted: async () => undefined,
            ...deps,
        }));
        const server = http.createServer(app);
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        return { server, port, audits, calls };
    }

    it("hides upgrades from a non-admin and records an admin start", async () => {
        const reader = await listen({ id: 4, role: "user" });
        const forbidden = await fetch(`http://127.0.0.1:${reader.port}/api/updates/upgrade`, { method: "POST" });
        reader.server.close();
        expect(forbidden.status).toBe(403);
        expect(reader.calls).toEqual([]);

        const admin = await listen({ id: 7, role: "admin" });
        const started = await fetch(`http://127.0.0.1:${admin.port}/api/updates/upgrade`, { method: "POST" });
        const body = await started.json();
        admin.server.close();
        expect(started.status).toBe(202);
        expect(body.edition).toBe("core");
        expect(body.canUpgrade).toBe(false);
        expect(admin.audits.map((event) => event.action)).toEqual(["upgrade_started"]);
        expect(admin.calls).toEqual(["/v1/upgrade"]);
    });

    it("does not call the sidecar when the install is air-gapped", async () => {
        const admin = await listen({ id: 7, role: "admin" }, { airgap: () => true });
        const blocked = await fetch(`http://127.0.0.1:${admin.port}/api/updates/upgrade`, { method: "POST" });
        admin.server.close();
        expect(blocked.status).toBe(403);
        expect(admin.calls).toEqual([]);
        expect(admin.audits.map((event) => event.action)).toEqual(["upgrade_rejected"]);
    });
});
