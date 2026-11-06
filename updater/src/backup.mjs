import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./docker.mjs";

export async function sha256File(file) {
    const hash = createHash("sha256");
    await new Promise((resolve, reject) => {
        const stream = createReadStream(file);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", resolve);
    });
    return hash.digest("hex");
}

export async function writeChecksums(dir, files) {
    const lines = [];
    for (const name of files) {
        lines.push(`${await sha256File(path.join(dir, name))}  ${name}`);
    }
    const body = `${lines.join("\n")}\n`;
    await writeFile(path.join(dir, "SHA256SUMS"), body, { mode: 0o600 });
    return body;
}

export async function verifyChecksumFile(dir) {
    const { readFile } = await import("node:fs/promises");
    const body = await readFile(path.join(dir, "SHA256SUMS"), "utf8");
    const lines = body.split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error("Backup checksum file is empty");
    for (const line of lines) {
        const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
        if (!match) throw new Error("Backup checksum line is invalid");
        const actual = await sha256File(path.join(dir, match[2]));
        if (actual !== match[1]) throw new Error(`Checksum mismatch for ${match[2]}`);
    }
}

export async function createBackupDir(root, runId) {
    if (typeof runId !== "string" || !/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error("Unsafe backup id");
    const dir = path.join(root, runId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return dir;
}

export async function clearDirectory(dir) {
    const entries = await readdir(dir);
    await Promise.all(entries.map((name) => rm(path.join(dir, name), { recursive: true, force: true })));
}

export async function archiveUploads(uploadsDir, archivePath) {
    await runCommand("tar", ["-czf", archivePath, "-C", uploadsDir, "."]);
}

export async function extractUploads(archivePath, uploadsDir) {
    await clearDirectory(uploadsDir);
    await runCommand("tar", ["-xzf", archivePath, "-C", uploadsDir]);
}
