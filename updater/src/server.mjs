import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import http from "node:http";
import { executeUpgrade, isActiveState } from "./upgrade.mjs";
import { redact } from "./redact.mjs";

export function secretMatches(header, secret) {
    const presented = typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice("Bearer ".length)
        : "";
    const left = createHash("sha256").update(presented).digest();
    const right = createHash("sha256").update(String(secret || "")).digest();
    return timingSafeEqual(left, right);
}

function send(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Cache-Control": "no-store",
    });
    res.end(payload);
}

async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) throw new Error("body too large");
        chunks.push(chunk);
    }
    if (size === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createUpdaterServer(deps) {
    const state = deps.state;
    let running = null;

    async function acceptUpgrade() {
        if (deps.airgap()) {
            return { status: 403, body: { ...state.get(), airgap: true, error: "Updates are disabled because GRC_AIRGAP is set" } };
        }
        const current = state.get();
        if (isActiveState(current.state) || running) {
            return { status: 409, body: { ...current, error: "An upgrade is already running" } };
        }
        const manifest = current.available || (await deps.discover()).manifest;
        if (!manifest) {
            return { status: 409, body: { ...state.get(), error: "No pinned update is available" } };
        }
        const runId = randomUUID();
        state.update({
            runId,
            available: manifest,
            state: "disk_check",
            progress: 5,
            step: "disk_check",
            message: "Starting upgrade",
            error: null,
            rolledBack: false,
            backupDir: null,
        });
        running = executeUpgrade(deps.upgradeContext(manifest, runId))
            .catch((error) => {
                console.error(error instanceof Error ? error.stack : error);
                state.update({
                    state: "failed",
                    progress: 100,
                    step: "failed",
                    error: redact(error instanceof Error ? error.message : "Upgrade failed"),
                    message: "Upgrade failed",
                    rolledBack: false,
                });
            })
            .finally(() => {
                running = null;
            });
        return { status: 202, body: state.get() };
    }

    return http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url || "/", "http://updater");
            if (req.method === "GET" && url.pathname === "/healthz") {
                send(res, 200, { ok: true });
                return;
            }
            if (!secretMatches(req.headers.authorization, deps.secret())) {
                send(res, 401, { error: "Unauthorized" });
                return;
            }
            if (req.method === "GET" && url.pathname === "/v1/status") {
                send(res, 200, state.get());
                return;
            }
            if (req.method === "POST" && url.pathname === "/v1/check") {
                await readBody(req);
                if (deps.airgap()) {
                    send(res, 403, { ...state.get(), airgap: true, error: "Updates are disabled because GRC_AIRGAP is set" });
                    return;
                }
                if (isActiveState(state.get().state)) {
                    send(res, 200, state.get());
                    return;
                }
                const found = await deps.discover();
                state.update({
                    available: found.manifest,
                    message: found.message,
                    error: found.manifest ? null : found.message,
                    state: "idle",
                });
                send(res, 200, state.get());
                return;
            }
            if (req.method === "POST" && url.pathname === "/v1/upgrade") {
                await readBody(req);
                const accepted = await acceptUpgrade();
                send(res, accepted.status, accepted.body);
                return;
            }
            send(res, 404, { error: "Not found" });
        } catch (error) {
            send(res, 400, { error: redact(error instanceof Error ? error.message : "Bad request") });
        }
    });
}

export function initialStatus(env) {
    return {
        edition: "core",
        runId: null,
        state: "idle",
        progress: 0,
        step: null,
        message: null,
        error: null,
        rolledBack: false,
        airgap: ["1", "true", "yes"].includes(String(env.GRC_AIRGAP || "").toLowerCase()),
        currentVersion: env.GRC_VERSION || "dev",
        available: null,
        backupDir: null,
        schemaVersion: null,
        previousVersion: null,
    };
}
