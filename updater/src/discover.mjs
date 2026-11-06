import { readFile } from "node:fs/promises";
import { assertCoreManifest, assertPublicCoreUrl, CORE_GITHUB_REPO, CORE_IMAGE, parseSemver, selectNewerManifest } from "./manifest.mjs";

const USER_AGENT = "GRCompliance-Core-updater";

async function readJson(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Response was not JSON (${res.status})`);
    }
}

export async function fetchPublic(fetchImpl, url, init = {}) {
    let current = String(url);
    for (let hop = 0; hop < 5; hop += 1) {
        assertPublicCoreUrl(current);
        const response = await fetchImpl(current, { ...init, redirect: "manual" });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location) throw new Error("Redirect missing location");
            current = new URL(location, current).href;
            continue;
        }
        return response;
    }
    throw new Error("Too many redirects");
}

export async function fetchGhcrDigest(imageName, tag, fetchImpl) {
    if (imageName !== CORE_IMAGE) {
        throw new Error("Core resolves digests only for ghcr.io/sectutor/grcompliance-core");
    }
    const repo = imageName.replace(/^ghcr\.io\//, "");
    const tokenRes = await fetchPublic(fetchImpl,
        `https://ghcr.io/token?service=ghcr.io&scope=repository:${repo}:pull`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) },
    );
    if (!tokenRes.ok) throw new Error(`GHCR token request failed (${tokenRes.status})`);
    const tokenBody = await readJson(tokenRes);
    const manifestRes = await fetchPublic(fetchImpl, `https://ghcr.io/v2/${repo}/manifests/${tag}`, {
        headers: {
            "User-Agent": USER_AGENT,
            Authorization: `Bearer ${tokenBody.token}`,
            Accept: [
                "application/vnd.oci.image.index.v1+json",
                "application/vnd.docker.distribution.manifest.list.v2+json",
                "application/vnd.docker.distribution.manifest.v2+json",
            ].join(", "),
        },
        signal: AbortSignal.timeout(15000),
    });
    if (!manifestRes.ok) throw new Error(`GHCR manifest failed for ${tag} (${manifestRes.status})`);
    const digest = manifestRes.headers.get("docker-content-digest");
    if (!digest || !digest.startsWith("sha256:")) {
        throw new Error(`GHCR did not return a digest for ${tag}`);
    }
    return digest;
}

function synthesize(release, imageName, digest) {
    const version = parseSemver(release.tag_name || "");
    if (!version || version.pre) return null;
    return {
        edition: "core",
        version: version.raw,
        releasedAt: release.published_at || new Date().toISOString(),
        notes: typeof release.body === "string" ? release.body : "",
        image: { name: imageName, tag: version.raw, digest },
        artifact: null,
        minSchemaVersion: 1,
        changelogUrl: release.html_url || "",
    };
}

async function fromGitHub({ repo, imageName, fetchImpl, allowPrerelease }) {
    if (repo !== CORE_GITHUB_REPO) {
        throw new Error("Core checks GitHub Releases for Sectutor/GRCompliance-Core only");
    }
    const res = await fetchPublic(fetchImpl, `https://api.github.com/repos/${repo}/releases?per_page=20`, {
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub releases request failed (${res.status})`);
    const releases = await readJson(res);
    if (!Array.isArray(releases)) return [];
    const manifests = [];
    for (const release of releases) {
        if (!release || release.draft) continue;
        if (release.prerelease && !allowPrerelease) continue;
        const asset = Array.isArray(release.assets)
            ? release.assets.find((item) => item?.name === "release-manifest.json")
            : null;
        if (asset?.browser_download_url) {
            const assetRes = await fetchPublic(fetchImpl, asset.browser_download_url, {
                headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
                signal: AbortSignal.timeout(15000),
            });
            if (assetRes.ok) {
                manifests.push(await readJson(assetRes));
                continue;
            }
        }
        const version = parseSemver(release.tag_name || "");
        if (!version || (version.pre && !allowPrerelease)) continue;
        try {
            const digest = await fetchGhcrDigest(imageName, version.raw, fetchImpl);
            const built = synthesize(release, imageName, digest);
            if (built) manifests.push(built);
        } catch {
            // This tag is not a pullable pinned image. Try the next release.
        }
    }
    return manifests;
}

async function fromGhcr({ imageName, fetchImpl }) {
    if (imageName !== CORE_IMAGE) return [];
    const repo = imageName.replace(/^ghcr\.io\//, "");
    const tokenRes = await fetchPublic(fetchImpl,
        `https://ghcr.io/token?service=ghcr.io&scope=repository:${repo}:pull`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) },
    );
    if (!tokenRes.ok) throw new Error(`GHCR token request failed (${tokenRes.status})`);
    const tokenBody = await readJson(tokenRes);
    const tagsRes = await fetchPublic(fetchImpl, `https://ghcr.io/v2/${repo}/tags/list?n=1000`, {
        headers: { "User-Agent": USER_AGENT, Authorization: `Bearer ${tokenBody.token}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!tagsRes.ok) throw new Error(`GHCR tag list failed (${tagsRes.status})`);
    const body = await readJson(tagsRes);
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const manifests = [];
    for (const tag of tags) {
        const version = parseSemver(tag);
        if (!version || version.pre || tag === "latest") continue;
        try {
            const digest = await fetchGhcrDigest(imageName, version.raw, fetchImpl);
            manifests.push({
                edition: "core",
                version: version.raw,
                releasedAt: new Date().toISOString(),
                notes: "",
                image: { name: imageName, tag: version.raw, digest },
                artifact: null,
                minSchemaVersion: 1,
                changelogUrl: `https://github.com/Sectutor/GRCompliance-Core/blob/v${version.raw}/CHANGELOG.md`,
            });
        } catch {
            // Skip tags that do not resolve to a digest.
        }
    }
    return manifests;
}

export async function discoverRelease(options) {
    const fetchImpl = options.fetchImpl || fetch;
    const imageName = options.imageName || "ghcr.io/sectutor/grcompliance-core";
    const allowedImages = options.allowedImages || [imageName];
    let rawList = [];
    let message = "No newer Core release";
    if (options.manifestFile) {
        rawList = [JSON.parse(await (options.readFile || readFile)(options.manifestFile, "utf8"))];
    } else if (options.manifestUrl) {
        const res = await fetchPublic(fetchImpl, options.manifestUrl, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`Release manifest URL returned ${res.status}`);
        rawList = [await readJson(res)];
    } else {
        try {
            rawList = await fromGitHub({
                repo: options.repo || "Sectutor/GRCompliance-Core",
                imageName,
                fetchImpl,
                allowPrerelease: options.allowPrerelease === true,
            });
        } catch (error) {
            message = error instanceof Error ? error.message : "GitHub release check failed";
        }
        if (rawList.length === 0) {
            try {
                const ghcr = await fromGhcr({ imageName, fetchImpl });
                rawList = rawList.concat(ghcr);
            } catch (error) {
                message = error instanceof Error ? error.message : message;
            }
        }
    }

    const valid = [];
    for (const raw of rawList) {
        try {
            valid.push(assertCoreManifest(raw, { allowedImages }));
        } catch (error) {
            message = error instanceof Error ? error.message : message;
        }
    }
    const selected = selectNewerManifest(valid, options.currentVersion, options.currentDigest);
    return { manifest: selected, message: selected ? `Update available: ${selected.version}` : message };
}
