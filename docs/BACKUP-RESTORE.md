# GRCompliance backup and restore

`scripts/backup.sh` and `scripts/restore.sh` back up the database, the auth directory, and uploaded files. The database password comes from `DB_PASSWORD` or `DB_PASSWORD_FILE`. There is no default, and the scripts do not print it. Do not commit a `.env` file or write a password into these scripts.

Defaults are application names you can override. They are not secrets and they are not tied to one machine:

| Variable | Default | Set it when |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | Postgres is not on localhost |
| `DB_PORT` | `5432` | Postgres listens on another port |
| `DB_NAME` | `complianceos` | Compose uses a different database name |
| `DB_USER` | `complianceos` | Compose uses a different role |
| `AUTH_DIR` | `/root/.complianceos` | Auth files live somewhere else. This is the application fallback when `COMPLIANCEOS_DATA_DIR` is unset and the process home is `/root`. A compose stack that sets `COMPLIANCEOS_DATA_DIR=/data` should use `AUTH_DIR=/data`. |
| `UPLOADS_DIR` | `/app/uploads` | The backup is not running where the app container mounts uploads |
| `STORAGE_UPLOADS_DIR` | `/app/storage/uploads` | Readiness report files live somewhere else |
| `BACKUP_DIR` | `./backups` | You want another parent directory |
| `BACKUP_RETENTION_DAYS` | `14` | Use `0` to keep every backup |
| `PROTECTED_DB_HOSTS` | empty | Restore must also refuse extra exact database hosts |

`/app/uploads` is the directory the image creates and the compose volume mounts. The server working directory is `/app`. Upload handlers (`storagePut`, the evidence router, and report files under `uploads/reports`) write `process.cwd()/uploads`, which is that path. `LocalStorageProvider` writes readiness reports to `process.cwd()/storage/uploads`.

## Backup

Backup writes a mode-0700 directory named `grc-YYYYMMDD-HHMMSS` under `BACKUP_DIR`:

- `pg_dump -Fc` writes `db.dump`. Errors from `pg_dump` stay visible.
- The auth directory is archived as `auth-volume.tgz` with `tar -C <parent> <name>`.
- Uploaded files are archived as `uploads.tgz` (`tar -C "$UPLOADS_DIR" .`).
- Readiness report files are archived as `storage-uploads.tgz`.
- If either uploads directory is missing or empty, the script logs a note and continues. The database backup still completes. A skipped archive is not written and is not listed in the checksum file.
- SHA-256 checksums of the files that were written go to `SHA256SUMS` and `checksums.sha256`. Check them with `sha256sum -c SHA256SUMS`.
- The run directory is mode 0700. The files are mode 0600.
- `BACKUP_RETENTION_DAYS` deletes `grc-*` directories directly inside `BACKUP_DIR` that are older than that many days. Nothing outside that directory, and nothing with another name, is removed.

```bash
DB_PASSWORD_FILE=/run/secrets/db_password ./scripts/backup.sh
```

## Restore

Restore only into a database you have already created and left empty. Create that database with the `pgvector/pgvector:pg16` image and the `vector` extension before you restore. The script does not create a database and it never drops one.

```bash
TARGET_DB=scratch_restore DB_PASSWORD_FILE=/run/secrets/db_password \
  ./scripts/restore.sh /path/to/grc-YYYYMMDD-HHMMSS
```

- `TARGET_DB` is required. If that database already has user tables, the script stops.
- GRCompliance refuses host `db` and any host that looks like production unless you pass `--force-prod`. Use that only for a scratch database. Set `PROTECTED_DB_HOSTS` to a colon-separated list of extra exact host names to refuse, such as the Postgres service name in your compose file. There is no built-in extra host.
- `sha256sum -c` runs before the script connects to `TARGET_DB` and before it extracts uploads. A mismatch aborts the restore.
- A custom-format dump is restored with `pg_restore --exit-on-error --no-owner --no-acl`. A plain `.sql` file is restored with `psql -v ON_ERROR_STOP=1`.
- Set `AUTH_RESTORE_DIR` to extract `auth-volume.tgz` there. A directory that already has files is left as it is unless you pass `--force`. `--force` does not bypass a bad checksum, a database that already has tables, or an uploads directory that already has files.
- Uploads are not restored unless you set `UPLOADS_RESTORE_DIR` or pass `--uploads-dir`. There is no default destination. The directory must be empty or must not exist yet. GRCompliance does not delete or overwrite files that are already there, and `--force` does not change that. The same rules apply to `STORAGE_UPLOADS_RESTORE_DIR` and `--storage-uploads-dir` for `storage-uploads.tgz`. A host the production guard refuses is not written.

For a disaster restore, build a new Postgres with a named volume and point the app at that database. Do not restore over the database you copied from.

`bash scripts/test/backup-restore-scripts.test.sh` runs shellcheck and checks that `scripts/` does not give a password a literal default.
