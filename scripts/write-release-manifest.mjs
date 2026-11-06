import { pathToFileURL } from "node:url";
import { assertCoreManifest } from "../updater/src/manifest.mjs";

export function buildReleaseManifest(input) {
    const version = String(input.version || "").trim().replace(/^v/, "");
    return assertCoreManifest({
        edition: "core",
        version,
        releasedAt: input.releasedAt || new Date().toISOString(),
        notes: input.notes || `GRCompliance Core ${version}`,
        image: {
            name: "ghcr.io/sectutor/grcompliance-core",
            tag: version,
            digest: input.digest,
        },
        artifact: null,
        minSchemaVersion: 1,
        changelogUrl: `https://github.com/Sectutor/GRCompliance-Core/blob/v${version}/CHANGELOG.md`,
    });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const manifest = buildReleaseManifest({
        version: process.env.GRC_VERSION,
        digest: process.env.GRC_IMAGE_DIGEST,
        notes: process.env.GRC_NOTES,
        releasedAt: process.env.GRC_RELEASED_AT,
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
