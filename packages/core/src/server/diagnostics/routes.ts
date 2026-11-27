import os from "node:os";
import express, { Request, Response } from "express";
import archiver from "archiver";
import { isPlatformAdmin } from "../workspaceAccess";
import { currentAppVersion, SCHEMA_VERSION } from "../updates/schemaVersion";
import { buildDiagnostics, type DiagnosticsInput } from "./bundle";

type AuthedRequest = Request & { user?: { id?: number; role?: string | null } };

function admin(req: AuthedRequest, res: Response): boolean {
    if (!req.user?.id) {
        res.status(401).json({ error: "Authentication required" });
        return false;
    }
    if (!isPlatformAdmin(req.user.role)) {
        res.status(403).json({ error: "Only an administrator can download diagnostics" });
        return false;
    }
    return true;
}

export function collectDiagnostics(read: () => DiagnosticsInput = defaultDiagnostics): DiagnosticsInput {
    return read();
}

function defaultDiagnostics(): DiagnosticsInput {
    return {
        version: currentAppVersion(),
        edition: "core",
        schemaVersion: SCHEMA_VERSION,
        health: { ok: true },
        containers: [],
        logLines: [],
        env: process.env as Record<string, string | undefined>,
        diskFreeBytes: null,
        ramTotalBytes: os.totalmem(),
        ramFreeBytes: os.freemem(),
    };
}

export function createDiagnosticsRouter(read: () => DiagnosticsInput = defaultDiagnostics) {
    const router = express.Router();

    router.get("/", (req: AuthedRequest, res: Response) => {
        if (!admin(req, res)) return;
        const bundle = buildDiagnostics(read());
        res.status(200).json({
            files: bundle.files.map((file) => file.name),
            note: "This download stays on your computer. We do not upload it.",
        });
    });

    router.get("/download", (req: AuthedRequest, res: Response) => {
        if (!admin(req, res)) return;
        const bundle = buildDiagnostics(read());
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", "attachment; filename=\"grcompliance-diagnostics.zip\"");
        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", () => {
            if (!res.headersSent) res.status(500).json({ error: "We could not build the diagnostics file." });
        });
        archive.pipe(res);
        for (const file of bundle.files) archive.append(file.body, { name: file.name });
        void archive.finalize();
    });

    return router;
}
