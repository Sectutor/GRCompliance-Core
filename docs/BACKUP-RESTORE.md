# GRCompliance backup and restore

`scripts/backup.sh` and `scripts/restore.sh` back up the database and uploaded files for this repository's Docker Compose stack. The database password comes from `DB_PASSWORD` or `DB_PASSWORD_FILE`. There is no default, and the scripts do not print it. Do not commit a `.env` file or write a password into these scripts.

Defaults match `docker-compose.yml` and stay overridable:

| Variable | Default | Set it when |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | Postgres is not on localhost |
| `DB_PORT` | `5432` | Postgres listens on another port |
| `DB_NAME` | `grcompliance` | Compose uses a different database name |
| `DB_USER` | `grc` | Compose uses a different role |
| `AUTH_DIR` | unset | You have a directory of auth files to archive |
| `UPLOADS_DIR` | `/app/uploads` | The backup is not running where the app container mounts uploads |
| `STORAGE_UPLOADS_DIR` | `/app/storage/uploads` | Readiness report files live somewhere else |
| `BACKUP_DIR` | `./backups` | You want another parent directory |
| `BACKUP_RETENTION_DAYS` | `14` | Use `0` to keep every backup |
| `PROTECTED_DB_HOSTS` | empty | Restore must also refuse extra exact database hosts |

This edition keeps local accounts in the Postgres table `local_credentials`. The app user is `grc` and its home directory is `/home/grc`. Compose does not set `COMPLIANCEOS_DATA_DIR`, and it does not mount an auth volume. Sign-in sessions stay in the browser. `pg_dump` includes `local_credentials`, so an auth directory is not required. When `AUTH_DIR` is unset, missing, or empty, the script logs a note and skips `auth-volume.tgz`.

`/app/uploads` is the directory the image creates and the compose volume `grc_uploads` mounts. The server working directory is `/app`. Upload handlers (`storagePut`, the evidence router, and report files under `uploads/reports`) write `process.cwd()/uploads`, which is that path. `LocalStorageProvider` writes readiness reports to `process.cwd()/storage/uploads`. This compose file does not mount a volume on `/app/storage/uploads`. A missing directory is skipped.

## Backup

Backup writes a mode-0700 directory named `grc-YYYYMMDD-HHMMSS` under `BACKUP_DIR`:

- `pg_dump -Fc` writes `db.dump`. Errors from `pg_dump` stay visible.
- When `AUTH_DIR` exists and contains files, it is archived as `auth-volume.tgz` with `tar -C <parent> <name>`. Otherwise the script logs a note and continues.
- Uploaded files are archived as `uploads.tgz` (`tar -C "$UPLOADS_DIR" .`).
- Readiness report files are archived as `storage-uploads.tgz`.
- If either uploads directory is missing or empty, the script logs a note and continues. The database backup still completes. A skipped archive is not written and is not listed in the checksum file.
- SHA-256 checksums of the files that were written go to `SHA256SUMS` and `checksums.sha256`. Check them with `sha256sum -c SHA256SUMS`.
- The run directory is mode 0700. The files are mode 0600.
- `BACKUP_RETENTION_DAYS` deletes `grc-*` directories directly inside `BACKUP_DIR` that are older than that many days. Nothing outside that directory, and nothing with another name, is removed.

Publish Postgres on loopback, then write the database password to a mode-0600 file. The password is not an argument of `backup.sh`.

```bash
docker compose -f docker-compose.yml -f docker-compose.local-ports.yml up -d

umask 077
docker compose exec -T db printenv POSTGRES_PASSWORD > "$HOME/.grc-db-password"
chmod 600 "$HOME/.grc-db-password"

DB_PASSWORD_FILE="$HOME/.grc-db-password" ./scripts/backup.sh
```

`DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_NAME` can stay unset for this stack. They default to `localhost`, `5432`, `grc`, and `grcompliance`. Keep `$HOME/.grc-db-password` outside the repository. Do not print the file and do not commit it.

`/app/uploads` is inside the `grcompliance_grc_uploads` volume, so a backup started on the host skips that path and still dumps the database. To include the volume, copy it out and point `UPLOADS_DIR` at the copy:

