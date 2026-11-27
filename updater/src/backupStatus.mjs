import path from "node:path";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { verifyChecksumFile } from "./backup.mjs";

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export function assertSafeBackupId(id) {
    if (typeof id !== "string" || !SAFE_ID.test(id) || id === "." || id === "..") {
        throw new Error("Unsafe backup id");
    }
}

function insideRoot(root, id) {
    assertSafeBackupId(id);
    const base = path.resolve(root);
    const dir = path.resolve(base, id);
    if (dir !== base && !dir.startsWith(`${base}${path.sep}`)) throw new Error("Unsafe backup id");
    return dir;
}

async function directoryBytes(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) total += await directoryBytes(full);
        else if (entry.isFile()) total += (await stat(full)).size;
    }
    return total;
}

export async function listBackups(root) {
    let names = [];
    try {
        names = await readdir(root);
    } catch {
        return [];
    }
    const backups = [];
    for (const name of names) {
        if (!SAFE_ID.test(name)) continue;
        const dir = path.join(root, name);
        let info;
        try {
            info = await stat(dir);
        } catch {
            continue;
        }
        if (!info.isDirectory()) continue;
        let checksum = "unknown";
        try {
            await verifyChecksumFile(dir);
            checksum = "ok";
        } catch (error) {
            if (String(error?.message || "").includes("ENOENT") || String(error?.code) === "ENOENT") checksum = "unknown";
            else if (String(error?.message || "").includes("no such file")) checksum = "unknown";
            else checksum = "mismatch";
        }
        let restoreTest = null;
        try {
            restoreTest = JSON.parse(await readFile(path.join(dir, "restore-test.json"), "utf8"));
        } catch {
            restoreTest = null;
        }
        backups.push({
            id: name,
            bytes: await directoryBytes(dir),
            modifiedAt: info.mtime.toISOString(),
            checksum,
            location: dir,
            restoreTest: restoreTest && typeof restoreTest.at === "string"
                ? { at: restoreTest.at, passed: restoreTest.passed === true }
                : null,
        });
    }
    return backups;
}

/**
 * Checks a backup by restoring it into a throwaway database container.
 * The runner is injected so tests never start Docker. The live database URL
 * is not accepted here.
 */
export async function verifyBackupCopy({ root, id, freeBytes, docker, now = new Date() }) {
    const dir = insideRoot(root, id);
    const names = await readdir(dir);
    const dump = names.find((name) => name.endsWith(".sql") || name.endsWith(".dump"));
    if (!dump) {
        return { ok: false, message: "That backup has no database file to check. The live database was not changed." };
    }
    const dumpStat = await stat(path.join(dir, dump));
    if (typeof freeBytes === "number" && freeBytes < dumpStat.size + 512 * 1024 * 1024) {
        return { ok: false, message: "There is not enough free disk to test a restore. The live database was not changed." };
    }
    const container = `grc-restore-check-${id}`.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60);
    try {
        await docker([
            "run", "-d", "--name", container, "--network", "none",
            "-e", "POSTGRES_PASSWORD=restore-check",
            "docker.io/pgvector/pgvector:pg16",
        ]);
        await docker(["cp", path.join(dir, dump), `${container}:/tmp/restore.sql`]);
        await docker(["exec", container, "psql", "-U", "postgres", "-f", "/tmp/restore.sql"]);
        await docker(["exec", container, "psql", "-U", "postgres", "-c", "SELECT count(*) FROM information_schema.tables"]);
        const result = { at: now.toISOString(), passed: true };
        await writeFile(path.join(dir, "restore-test.json"), `${JSON.stringify(result)}\n`, { mode: 0o600 });
        return { ok: true, message: "Restore checked in a temporary database. The live database was not changed.", restoreTest: result };
    } catch {
        const result = { at: now.toISOString(), passed: false };
        await writeFile(path.join(dir, "restore-test.json"), `${JSON.stringify(result)}\n`, { mode: 0o600 }).catch(() => undefined);
        return { ok: false, message: "We could not check this backup. The live database was not changed.", restoreTest: result };
    } finally {
        await docker(["rm", "-f", container]).catch(() => undefined);
    }
}
