# Upgrade GRCompliance Core

This is the operator path for a self-hosted Compose install of this repository. Service names, volume names, and commands come from `docker-compose.yml`, `install.sh`, `install.ps1`, `docker/bootstrap.ts`, and `updater/src`.

The Compose project name is `grcompliance`. Services are `db`, `redis`, `app`, and `updater`. Volumes are `grc_postgres`, `grc_redis`, `grc_uploads`, and `grc_backups` (on the host, `grcompliance_grc_postgres`, `grcompliance_grc_redis`, `grcompliance_grc_uploads`, and `grcompliance_grc_backups`).

Two ways move an existing install to a newer Core image:

- **Settings → Updates** backs up first, pulls a pinned image, recreates only `app`, and can roll that attempt back.
- **`install.sh --upgrade`** pulls or rebuilds and recreates the stack. It does not dump the database and it does not restore one if the new container is unhealthy. Back up first.

`GRC_AIRGAP=1` (also `true` or `yes`) disables the button and makes the sidecar refuse check and upgrade. Images you have already loaded can still be started with the manual installer.

## Back up first

Take a copy of database `grcompliance` and the files on `grc_uploads` before you change the image. [Backup and restore](BACKUP-RESTORE.md) is the procedure (`scripts/backup.sh`, or `pg_dump` from the `db` service plus an archive of the uploads volume).

The button path also writes its own copy before it replaces the app. That copy is not a substitute for a backup you can reach if the host disk or the updater volume is the thing that fails. Take the script backup as well.

Redis on `grc_redis` is a cache and rate-limit store. Neither path archives it. `grc_postgres` and `grc_uploads` are kept across both paths. Compose `up` does not delete volumes.

## Settings → Updates

A platform administrator opens **Settings → Updates**. The installer creates the first account with role `admin`. Roles that may call the update API are `admin`, `owner`, `super_admin`, `super`, `enterprise_admin`, and `ent_admin`. Everyone else receives 403.

The page shows the running version. When a newer Core release exists, the button label is **Update available → Upgrade now**. The page is `packages/core/src/pages/settings/UpdateSettings.tsx`. The API is `/api/updates` (`status`, `check`, `upgrade`).

The `app` service does not mount the Docker socket. The `updater` service does. It listens on port 9090 inside the Compose network and publishes no host port. The app calls `http://updater:9090` with `Authorization: Bearer` and the `UPDATER_SECRET` from `.env`.

Discovery reads GitHub Releases for `Sectutor/GRCompliance-Core` and, if that list has no usable manifest, the public GHCR tag list. The image name must be `ghcr.io/sectutor/grcompliance-core`. The tag `latest` is not the upgrade target. The sidecar pulls `name:tag@sha256:…`. It does not run `docker load`, and it does not download a Premium artifact.

`updater/src/upgrade.mjs` runs this sequence:

1. Read `schema_version` from `schema_meta`. A missing row or a non-numeric value is version 0. Version 0 may move to a release whose `minSchemaVersion` is 1 or less. Any other installed version is refused when it is lower than `minSchemaVersion`.
2. Require free space on the backup volume and the install directory. The floor is `GRC_MIN_FREE_BYTES` (Compose default 2147483648, 2 GiB) or twice the uploads directory plus 64 MiB, whichever is larger.
3. Back up, then verify SHA-256 checksums. The copy is a directory under `/backups` on the `grc_backups` volume, named with the run id. It contains `db.dump` (`pg_dump -Fc` of the Compose database), `uploads.tgz` (the `grc_uploads` tree), `meta.json`, and `SHA256SUMS`.
4. Pull the pinned image, or accept a local image whose id or repo digest already matches.
5. Tag the running app image as `grc-rollback:` plus the first 12 hex characters of its image id.
6. Write `GRC_VERSION`, `GRC_IMAGE`, and `GRC_IMAGE_DIGEST` to `updater-state/release.env` and to `.env`, then recreate only the `app` service: `docker compose up -d --no-deps --no-build --force-recreate --pull never app`.
7. Wait for `http://app:3001/health` (timeout `GRC_HEALTH_TIMEOUT`, default 180 seconds). The health body must be HTTP 200, edition `core`, and the manifest version.

