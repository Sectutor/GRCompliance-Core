# Changelog

Core releases that the in-app updater can install are pinned to a GHCR tag and digest. The floating tag `latest` is not an upgrade target.

## Unreleased

- Administrators can update a self-hosted Core install from **Settings → Updates**. The button reads **Update available → Upgrade now**.
- The Docker socket is mounted on the updater sidecar only. The app reaches it over the compose network with `UPDATER_SECRET`.
- An upgrade checks free disk, backs up Postgres and uploads with SHA-256 checksums, pulls the pinned image, recreates the app, and waits for `/health`. If the new app does not become healthy, the previous image is restored. The database backup is restored when `schema_version` changed.
- `GRC_AIRGAP=1` disables the check and the upgrade.
- Boot records `schema_version` in `schema_meta`. This release uses schema version 1.
- `install.sh --upgrade` remains the manual fallback.

## 1.0.0

- First tagged Core container line. Image: `ghcr.io/sectutor/grcompliance-core`.
