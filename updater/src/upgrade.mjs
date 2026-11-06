import { assertCoreManifest, schemaAllowsUpgrade } from "./manifest.mjs";

const ACTIVE = new Set([
    "disk_check",
    "backing_up",
    "pulling",
    "recreating",
    "waiting_healthy",
    "rolling_back",
    "restoring_database",
]);

export function isActiveState(state) {
    return ACTIVE.has(state);
}

function failure(message, extra = {}) {
    const error = new Error(message);
    Object.assign(error, extra);
    return error;
}

/**
 * Linear upgrade. A failure before the app container is replaced leaves the
 * running version in place. After replacement, an unhealthy app rolls back
 * to the pinned previous image. The database backup is restored only when
 * schema_version changed.
 */
export async function executeUpgrade(ctx) {
    const manifest = assertCoreManifest(ctx.manifest, { allowedImages: ctx.allowedImages });
    const report = (patch) => ctx.report(patch);
    let recreated = false;
    let backup = null;
    let before = 0;
    let pinned = null;

    try {
        before = await ctx.readSchemaVersion();
        if (!schemaAllowsUpgrade(before, manifest.minSchemaVersion)) {
            throw failure(`Schema ${before} is older than minSchemaVersion ${manifest.minSchemaVersion}`);
        }
        report({
            state: "disk_check",
            progress: 10,
            step: "disk_check",
            message: "Checking free disk",
            error: null,
            rolledBack: false,
        });
        const free = await ctx.diskFreeBytes();
        const need = await ctx.requiredBytes();
        if (free < need) {
            throw failure(`Not enough free disk (${free} bytes free, ${need} required)`);
        }

        report({ state: "backing_up", progress: 30, step: "backing_up", message: "Backing up database and uploads" });
        backup = await ctx.backup();
        await ctx.verifyChecksums(backup);

        report({
            state: "pulling",
            progress: 55,
            step: "pulling",
            message: `Pulling ${manifest.image.name}:${manifest.image.tag}`,
        });
        pinned = await ctx.pullPinned(manifest);
        await ctx.pinPrevious();

        report({ state: "recreating", progress: 75, step: "recreating", message: "Recreating the app container" });
        recreated = true;
        await ctx.recreate(pinned);

        report({ state: "waiting_healthy", progress: 90, step: "waiting_healthy", message: "Waiting for /health" });
        const health = await ctx.waitHealthy();
        let after = before;
        let schemaKnown = true;
        try {
            after = await ctx.readSchemaVersion();
        } catch {
            schemaKnown = false;
        }
        const versionMismatch = health.body?.version && health.body.version !== manifest.version;
        const wrongEdition = health.body?.edition && health.body.edition !== "core";
        if (!health.ok || versionMismatch || wrongEdition) {
            throw failure(
                versionMismatch
                    ? `Health version ${health.body.version} did not match ${manifest.version}`
                    : wrongEdition
                        ? "Health edition was not core"
                        : "App did not become healthy",
                { migrated: !schemaKnown || after !== before, after },
            );
        }

        await ctx.commitRelease(pinned, manifest.version);
        report({
            state: "succeeded",
            progress: 100,
            step: "succeeded",
            message: `Running ${manifest.version}`,
            error: null,
            rolledBack: false,
            available: null,
            currentVersion: manifest.version,
        });
        return ctx.snapshot();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Upgrade failed";
        if (!recreated) {
            report({
                state: "failed",
                progress: 100,
                step: "failed",
                message,
                error: message,
                rolledBack: false,
            });
            return ctx.snapshot();
        }

        report({
            state: "rolling_back",
            progress: 95,
            step: "rolling_back",
            message: "Restoring the previous app image",
            error: message,
        });
        try {
            if (error.migrated) {
                report({
                    state: "restoring_database",
                    step: "restoring_database",
                    message: "Schema changed. Restoring the database and uploads backup",
                });
                await ctx.restore(backup);
            }
            await ctx.recreate(ctx.previousImage);
            const restored = await ctx.waitHealthy();
            if (!restored.ok) {
                throw failure("Rollback image did not become healthy");
            }
            await ctx.commitRelease(ctx.previousImage, ctx.previousImage.version);
            report({
                state: "failed",
                progress: 100,
                step: "failed",
                message: `Rolled back to ${ctx.previousImage.version}`,
                error: message,
                rolledBack: true,
                currentVersion: ctx.previousImage.version,
            });
        } catch (rollbackError) {
            const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : "Rollback failed";
            report({
                state: "failed",
                progress: 100,
                step: "failed",
                message: `Rollback failed. Backup: ${backup?.dir || "unknown"}`,
                error: `${message}. ${rollbackMessage}`,
                rolledBack: false,
                backupDir: backup?.dir || null,
            });
        }
        return ctx.snapshot();
    }
}
