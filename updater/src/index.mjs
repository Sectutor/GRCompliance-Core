import os from "node:os";
import path from "node:path";
import { chmod, chown, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { discoverRelease } from "./discover.mjs";
import { assertCoreImageName } from "./manifest.mjs";
import { upsertEnvKeys } from "./envfile.mjs";
import { redact } from "./redact.mjs";
import { createUpdaterServer, initialStatus } from "./server.mjs";
import {
    directorySize,
    freeBytes,
    parseDatabaseUrl,
    pgpassLine,
    requiredFreeBytes,
    runCommand,
} from "./docker.mjs";
import { archiveUploads, createBackupDir, extractUploads, verifyChecksumFile, writeChecksums } from "./backup.mjs";

const composeDir = process.env.COMPOSE_DIR || "/compose";
const stackEnv = process.env.STACK_ENV_FILE || path.join(composeDir, ".env");
const releaseEnv = process.env.RELEASE_ENV_FILE || path.join(composeDir, "updater-state", "release.env");
const uploadsDir = process.env.UPLOADS_DIR || "/uploads";
const backupRoot = process.env.BACKUP_DIR || "/backups";
const appService = process.env.APP_SERVICE || "app";
const dbService = process.env.DB_SERVICE || "db";

function airgap() {
    return ["1", "true", "yes"].includes(String(process.env.GRC_AIRGAP || "").toLowerCase());
}

function allowedImages() {
    return (process.env.GRC_ALLOWED_IMAGES || "ghcr.io/sectutor/grcompliance-core")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

const state = {
    current: initialStatus(process.env),
    get() {
        return structuredClone(this.current);
    },
    update(patch) {
        this.current = { ...this.current, ...patch, edition: "core", airgap: airgap() };
        const message = this.current.message ? redact(this.current.message) : "";
        console.log(`[updater] ${this.current.state} ${message}`.trim());
        return this.get();
    },
};

let projectName = process.env.COMPOSE_PROJECT_NAME || "";
let previousImage = null;

async function docker(args) {
    return runCommand("docker", args, {
        env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME || "/root",
        },
    });
}

async function ensureProject() {
    if (projectName) return projectName;
    const { stdout } = await docker(["inspect", os.hostname()]);
    const info = JSON.parse(stdout)[0];
    projectName = info?.Config?.Labels?.["com.docker.compose.project"] || "";
    if (!projectName) throw new Error("COMPOSE_PROJECT_NAME is unset and this container is not in a compose project");
    return projectName;
}

async function compose(args) {
    await ensureProject();
    await mkdir(path.dirname(releaseEnv), { recursive: true });
    try {
        await readFile(releaseEnv);
    } catch {
        await writeFile(releaseEnv, "", { mode: 0o600 });
    }
    return docker([
        "compose",
        "--project-name", projectName,
        "--project-directory", composeDir,
        "--env-file", stackEnv,
        "--env-file", releaseEnv,
        ...args,
    ]);
}

async function serviceContainer(service) {
    await ensureProject();
    const { stdout } = await docker([
        "ps", "-q",
        "--filter", `label=com.docker.compose.project=${projectName}`,
        "--filter", `label=com.docker.compose.service=${service}`,
        "--filter", "status=running",
    ]);
    const id = stdout.trim().split(/\s+/).filter(Boolean)[0];
    if (!id) throw new Error(`No running ${service} container`);
    return id;
}

async function withPgpass(container, fn) {
    const db = parseDatabaseUrl(process.env.DATABASE_URL || "");
    const local = path.join(os.tmpdir(), `.grc-pgpass-${process.pid}`);
    await writeFile(local, pgpassLine(db), { mode: 0o600 });
    try {
        await docker(["cp", local, `${container}:/tmp/.grc_pgpass`]);
        await docker(["exec", container, "chmod", "600", "/tmp/.grc_pgpass"]);
        return await fn(db);
    } finally {
        await rm(local, { force: true });
    }
}

async function readSchemaVersion() {
    try {
        const container = await serviceContainer(dbService);
        const output = await withPgpass(container, (db) => docker([
            "exec", "-e", "PGPASSFILE=/tmp/.grc_pgpass", container,
            "psql", "-h", "127.0.0.1", "-p", db.port, "-U", db.user, "-d", db.database,
            "-tAc", "SELECT schema_version FROM schema_meta WHERE id = 1",
        ]));
        await docker(["exec", container, "rm", "-f", "/tmp/.grc_pgpass"]);
        const value = Number(output.stdout.trim());
        return Number.isInteger(value) ? value : 0;
    } catch {
        return 0;
    }
}

async function diskFreeBytes() {
    const targets = [backupRoot, composeDir];
    const values = [];
    for (const target of targets) {
        try {
            values.push(await freeBytes(target));
        } catch {
            // A missing path does not count as free space.
        }
    }
    if (values.length === 0) throw new Error("Could not check free disk");
    return Math.min(...values);
}

async function writeRelease(image, version) {
    const entries = {
        GRC_VERSION: version,
        GRC_IMAGE: image.ref,
        GRC_IMAGE_DIGEST: image.digest,
    };
    await mkdir(path.dirname(releaseEnv), { recursive: true });
    await writeFile(releaseEnv, upsertEnvKeys("", entries), { mode: 0o600 });
    await chmod(releaseEnv, 0o600);
    try {
        const info = await stat(stackEnv);
        const mode = info.mode & 0o777;
        const current = await readFile(stackEnv, "utf8");
        const next = upsertEnvKeys(current, entries);
        const tmp = `${stackEnv}.tmp`;
        await writeFile(tmp, next, { mode });
        await chown(tmp, info.uid, info.gid).catch(() => undefined);
        await rename(tmp, stackEnv);
        await chmod(stackEnv, mode);
        await chown(stackEnv, info.uid, info.gid).catch(() => undefined);
        await chown(releaseEnv, info.uid, info.gid).catch(() => undefined);
    } catch (error) {
        console.error(`[updater] Stack env was not updated: ${redact(error instanceof Error ? error.message : "")}`);
    }
}

async function pullPinned(manifest) {
    assertCoreImageName(manifest.image.name);
    const digest = manifest.image.digest;
    const named = `${manifest.image.name}:${manifest.image.tag}`;
    let info = null;
    try {
        const inspected = await docker(["image", "inspect", named]);
        info = JSON.parse(inspected.stdout)[0];
    } catch {
        info = null;
    }
    const digests = info?.RepoDigests || [];
    const matches = info && (info.Id === digest || digests.includes(`${manifest.image.name}@${digest}`));
    if (!matches) {
        // Public GHCR pull of a pinned tag and digest. Never docker load, and never a Premium artifact.
        await docker(["pull", `${named}@${digest}`]);
        const pulled = await docker(["image", "inspect", `${manifest.image.name}@${digest}`]);
        info = JSON.parse(pulled.stdout)[0];
    }
    const confirmed = info.Id === digest || (info.RepoDigests || []).includes(`${manifest.image.name}@${digest}`);
    if (!confirmed) throw new Error("Image digest does not match the release manifest");
    if ((info.RepoDigests || []).includes(`${manifest.image.name}@${digest}`)) {
        return { ref: `${manifest.image.name}@${digest}`, digest, version: manifest.version };
    }
    const pin = `grc-pin:${digest.slice("sha256:".length, "sha256:".length + 12)}`;
    await docker(["tag", info.Id, pin]);
    return { ref: pin, digest: info.Id, version: manifest.version };
}

async function pinPrevious() {
    const container = await serviceContainer(appService);
    const inspected = await docker(["inspect", container]);
    const info = JSON.parse(inspected.stdout)[0];
    const digest = info.Image;
    const ref = `grc-rollback:${digest.slice("sha256:".length, "sha256:".length + 12)}`;
    await docker(["tag", digest, ref]);
    previousImage = { ref, digest, version: state.get().currentVersion || "previous" };
    return previousImage;
}

async function recreate(image) {
    await writeRelease(image, image.version);
    await compose(["up", "-d", "--no-deps", "--no-build", "--force-recreate", "--pull", "never", appService]);
}

async function waitHealthy() {
    const timeoutMs = Number(process.env.HEALTH_TIMEOUT_SECONDS || 180) * 1000;
    const url = process.env.APP_HEALTH_URL || "http://app:3001/health";
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const body = await res.json().catch(() => ({}));
            if (res.ok) return { ok: true, body };
            last = body;
            if (body?.fatal === true) return { ok: false, body };
        } catch (error) {
            last = { error: error instanceof Error ? error.message : "health failed" };
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return { ok: false, body: last };
}

async function backup(runId) {
    const dir = await createBackupDir(backupRoot, runId);
    const container = await serviceContainer(dbService);
    await withPgpass(container, (db) => docker([
        "exec", "-e", "PGPASSFILE=/tmp/.grc_pgpass", container,
        "pg_dump", "-h", "127.0.0.1", "-p", db.port, "-U", db.user, "-d", db.database,
        "-Fc", "--no-owner", "-f", "/tmp/grc.dump",
    ]));
    await docker(["cp", `${container}:/tmp/grc.dump`, path.join(dir, "db.dump")]);
    await docker(["exec", container, "rm", "-f", "/tmp/grc.dump", "/tmp/.grc_pgpass"]);
    await archiveUploads(uploadsDir, path.join(dir, "uploads.tgz"));
    const schemaVersion = await readSchemaVersion();
    await writeFile(path.join(dir, "meta.json"), `${JSON.stringify({
        runId,
        schemaVersion,
        createdAt: new Date().toISOString(),
    }, null, 2)}\n`, { mode: 0o600 });
    await writeChecksums(dir, ["db.dump", "uploads.tgz"]);
    state.update({ backupDir: dir, schemaVersion });
    return { dir };
}

async function restore(item) {
    await verifyChecksumFile(item.dir);
    await compose(["stop", appService]);
    const container = await serviceContainer(dbService);
    await docker(["cp", path.join(item.dir, "db.dump"), `${container}:/tmp/grc.dump`]);
    await withPgpass(container, (db) => docker([
        "exec", "-e", "PGPASSFILE=/tmp/.grc_pgpass", container,
        "pg_restore", "-h", "127.0.0.1", "-p", db.port, "-U", db.user, "-d", db.database,
        "--clean", "--if-exists", "--no-owner", "--exit-on-error", "/tmp/grc.dump",
    ]));
    await docker(["exec", container, "rm", "-f", "/tmp/grc.dump", "/tmp/.grc_pgpass"]);
    await extractUploads(path.join(item.dir, "uploads.tgz"), uploadsDir);
}

function upgradeContext(manifest, runId) {
    if (typeof runId !== "string" || runId.length === 0) {
        throw new Error("Upgrade run id is missing");
    }
    return {
        manifest,
        runId,
        allowedImages: allowedImages(),
        get previousImage() {
            return previousImage;
        },
        report(patch) {
            state.update(patch);
        },
        snapshot() {
            return state.get();
        },
        readSchemaVersion,
        diskFreeBytes,
        async requiredBytes() {
            return requiredFreeBytes(await directorySize(uploadsDir), process.env.GRC_MIN_FREE_BYTES);
        },
        backup() {
            return backup(runId);
        },
        verifyChecksums(item) {
            return verifyChecksumFile(item.dir);
        },
        pullPinned() {
            return pullPinned(manifest);
        },
        pinPrevious,
        recreate,
        waitHealthy,
        restore,
        async commitRelease(image, version) {
            await writeRelease(image, version);
            state.update({ currentVersion: version });
        },
    };
}

async function discover() {
    const file = process.env.GRC_RELEASE_MANIFEST_FILE || "";
    const url = process.env.GRC_RELEASE_MANIFEST_URL || "";
    return discoverRelease({
        manifestFile: file || undefined,
        manifestUrl: !file && url ? url : undefined,
        currentVersion: state.get().currentVersion,
        currentDigest: process.env.GRC_IMAGE_DIGEST || state.get().currentDigest || "",
        allowedImages: allowedImages(),
        imageName: allowedImages()[0],
        repo: process.env.GRC_GITHUB_REPO || "Sectutor/GRCompliance-Core",
        allowPrerelease: process.env.GRC_ALLOW_PRERELEASE === "1",
    });
}

const server = createUpdaterServer({
    state,
    secret: () => process.env.UPDATER_SECRET || "",
    airgap,
    discover,
    upgradeContext,
});

if (!process.env.UPDATER_SECRET) {
    console.error("[updater] UPDATER_SECRET is required");
    process.exit(1);
}

const port = Number(process.env.UPDATER_PORT || 9090);
server.listen(port, "0.0.0.0", () => {
    console.log(`[updater] Core updater listening on ${port}`);
});
