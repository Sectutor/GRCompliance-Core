import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import path from "path";

/**
 * Browser origin checks belong on cross-origin API calls.
 * Static files and the SPA document are loaded by the page itself. Rejecting
 * those requests with "Not allowed by CORS" leaves a blank page when the
 * browser sends Origin for 127.0.0.1, a server IP, or the operator's domain.
 * Credentialed API calls still use an explicit allowlist. A wildcard is not
 * combined with credentials.
 */

export function isApiPath(requestPath: string): boolean {
    const pathOnly = requestPath.split("?")[0] || "/";
    return pathOnly === "/api" || pathOnly.startsWith("/api/");
}

export function corsAllowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
    const allowed = new Set<string>();
    for (const raw of (env.CORS_ORIGIN || "").split(",")) {
        const trimmed = raw.trim();
        if (trimmed) allowed.add(trimmed);
    }
    const appUrl = (env.APP_URL || env.PUBLIC_URL || env.NEXT_PUBLIC_APP_URL || "").trim();
    if (appUrl) {
        try {
            allowed.add(new URL(appUrl).origin);
        } catch {
            /* a malformed APP_URL is rejected by appOrigin() when a link is built */
        }
    }
    if (!env.CORS_ORIGIN && env.NODE_ENV !== "production") {
        allowed.add("http://localhost:5173");
        allowed.add("http://localhost:3001");
    }
    return allowed;
}

/** True when the browser's Origin is the host that received this request. */
export function isSameOrigin(req: Request, origin: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(origin);
    } catch {
        return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (req.protocol !== "http" && req.protocol !== "https") return false;
    if (`${req.protocol}:` !== parsed.protocol) return false;

    const hostHeader = req.headers.host;
    if (typeof hostHeader !== "string" || hostHeader.length === 0) return false;

    const expectedPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    let hostname = "";
    let port = req.protocol === "https" ? "443" : "80";
    if (hostHeader.startsWith("[")) {
        const end = hostHeader.indexOf("]");
        if (end <= 1) return false;
        hostname = hostHeader.slice(1, end);
        const rest = hostHeader.slice(end + 1);
        if (rest.startsWith(":")) port = rest.slice(1);
        else if (rest.length > 0) return false;
    } else {
        const colon = hostHeader.lastIndexOf(":");
        if (colon !== -1) {
            hostname = hostHeader.slice(0, colon);
            port = hostHeader.slice(colon + 1);
        } else {
            hostname = hostHeader;
        }
    }
    if (!hostname) return false;
    return hostname.toLowerCase() === parsed.hostname.toLowerCase() && port === expectedPort;
}

export function createApiCorsMiddleware() {
    const corsMiddleware = cors({
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }
            const allowed = corsAllowedOrigins();
            const isLoopback = origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
            if (allowed.has(origin) || (process.env.NODE_ENV !== "production" && isLoopback)) {
                callback(null, true);
                return;
            }
            console.error(`[CORS] Rejected origin: ${origin}`);
            callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    });

    return (req: Request, res: Response, next: NextFunction) => {
        if (!isApiPath(req.path)) {
            next();
            return;
        }
        const originHeader = req.headers.origin;
        const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
        // Same-origin API calls are the page talking to itself. The allowlist
        // applies when a different site calls the API with credentials.
        if (origin && isSameOrigin(req, origin)) {
            next();
            return;
        }
        corsMiddleware(req, res, next);
    };
}

export function mountSpa(app: Express, distPath: string): void {
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
        if (isApiPath(req.path)) {
            next();
            return;
        }
        res.sendFile(path.join(distPath, "index.html"));
    });
}
