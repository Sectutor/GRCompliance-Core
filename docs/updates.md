# Core self-hosted updates

Community installs update from the admin UI the same way a Premium install does. The app never receives the Docker socket.

## Release manifest

Core reads GitHub Releases for `Sectutor/GRCompliance-Core` and, if that list has no usable manifest, the public GHCR tag list. A release asset named `release-manifest.json` wins. Otherwise the updater builds the same object from the git tag and the GHCR digest.

```json
{
  "edition": "core",
  "version": "1.2.3",
  "releasedAt": "2026-11-06T00:00:00.000Z",
  "notes": "What changed",
  "image": {
    "name": "ghcr.io/sectutor/grcompliance-core",
    "tag": "1.2.3",
    "digest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  },
  "artifact": null,
  "minSchemaVersion": 1,
  "changelogUrl": "https://github.com/Sectutor/GRCompliance-Core/blob/v1.2.3/CHANGELOG.md"
}
```

Rules:

- `edition` must be `core`. A Premium manifest is rejected.
- `version` is a stable semver. The tag `latest` is never the upgrade target.
- `image.digest` is `sha256:` plus 64 hex characters. The sidecar pulls `name:tag@digest`, or uses a local image only when its id or repo digest matches.
- `artifact` is `null`. Core does not apply a separate binary.
- `minSchemaVersion` is the oldest `schema_meta.schema_version` that may move to this release. A database that has no `schema_meta` row is version 0 and may install a release whose minimum is 1.
- The image name must be `ghcr.io/sectutor/grcompliance-core` unless `GRC_ALLOWED_IMAGES` adds a local proof name. `grcompliance-premium` is refused even if it is added to that list.
- Discovery talks only to `api.github.com`, `github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, and `ghcr.io`. The only GitHub Release asset it downloads is `release-manifest.json`. It does not call the licence server, and it does not download Premium artifact URLs. The sidecar runs `docker pull` of the pinned Core reference. It does not run `docker load`.

Tag pushes write this file with `scripts/write-release-manifest.mjs` and attach it to the GitHub Release. That job does not run until a `v*` tag is pushed on `main`.

## Sidecar

`docker-compose.yml` service `updater` is the only service with `/var/run/docker.sock`. It listens on port 9090 inside the compose network and publishes no host port. The app calls `http://updater:9090` with `Authorization: Bearer $UPDATER_SECRET`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness. No secret. |
| GET | `/v1/status` | State, progress, current version, available manifest. |
| POST | `/v1/check` | Resolve the next pinned release. |
| POST | `/v1/upgrade` | Accept the last checked manifest and return 202. |

The upgrade sequence is fixed:

1. Refuse when `GRC_AIRGAP` is `1`, `true`, or `yes`.
2. Refuse when the installed schema is older than `minSchemaVersion`.
3. Require free space on the backup volume and the install directory.
4. `pg_dump -Fc` inside the database container, archive `/uploads`, write SHA-256 checksums.
5. Pull the pinned image, or accept a local image whose id matches the digest.
6. Tag the running app image as `grc-rollback:<id>` so rollback does not follow a moved tag.
7. Write `updater-state/release.env` and recreate only the `app` service (`--no-deps --pull never`).
8. Wait for `http://app:3001/health`.
9. On failure, start the rollback tag. Restore the dump and the uploads archive only when `schema_version` changed.
10. Record the terminal state. The app writes an audit row for the administrator who started it, and another when the new process first sees success, failure, or rollback.

`install.sh --upgrade` still pulls or rebuilds and does not delete volumes. If an existing `.env` has no `UPDATER_SECRET`, the installer appends one and leaves every other value as it was.

## App

`GET` and `POST` `/api/updates/status|check|upgrade` require a platform administrator (`admin`, `owner`, `super_admin`, `super`, `enterprise_admin`, `ent_admin`). Everyone else receives 403. The Settings page is **Settings → Updates**. When a release is available the button label is **Update available → Upgrade now**.

Boot runs `ensureUpdateMetadata` in `docker/bootstrap.ts`. It stores `schema_version` (this release: 1) and the running `GRC_VERSION` in `schema_meta`. The value never decreases on boot. A rollback that changed the schema restores the dump instead of writing a lower version over a newer one.

This path does not read the Community workspace cap, `maxClients`, or `registerPremiumEntitlement`. A successful update leaves the instance on Community.

## Air gap

Set `GRC_AIRGAP=1` in `.env` and recreate the stack. The button stays disabled. The sidecar returns 403 for check and upgrade. The manual installer can still be used with images you have already loaded.

## Proof

GHCR is not used for the disposable run. A public registry may only have one Core tag, so N and N+1 cannot both be pulled. `scripts/test/upgrade-sidecar-e2e.sh` builds local tags `grc-proof:1.0.0`, `grc-proof:1.1.0`, and a failing `grc-proof:1.2.0`, then runs the real sidecar against Postgres. The page in those screenshots is the disposable admin surface. It uses the same button label and the same sidecar API. The product page is `packages/core/src/pages/settings/UpdateSettings.tsx`.

| Check | Result |
|---|---|
| App container has no Docker socket; updater has the socket | Pass |
| 1.0.0 to 1.1.0 keeps the marker row, the uploads file, and moves schema 1 to 2 | Pass |
| 1.2.0 health failure rolls back to 1.1.0, restores schema 2, and keeps the marker | Pass |
| Premium image `grcompliance-premium` and licence-server artifact URLs are rejected | Pass (unit) |
| Air-gap and non-admin calls do not start an upgrade | Pass (unit) |
| `install.sh --upgrade` remains the manual fallback | Pass (unit) |
| Two published GHCR tags exercised end to end | Gap. Local tags stand in until a second release is published |
| Merge, deploy, or publish the updater image | Not done. Needs Emmanuel |

Publishing `ghcr.io/sectutor/grcompliance-updater:1` and attaching `release-manifest.json` to a GitHub Release still needs a merge and a `v*` tag. This change does not merge and does not deploy. Core does not call the Premium licence server.