If the new app does not become healthy, the health version does not match, or the edition is not `core`:

- The previous image is started from the `grc-rollback:` tag.
- The database dump and the uploads archive are restored only when `schema_version` changed, or when the schema version could not be read after the new container started. Restore stops `app`, runs `pg_restore --clean --if-exists --no-owner --exit-on-error` into the existing database, and replaces the contents of the uploads directory.
- A failure before the app container is replaced leaves the running version in place and does not restore.

The start of an upgrade is written to `upgrade_events` and the activity log. The terminal result (succeeded, failed, or rolled back) is written when an administrator next loads update status.

This path does not enable Premium and does not change the Community workspace cap.

List the updater's copies from the install directory:

```bash
docker compose exec updater ls -l /backups
```

## What happens to the database

Container boot does not run Drizzle migrations. `docker/bootstrap.ts` applies `docker/schema.sql` only when `public.users` does not exist yet. On an existing database it leaves that file alone.

Every boot still runs idempotent statements:

- `schema_meta` is created if needed. `schema_version` is set to the greater of the stored value and `SCHEMA_VERSION` in `packages/core/src/server/updates/schemaVersion.ts`. This release's value is 1. Boot never writes a lower version.
- `evidence_requests.assignee_employee_id` is added if it is missing, and `assignee_id` is made nullable.
- `local_credentials` is created if it is missing.

`npm run db:push` is the Node checkout command in [INSTALL.md](../INSTALL.md). The Compose upgrade paths do not run it.

A release manifest can set `minSchemaVersion`. Version 0 (no `schema_meta` row) is allowed through when that minimum is 1 or less. Any higher installed version must be greater than or equal to the minimum, or the sidecar refuses the upgrade.

## Manual upgrade

The install directory does not contain `install.sh`. From any directory:

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --upgrade
```

Windows (PowerShell):

```powershell
iex "& { $(irm https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.ps1) } -Upgrade"
```

`--upgrade` is the same installer as a first install, with one difference: an existing `.env` is kept. It still:

- downloads `docker-compose.yml` and `docker-compose.local-ports.yml` again
- appends `UPDATER_SECRET` when that key is missing, and leaves every other value unchanged
- creates `updater-state/release.env` when it is missing (mode 600). A clone already includes that file. The committed copy is a comment and holds no secrets. A button upgrade writes the image pin into it.
- pulls `app` and `updater` for the tag in `GRC_VERSION`, or for `GRC_IMAGE` when that pin is set
- builds from a git clone of this repository when the published app image cannot be pulled (`GRC_REF` defaults to `main`)
- waits for `/health` on the host port (`HEALTH_RETRIES`, default 90 attempts, five seconds apart)

The administrator password is not rotated. Volumes are not removed. If `/health` never returns HTTP 200, the installer exits non-zero and prints `docker compose logs` hints. It does not start the previous image and it does not restore `db.dump`.

## Roll back by hand

After a successful button upgrade, `.env` and `updater-state/release.env` hold the new `GRC_IMAGE`. The previous image is the `grc-rollback:` tag created in step 5 above, if that tag is still on the host. Record the previous `GRC_IMAGE` (`name:tag@sha256:…`) before you upgrade if you want a pin that does not depend on a local tag.

To run the previous image:

1. Back up the current database and uploads ([Backup and restore](BACKUP-RESTORE.md)).
2. Set `GRC_IMAGE` in the install directory's `.env` to the previous reference.
3. Run the same `--upgrade` command. The installer exports `GRC_IMAGE` and pulls that reference.

That replaces the app image. It does not restore Postgres or `grc_uploads`. If the newer version changed the schema, restore the backup you took before the upgrade. The button's automatic restore is `pg_restore --clean --if-exists` into the existing database `grcompliance`. `scripts/restore.sh` is a different tool: it restores only into an empty database you name, and it refuses the Compose host `db` unless you pass `--force-prod`. Use the script procedure in [Backup and restore](BACKUP-RESTORE.md) when you want that empty-database restore. Do not point it at the live database unless you have decided that database is the one to overwrite.

A button upgrade that fails health on its own already attempts the image rollback, and it restores its `grc_backups` copy when the schema version changed. Use the hand steps when that automatic rollback did not finish, or when you are leaving a version that started successfully.
