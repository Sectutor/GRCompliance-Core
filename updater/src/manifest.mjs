/**
 * Core release manifest. Shared with the Premium contract:
 * edition, semver, pinned image tag and digest, artifact null.
 * The upgrade target is never the floating tag "latest".
 */

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
export const CORE_IMAGE = "ghcr.io/sectutor/grcompliance-core";
export const CORE_GITHUB_REPO = "Sectutor/GRCompliance-Core";
const PREMIUM_IMAGE = "grcompliance-premium";
const PUBLIC_HOSTS = new Set([
    "api.github.com",
    "github.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "ghcr.io",
]);

export function assertCoreImageName(name) {
    const imageName = String(name || "");
    if (!imageName || imageName === PREMIUM_IMAGE || imageName.endsWith(`/${PREMIUM_IMAGE}`) || imageName.includes(PREMIUM_IMAGE)) {
        throw new Error("Core pulls ghcr.io/sectutor/grcompliance-core. It does not load the Premium image.");
    }
}

/** Public GitHub and GHCR only. License-server artifact downloads are refused. */
export function assertPublicCoreUrl(value) {
    let url;
    try {
        url = new URL(String(value));
    } catch {
        throw new Error("Core update URL is not absolute");
    }
    if (url.protocol !== "https:") throw new Error("Core update URLs must be https");
    if (!PUBLIC_HOSTS.has(url.hostname.toLowerCase())) {
        throw new Error("Core updates only contact public GitHub and GHCR");
    }
    if (/\/artifact(\/|$)/i.test(url.pathname) || url.pathname.includes(PREMIUM_IMAGE)) {
        throw new Error("Core does not use Premium artifact downloads");
    }
}

export function parseSemver(input) {
    if (typeof input !== "string") return null;
    const match = SEMVER.exec(input.trim());
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        pre: match[4] || null,
        raw: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}`,
    };
}

export function compareSemver(left, right) {
    const a = typeof left === "string" ? parseSemver(left) : left;
    const b = typeof right === "string" ? parseSemver(right) : right;
    if (!a || !b) return null;
    for (const key of ["major", "minor", "patch"]) {
        if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
    }
    if (a.pre === b.pre) return 0;
    if (a.pre && !b.pre) return -1;
    if (!a.pre && b.pre) return 1;
    return a.pre < b.pre ? -1 : 1;
}

export function isNewerVersion(current, next) {
    const target = parseSemver(next);
    if (!target || target.pre) return false;
    const installed = parseSemver(current);
    if (!installed) return true;
    const order = compareSemver(installed, target);
    return order !== null && order < 0;
}

export function pinnedImageRef(image) {
    if (!image || typeof image.name !== "string" || typeof image.tag !== "string") {
        throw new Error("Release image name and tag are required");
    }
    if (image.tag === "latest" || !TAG.test(image.tag)) {
        throw new Error("Upgrade target must be a pinned tag, not latest");
    }
    if (!DIGEST.test(image.digest || "")) {
        throw new Error("Upgrade target must include a sha256 digest");
    }
    return `${image.name}:${image.tag}@${image.digest}`;
}

export function assertCoreManifest(manifest, options = {}) {
    if (!manifest || typeof manifest !== "object") {
        throw new Error("Release manifest must be an object");
    }
    if (manifest.edition !== "core") {
        throw new Error("This updater only accepts edition core");
    }
    const version = parseSemver(manifest.version);
    if (!version || version.pre) {
        throw new Error("Release version must be a stable semver");
    }
    if (typeof manifest.releasedAt !== "string" || Number.isNaN(Date.parse(manifest.releasedAt))) {
        throw new Error("releasedAt must be ISO-8601");
    }
    if (manifest.artifact !== null) {
        throw new Error("Core releases set artifact to null");
    }
    const minSchema = manifest.minSchemaVersion;
    if (!Number.isInteger(minSchema) || minSchema < 1 || minSchema > 1000) {
        throw new Error("minSchemaVersion must be an integer from 1 to 1000");
    }
    if (manifest.notes != null && typeof manifest.notes !== "string") {
        throw new Error("notes must be a string");
    }
    if (manifest.changelogUrl != null && manifest.changelogUrl !== "") {
        if (typeof manifest.changelogUrl !== "string" || !/^https?:\/\//.test(manifest.changelogUrl)) {
            throw new Error("changelogUrl must be an http(s) URL");
        }
    }
    assertCoreImageName(manifest.image?.name);
    const allowed = options.allowedImages || [CORE_IMAGE];
    if (!allowed.includes(manifest.image?.name)) {
        throw new Error("Release image is not on the allowlist");
    }
    if (manifest.changelogUrl) assertPublicCoreUrl(manifest.changelogUrl);
    pinnedImageRef(manifest.image);
    return {
        edition: "core",
        version: version.raw,
        releasedAt: new Date(manifest.releasedAt).toISOString(),
        notes: manifest.notes || "",
        image: {
            name: manifest.image.name,
            tag: manifest.image.tag,
            digest: manifest.image.digest,
        },
        artifact: null,
        minSchemaVersion: minSchema,
        changelogUrl: manifest.changelogUrl || "",
    };
}

/**
 * A database with no schema_meta row is version 0. The first Core release
 * (minSchemaVersion 1) may still install. Anything higher must be reached
 * through intermediate releases.
 */
export function schemaAllowsUpgrade(currentSchema, minSchemaVersion) {
    const current = Number(currentSchema) || 0;
    if (current === 0) return minSchemaVersion <= 1;
    return current >= minSchemaVersion;
}

export function selectNewerManifest(manifests, currentVersion, currentDigest) {
    const newer = manifests
        .filter((manifest) => isNewerVersion(currentVersion, manifest.version))
        .filter((manifest) => !currentDigest || manifest.image.digest !== currentDigest)
        .sort((a, b) => compareSemver(a.version, b.version) ?? 0);
    return newer.at(-1) || null;
}
