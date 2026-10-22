import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import { logger } from "../lib/logger";
import { normalizeClientId, requireWorkspaceRole } from "./recordAccess";

/** Reject path traversal. A relative folder of letters, numbers, dots, and slashes is kept. */
export function safeUploadFolder(folder: unknown): string | null {
    if (folder == null || folder === "") return "uploads";
    if (typeof folder !== "string") return null;
    if (
        folder.includes("..") ||
        folder.includes("\\") ||
        folder.includes("\0") ||
        folder.startsWith("/") ||
        folder.includes(":")
    ) {
        return null;
    }
    const parts = folder.split("/").filter((part) => part.length > 0);
    if (parts.some((part) => !/^[A-Za-z0-9._-]+$/.test(part))) return null;
    return parts.join("/") || "uploads";
}

export function buildUploadKey(clientId: number, folder: string, filename: string, now = Date.now()): string {
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/^\.+/, "") || "file";
    return `clients/${clientId}/${folder}/${now}-${safeFilename}`;
}

/** Workspace id encoded in an upload key. Anything else, including `..`, is refused. */
export function workspaceIdFromUploadKey(rawKey: string): number | null {
    let key = rawKey;
    try {
        key = decodeURIComponent(rawKey);
    } catch {
        return null;
    }
    key = key.replace(/^\/+/, "");
    if (key.includes("..") || key.includes("\\") || key.includes("\0")) return null;
    const match = /^clients\/([1-9]\d*)\//.exec(key);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isSafeInteger(id) ? id : null;
}

export function uploadKeyBelongsToWorkspace(fileKey: string, clientId: number): boolean {
    return workspaceIdFromUploadKey(fileKey) === clientId;
}

function statusForAccessError(err: unknown): number | null {
    if (err instanceof TRPCError) {
        if (err.code === "UNAUTHORIZED") return 401;
        if (err.code === "FORBIDDEN") return 403;
        if (err.code === "NOT_FOUND") return 404;
    }
    return null;
}

export async function handleUpload(req: any, res: any): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ error: "Authentication required for uploads" });
            return;
        }

        const { filename, data, contentType } = req.body ?? {};
        if (!filename || !data) {
            res.status(400).json({ error: "Missing filename or data" });
            return;
        }

        const folder = safeUploadFolder(req.body?.folder);
        if (folder == null) {
            res.status(400).json({ error: "Invalid folder path" });
            return;
        }

        const clientId = normalizeClientId(req.body?.clientId) ?? normalizeClientId(req.headers?.["x-client-id"]);
        if (clientId == null) {
            res.status(400).json({ error: "Workspace id is required" });
            return;
        }

        await requireWorkspaceRole({
            user: req.user,
            clientId,
            minRole: "editor",
        });

        const buffer = Buffer.from(data, "base64");
        const key = buildUploadKey(clientId, folder, String(filename));
        const result = await storagePut(key, buffer, contentType || "application/octet-stream");

        res.json({
            success: true,
            url: result.url,
            key: result.key,
        });
    } catch (error) {
        const status = statusForAccessError(error);
        if (status) {
            res.status(status).json({ error: status === 401 ? "Authentication required for uploads" : "Forbidden" });
            return;
        }
        logger.error("Upload failed:", error);
        res.status(500).json({ error: "Upload failed: " + (error as Error).message });
    }
}

/** Authorize GET /uploads. The key must name a workspace the caller can read. */
export async function authorizeUploadDownload(req: any, res: any, next: (err?: unknown) => void): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ error: "Authentication required for media access" });
            return;
        }
        const clientId = workspaceIdFromUploadKey(String(req.path || ""));
        if (clientId == null) {
            res.status(403).json({ error: "Forbidden" });
            return;
        }
        await requireWorkspaceRole({
            user: req.user,
            clientId,
            minRole: "viewer",
        });
        next();
    } catch (error) {
        const status = statusForAccessError(error) ?? 403;
        res.status(status).json({ error: status === 401 ? "Authentication required for media access" : "Forbidden" });
    }
}
