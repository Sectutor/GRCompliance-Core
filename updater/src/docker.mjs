import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { statfs } from "node:fs/promises";
import path from "node:path";
import { redact } from "./redact.mjs";

export function runCommand(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            env: options.env || process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout = [];
        const stderr = [];
        child.stdout.on("data", (chunk) => stdout.push(chunk));
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        child.on("error", reject);
        child.on("close", (code) => {
            const out = Buffer.concat(stdout).toString("utf8");
            const err = Buffer.concat(stderr).toString("utf8");
            if (code === 0) resolve({ stdout: out, stderr: err });
            else reject(new Error(redact(err || out || `${cmd} exited ${code}`)));
        });
    });
}

export function spawnToFile(cmd, args, file, stdin) {
    return new Promise((resolve, reject) => {
        const out = createWriteStream(file);
        const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
        const stderr = [];
        if (stdin) child.stdin.end(stdin);
        else child.stdin.end();
        child.stdout.pipe(out);
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        child.on("error", (error) => {
            out.destroy();
            reject(error);
        });
        out.on("error", reject);
        child.on("close", (code) => {
            out.close();
            if (code === 0) resolve();
            else reject(new Error(redact(Buffer.concat(stderr).toString("utf8") || `${cmd} exited ${code}`)));
        });
    });
}

export async function freeBytes(target) {
    const stats = await statfs(target);
    return Number(stats.bavail) * Number(stats.bsize);
}

export function requiredFreeBytes(uploadsBytes, minFreeBytes) {
    const floor = Number(minFreeBytes) || (2 * 1024 * 1024 * 1024);
    const estimate = Number(uploadsBytes) * 2 + (64 * 1024 * 1024);
    return Math.max(floor, estimate);
}

export async function directorySize(dir) {
    const { readdir, stat } = await import("node:fs/promises");
    let total = 0;
    let entries = [];
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return 0;
    }
    for (const entry of entries) {
        const child = path.join(dir, entry.name);
        if (entry.isDirectory()) total += await directorySize(child);
        else if (entry.isFile()) total += (await stat(child)).size;
    }
    return total;
}

export function parseDatabaseUrl(databaseUrl) {
    const url = new URL(databaseUrl);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!database || !url.username) throw new Error("DATABASE_URL is missing a database or user");
    return {
        host: url.hostname,
        port: url.port || "5432",
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database,
    };
}

export function pgpassLine(db) {
    const escape = (value) => String(value).replace(/\\/g, "\\\\").replace(/:/g, "\\:");
    return `127.0.0.1:${db.port}:${escape(db.database)}:${escape(db.user)}:${escape(db.password)}\n`;
}
