import express, { Request, Response } from "express";
import { isPlatformAdmin } from "../workspaceAccess";
import { airgapEnabled, CORE_EDITION, currentAppVersion, SCHEMA_VERSION } from "./schemaVersion";
import { updaterFetch } from "./updaterClient";

type AuthedRequest = Request & { user?: { id?: number; role?: string | null } };

export type UpdateAudit = {
    userId: number;
    action: "upgrade_started" | "upgrade_completed" | "upgrade_failed" | "upgrade_rolled_back" | "upgrade_rejected";
    details: Record<string, unknown>;
    severity?: "info" | "warning" | "critical";
};

export type UpdateDeps = {
    airgap: () => boolean;
    currentVersion: () => string;
    schemaVersion: number;
    callUpdater: (path: string, init?: RequestInit) => Promise<{ status: number; body: Record<string, unknown> }>;
    audit: (event: UpdateAudit) => Promise<void>;
    noteTerminal: (event: {
        userId: number;
        runId: string;
        state: string;
        rolledBack: boolean;
        message: string | null;
        error: string | null;
        version: string | null;
    }) => Promise<void>;
    markStarted: (event: { userId: number; runId: string; version: string | null }) => Promise<void>;
};

const ACTIVE_FALLBACK = new Set([
    "disk_check",
    "backing_up",
    "pulling",
    "recreating",
    "waiting_healthy",
    "rolling_back",
    "restoring_database",
]);

function active(state: unknown): boolean {
    return typeof state === "string" && ACTIVE_FALLBACK.has(state);
}

export function presentUpdate(upstream: Record<string, unknown> | null, deps: UpdateDeps, updater: "ok" | "unavailable") {
    const airgap = deps.airgap() || upstream?.airgap === true;
    const available = upstream?.available && typeof upstream.available === "object" ? upstream.available : null;
    return {
        edition: CORE_EDITION,
        updater,
        currentVersion: typeof upstream?.currentVersion === "string" ? upstream.currentVersion : deps.currentVersion(),
        schemaVersion: deps.schemaVersion,
        airgap,
        state: typeof upstream?.state === "string" ? upstream.state : "idle",
        progress: typeof upstream?.progress === "number" ? upstream.progress : 0,
        step: typeof upstream?.step === "string" ? upstream.step : null,
        message: typeof upstream?.message === "string" ? upstream.message : updater === "unavailable" ? "Updater sidecar is not reachable" : null,
        error: typeof upstream?.error === "string" ? upstream.error : null,
        available,
        rolledBack: upstream?.rolledBack === true,
        backupDir: typeof upstream?.backupDir === "string" ? upstream.backupDir : null,
        runId: typeof upstream?.runId === "string" ? upstream.runId : null,
        canUpgrade: updater === "ok" && !airgap && !!available && !active(upstream?.state),
    };
}

function admin(req: AuthedRequest, res: Response): { id: number } | null {
    if (!req.user?.id) {
        res.status(401).json({ error: "Authentication required" });
        return null;
    }
    if (!isPlatformAdmin(req.user.role)) {
        res.status(403).json({ error: "Only an administrator can update this instance" });
        return null;
    }
    return { id: req.user.id };
}

async function noteIfTerminal(deps: UpdateDeps, userId: number, body: Record<string, unknown>) {
    const state = typeof body.state === "string" ? body.state : "";
    const runId = typeof body.runId === "string" ? body.runId : "";
    if (!runId || (state !== "succeeded" && state !== "failed")) return;
    await deps.noteTerminal({
        userId,
        runId,
        state,
        rolledBack: body.rolledBack === true,
        message: typeof body.message === "string" ? body.message : null,
        error: typeof body.error === "string" ? body.error : null,
        version: typeof body.currentVersion === "string" ? body.currentVersion : null,
    });
}

export function createUpdateRouter(deps: UpdateDeps) {
    const router = express.Router();

    router.get("/status", async (req: AuthedRequest, res: Response) => {
        const user = admin(req, res);
        if (!user) return;
        try {
            const upstream = await deps.callUpdater("/v1/status");
            await noteIfTerminal(deps, user.id, upstream.body);
            res.status(200).json(presentUpdate(upstream.body, deps, "ok"));
        } catch {
            res.status(200).json(presentUpdate(null, deps, "unavailable"));
        }
    });

    router.post("/check", async (req: AuthedRequest, res: Response) => {
        const user = admin(req, res);
        if (!user) return;
        if (deps.airgap()) {
            res.status(403).json(presentUpdate({ airgap: true, error: "Updates are disabled because GRC_AIRGAP is set", message: "Updates are disabled" }, deps, "ok"));
            return;
        }
        try {
            const upstream = await deps.callUpdater("/v1/check", { method: "POST", body: "{}" });
            res.status(upstream.status).json(presentUpdate(upstream.body, deps, "ok"));
        } catch {
            res.status(200).json(presentUpdate(null, deps, "unavailable"));
        }
    });

    router.post("/upgrade", async (req: AuthedRequest, res: Response) => {
        const user = admin(req, res);
        if (!user) return;
        if (deps.airgap()) {
            await deps.audit({
                userId: user.id,
                action: "upgrade_rejected",
                severity: "warning",
                details: { reason: "airgap" },
            });
            res.status(403).json(presentUpdate({ airgap: true, error: "Updates are disabled because GRC_AIRGAP is set" }, deps, "ok"));
            return;
        }
        try {
            const upstream = await deps.callUpdater("/v1/upgrade", { method: "POST", body: "{}" });
            if (upstream.status === 202 && typeof upstream.body.runId === "string") {
                const version = upstream.body.available && typeof upstream.body.available === "object"
                    ? String((upstream.body.available as { version?: string }).version || "")
                    : null;
                await deps.markStarted({ userId: user.id, runId: upstream.body.runId, version });
                await deps.audit({
                    userId: user.id,
                    action: "upgrade_started",
                    severity: "warning",
                    details: { runId: upstream.body.runId, version },
                });
            }
            res.status(upstream.status).json(presentUpdate(upstream.body, deps, "ok"));
        } catch {
            res.status(503).json(presentUpdate(null, deps, "unavailable"));
        }
    });

    return router;
}

export function liveUpdateDeps(overrides: Partial<UpdateDeps> = {}): UpdateDeps {
    return {
        airgap: () => airgapEnabled(),
        currentVersion: () => currentAppVersion(),
        schemaVersion: SCHEMA_VERSION,
        callUpdater: (path, init) => updaterFetch(path, init),
        audit: async () => undefined,
        noteTerminal: async () => undefined,
        markStarted: async () => undefined,
        ...overrides,
    };
}