```bash
mkdir -p "$HOME/grc-uploads"
docker run --rm \
  -v grcompliance_grc_uploads:/data \
  -v "$HOME/grc-uploads":/dest \
  alpine cp -a /data/. /dest/

DB_PASSWORD_FILE="$HOME/.grc-db-password" \
  UPLOADS_DIR="$HOME/grc-uploads" \
  ./scripts/backup.sh
```

## Restore into a fresh empty database

Restore only into a database you have already created and left empty. The script does not create a database and it never drops one. Leave `grcompliance` in place and restore into a new database.

1. Create the empty database on the running Postgres service. These commands use the container's local socket, so the password is not on the command line. The image is `pgvector/pgvector:pg16`. Create the `vector` extension before restore.

```bash
docker compose exec -T db createdb -U grc grcompliance_restore
docker compose exec -T db psql -U grc -d grcompliance_restore -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

2. Reuse the password file from the backup section. `restore.sh` reads `DB_PASSWORD_FILE`. It does not take the password as an argument. Export `DB_PASSWORD` instead when you already have the password in the environment.

3. With the loopback port published, the default host is `localhost`. That name is allowed. `TARGET_DB` must be the empty database from step 1.

```bash
TARGET_DB=grcompliance_restore \
  DB_PASSWORD_FILE="$HOME/.grc-db-password" \
  ./scripts/restore.sh ./backups/grc-YYYYMMDD-HHMMSS
```

Replace `grc-YYYYMMDD-HHMMSS` with the backup directory you are restoring.

4. The compose service hostname is `db`. `restore.sh` refuses host `db` unless you pass `--force-prod`. `--force-prod` allows that hostname only. The target database must still be empty, checksums must still match, and an uploads directory that already has files is still refused. Point `TARGET_DB` at `grcompliance_restore`.

```bash
TARGET_DB=grcompliance_restore \
  DB_HOST=db \
  DB_PASSWORD_FILE="$HOME/.grc-db-password" \
  ./scripts/restore.sh --force-prod ./backups/grc-YYYYMMDD-HHMMSS
```

5. Uploads stay in the archive until you name an empty directory. `--force` does not fill a directory that already has files.

```bash
mkdir -p "$HOME/grc-uploads-restore"
TARGET_DB=grcompliance_restore \
  DB_PASSWORD_FILE="$HOME/.grc-db-password" \
  ./scripts/restore.sh \
  --uploads-dir "$HOME/grc-uploads-restore" \
  ./backups/grc-YYYYMMDD-HHMMSS
```

Copy those files into an empty `grc_uploads` volume when you want the app to serve them.

6. After you have checked `grcompliance_restore`, point `DATABASE_URL` in your private `.env` at that database and recreate the app container. For a disaster restore, build a new Postgres with a named volume and point the app at that database.

- `TARGET_DB` is required. If that database already has user tables, the script stops.
- GRCompliance refuses host `db` and any host that looks like production unless you pass `--force-prod`. Use that only for a scratch database. Set `PROTECTED_DB_HOSTS` to a colon-separated list of extra exact host names to refuse. There is no built-in extra host.
- `sha256sum -c` runs before the script connects to `TARGET_DB` and before it extracts uploads. A mismatch aborts the restore.
- A custom-format dump is restored with `pg_restore --exit-on-error --no-owner --no-acl`. A plain `.sql` file is restored with `psql -v ON_ERROR_STOP=1`.
- Set `AUTH_RESTORE_DIR` to extract `auth-volume.tgz` there. A directory that already has files is left as it is unless you pass `--force`. A backup that skipped the auth archive has no `auth-volume.tgz`. `--force` does not bypass a bad checksum, a database that already has tables, or an uploads directory that already has files.
- Uploads are not restored unless you set `UPLOADS_RESTORE_DIR` or pass `--uploads-dir`. There is no default destination. The directory must be empty or must not exist yet. GRCompliance does not delete or overwrite files that are already there, and `--force` does not change that. The same rules apply to `STORAGE_UPLOADS_RESTORE_DIR` and `--storage-uploads-dir` for `storage-uploads.tgz`. A host the production guard refuses is not written.

`bash scripts/test/backup-restore-scripts.test.sh` runs shellcheck and checks that `scripts/` does not give a password a literal default.
