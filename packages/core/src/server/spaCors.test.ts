/**
 * @vitest-environment node
 */
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createApiCorsMiddleware, mountSpa } from "./spaCors";

const repoRoot = path.resolve(__dirname, "../../../..");
const envKeys = ["NODE_ENV", "APP_URL", "PUBLIC_URL", "NEXT_PUBLIC_APP_URL", "CORS_ORIGIN", "VITE_APP_URL"] as const;
const previous: Record<string, string | undefined> = {};

function saveEnv() {
    for (const key of envKeys) previous[key] = process.env[key];
}

function restoreEnv() {
    for (const key of envKeys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
    }
}

function request(
    port: number,
    method: string,
    requestPath: string,
    headers: Record<string, string>,
): Promise<{ status: number; body: string; allowOrigin: string | undefined }> {
    return new Promise((resolve, reject) => {
        const client = httpRequest(
            {
                hostname: "127.0.0.1",
                port,
                path: requestPath,
                method,
                headers,
            },
            (res: IncomingMessage) => {
                const chunks: Buffer[] = [];
                res.on("data", (chunk: Buffer) => chunks.push(chunk));
                res.on("end", () => {
                    const allow = res.headers["access-control-allow-origin"];
                    resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString("utf8"),
                        allowOrigin: Array.isArray(allow) ? allow[0] : allow,
                    });
                });
            },
        );
        client.on("error", reject);
        client.end();
    });
}

describe("static pages are not rejected by the API CORS allowlist", () => {
    let server: ReturnType<typeof createServer> | undefined;
    let dir: string | undefined;

    afterEach(async () => {
        restoreEnv();
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server?.close((error) => (error ? reject(error) : resolve()));
            });
            server = undefined;
        }
        if (dir) {
            await rm(dir, { recursive: true, force: true });
            dir = undefined;
        }
    });

    it("returns static files for 127.0.0.1 or another host and still refuses a disallowed credentialed API call", async () => {
        saveEnv();
        process.env.NODE_ENV = "production";
        process.env.APP_URL = "http://localhost:3001";
        delete process.env.PUBLIC_URL;
        delete process.env.NEXT_PUBLIC_APP_URL;
        delete process.env.CORS_ORIGIN;
        delete process.env.VITE_APP_URL;

        dir = await mkdtemp(path.join(tmpdir(), "grc-spa-"));
        await mkdir(path.join(dir, "assets"));
        await writeFile(path.join(dir, "assets", "app.js"), 'console.log("grc-static");\n');
        await writeFile(path.join(dir, "index.html"), '<!doctype html><div id="root"></div>\n');

        const app = express();
        app.use(createApiCorsMiddleware());
        app.post("/api/auth/login", (_req, res) => {
            res.status(200).json({ ok: true });
        });
        mountSpa(app, dir);
        app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
            res.status(500).json({ message: err.message });
        });

        server = createServer(app);
        await new Promise<void>((resolve) => {
            server?.listen(0, "127.0.0.1", () => resolve());
        });
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("test server did not listen");
        const port = address.port;

        const loopbackAsset = await request(port, "GET", "/assets/app.js", {
            Origin: "http://127.0.0.1:3001",
            Host: "127.0.0.1:3001",
        });
        expect(loopbackAsset.status).toBe(200);
        expect(loopbackAsset.body).toContain("grc-static");
        expect(loopbackAsset.body).not.toContain("Not allowed by CORS");
        expect(loopbackAsset.allowOrigin).not.toBe("*");

        const otherHostAsset = await request(port, "GET", "/assets/app.js", {
            Origin: "http://203.0.113.10:3001",
            Host: "203.0.113.10:3001",
        });
        expect(otherHostAsset.status).toBe(200);
        expect(otherHostAsset.body).toContain("grc-static");
        expect(otherHostAsset.body).not.toContain("Not allowed by CORS");

        const spa = await request(port, "GET", "/", {
            Origin: "http://192.0.2.8:3001",
            Host: "192.0.2.8:3001",
        });
        expect(spa.status).toBe(200);
        expect(spa.body).toContain('id="root"');
        expect(spa.body).not.toContain("Not allowed by CORS");

        const sameOriginApi = await request(port, "POST", "/api/auth/login", {
            Origin: "http://203.0.113.10:3001",
            Host: "203.0.113.10:3001",
            Cookie: "session=credentialed",
        });
        expect(sameOriginApi.status).toBe(200);
        expect(sameOriginApi.body).not.toContain("Not allowed by CORS");
        expect(sameOriginApi.allowOrigin).not.toBe("*");

        const denied = await request(port, "POST", "/api/auth/login", {
            Origin: "https://evil.example",
            Host: "localhost:3001",
            Cookie: "session=credentialed",
            "Content-Type": "application/json",
        });
        expect(denied.status).toBeGreaterThanOrEqual(400);
        expect(denied.body).toContain("Not allowed by CORS");
        expect(denied.allowOrigin).not.toBe("*");

        const allowed = await request(port, "POST", "/api/auth/login", {
            Origin: "http://localhost:3001",
            Host: "127.0.0.1:3001",
            Cookie: "session=credentialed",
        });
        expect(allowed.status).toBe(200);
        expect(allowed.allowOrigin).toBe("http://localhost:3001");
        expect(allowed.allowOrigin).not.toBe("*");
    });

    it("wires the allowlist through server_entry without a credentialed wildcard", async () => {
        const entry = await readFile(path.join(repoRoot, "server_entry.ts"), "utf8");
        const policy = await readFile(path.join(repoRoot, "packages/core/src/server/spaCors.ts"), "utf8");
        expect(entry.indexOf("createApiCorsMiddleware()")).toBeGreaterThan(-1);
        expect(entry.indexOf("createApiCorsMiddleware()")).toBeLessThan(entry.indexOf("app.post('/api/auth/login'"));
        expect(entry).toContain("mountSpa(");
        expect(entry).not.toContain("app.use(cors(");
        expect(policy).toContain('credentials: true');
        expect(policy).toContain("Not allowed by CORS");
        expect(policy).not.toContain("origin: true");
        expect(policy).not.toContain("origin: '*'");
        expect(policy).not.toContain('origin: "*"');
        expect(policy).not.toContain("Access-Control-Allow-Origin', '*'");
    });
});
