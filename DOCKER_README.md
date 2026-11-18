# Docker

The supported container install is the one-line installer and `docker-compose.yml` described in the [README](README.md).

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
```

Postgres and Redis stay on the compose network. Only the app port is published. Bind them to loopback with:

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --bind-local
```

`docker-compose.local-ports.yml` is the same override. Secrets are read from `.env` and are never stored in the image. The installer exits non-zero, and prints `docker compose logs` hints, when `/health` does not return HTTP 200.

An administrator can upgrade from **Settings → Updates**. The button says **Update available → Upgrade now**. Only the `updater` service mounts the Docker socket. The app calls it on the compose network with `UPDATER_SECRET`. The target is a pinned `ghcr.io/sectutor/grcompliance-core` tag and digest from GitHub Releases or GHCR. `GRC_AIRGAP=1` disables the button and the pull. A failed health check starts the previous image again and restores the database if `schema_version` changed.

The manual fallback is:

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --upgrade
```

`install.ps1` is Windows-only. Linux and macOS use `install.sh`. A clone already includes `updater-state/release.env` (a comment, no secrets). Compose loads that path and fails if it is missing. The installer creates an empty file only when it is missing. A button upgrade writes the image pin into it. Operator steps are in [Upgrade](docs/UPGRADE.md). Back up the database and uploaded files first: [Backup and restore](docs/BACKUP-RESTORE.md).
