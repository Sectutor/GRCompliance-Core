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

This edition keeps local accounts in the Postgres table `local_credentials`. The app user is `grc` and its home directory is `/home/grc`. Compose does not set `AUTH_DIR`, and it does not mount an auth volume. Sign-in sessions stay in the browser. `pg_dump` includes `local_credentials`, so an auth directory is not required. When `AUTH_DIR` is unset, does not exist, or is empty, the script logs a note and skips `auth-volume.tgz`. When that path exists but is not accessible, the script stops.

`/app/uploads` is the directory the image creates and the compose volume `grc_uploads` mounts. The server working directory is `/app`. Upload handlers (`storagePut`, the evidence router, and report files under `uploads/reports`) write `process.cwd()/uploads`, which is that path. `LocalStorageProvider` writes readiness reports to `process.cwd()/storage/uploads`. This compose file does not mount a volume on `/app/storage/uploads`. A missing directory is skipped.

## Backup

Backup writes a mode-0700 directory named `grc-YYYYMMDD-HHMMSS` under `BACKUP_DIR`:

- `pg_dump -Fc` writes `db.dump`. Errors from `pg_dump` stay visible.
- When `AUTH_DIR` exists and contains files, it is archived as `auth-volume.tgz` with `tar -C <parent> <name>`. When it is unset, does not exist, or is empty, the script logs a note and continues.
- Uploaded files are archived as `uploads.tgz` (`tar -C "$UPLOADS_DIR" .`).
- Readiness report files are archived as `storage-uploads.tgz`.
- If either uploads directory does not exist or is empty, the script logs a note and continues. The database backup still completes. A skipped archive is not written and is not listed in the checksum file. If the path exists but this user cannot read or traverse it, the script stops before it creates a backup directory.
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

`DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_NAME` can stay unset for this stack. They default to `localhost`, `5432`, `grc`, and `grcompliance`. Keep `$HOME/.grc-db-password` outside the repository. Do not print the file and do not commit it. This command runs as your user, who can read that mode-0600 file. The uid 1001 container below cannot. It uses a separate mode-0400 copy.

## Client tools must match the server

This stack runs Postgres 16 (`pgvector/pgvector:pg16`). The `pg_dump` and `pg_restore` major version must be 16 as well. A Postgres 17 client sends `SET transaction_timeout`. Postgres 16 does not know that setting, and the dump or restore aborts.

`backup.sh` compares `pg_dump --version` with the server and refuses a mismatch before it creates a backup directory. `restore.sh` compares `pg_restore --version` with the server after the checksum and empty-database checks, and before it writes any rows. Check the clients you are about to use:

```bash
pg_dump --version
pg_restore --version
docker compose exec -T db pg_dump --version
docker compose exec -T db pg_restore --version
```

Use the database container's own tools, or the `postgres:16` image, so the major version matches. A one-off dump from the server container writes the archive on the host and does not put the password on the command line:

```bash
docker compose exec -T db pg_dump -U grc -d grcompliance -Fc > "$HOME/grc-db.dump"
```

`docker compose exec db pg_dump` is the server's `pg_dump`. Do not point `backup.sh` or `restore.sh` at PostgreSQL 17 client packages.

`--allow-version-mismatch` continues only when the client is older than the server, and only if you have already confirmed that older client can read the dump. A newer client is refused with or without the flag, because that mismatch is the `transaction_timeout` failure. The flag does not skip checksum checks, the empty-database check, or the production-host check.

## Uploads are owned by uid 1001

`/app/uploads` is inside the `grcompliance_grc_uploads` volume. The image creates that directory as uid 1001 (user `grc`) with mode 0755. The files in it are mode 0600. A different user can traverse the directory and cannot read the files. When `/app/uploads` does not exist, a backup started on the host logs that and still dumps the database. When the path exists but this user cannot read or traverse it, `backup.sh` stops before it creates a backup directory. To include the files, run `backup.sh` as a user who can already read them.

`cp -a` keeps uid 1001, directory mode 0755, and file mode 0600. The copy is still unreadable by a different user, and `backup.sh` then stops. Do not fix this by making the files world-readable, and do not copy the volume to the host that way.

`backup.sh` checks `AUTH_DIR`, `UPLOADS_DIR`, and `STORAGE_UPLOADS_DIR` before it creates a backup directory. A path that does not exist is skipped. A path that exists but is not accessible is refused, with the same guidance as an unreadable tree. If a later step fails, the script removes the `grc-*` directory that this run created, and it removes `BACKUP_DIR` only when this run created that directory and left it empty. Other backups stay where they are.

Two safe ways to run the backup:

Run it as uid 1001, with the uploads volume mounted and a Postgres 16 `pg_dump` on `PATH`. `pgvector/pgvector:pg16` supplies that client. The backup directory must be writable by uid 1001.

`$HOME/.grc-db-password` is mode 0600 and owned by the user who created it. Mounting that file into a container running as uid 1001 fails with `DB_PASSWORD_FILE is set but cannot be read`. Do not chmod it world-readable, and do not pass the password on the `docker run` command line. `chown` below needs permission to change the file owner, the same permission the backup directory already needs. Copy the secret to a mode 0400 file owned by uid 1001 in a private temporary directory, mount that copy, and remove the directory after the container exits, including when the backup fails. The original file stays mode 0600 and is not mounted.

```bash
mkdir -p -- "$HOME/grc-backups"
chown 1001:1001 "$HOME/grc-backups"

secret_dir="$(mktemp -d)"
chmod 700 "${secret_dir}"
cp -- "$HOME/.grc-db-password" "${secret_dir}/db_password"
chown 1001:1001 "${secret_dir}/db_password"
chmod 400 "${secret_dir}/db_password"

docker run --rm --network grcompliance_default \
  --user 1001:1001 \
  --entrypoint bash \
  -v grcompliance_grc_uploads:/app/uploads:ro \
  -v "$PWD":/work -w /work \
  -v "$HOME/grc-backups":/backups \
  -e DB_HOST=db \
  -e DB_PASSWORD_FILE=/run/secrets/db_password \
  -e UPLOADS_DIR=/app/uploads \
  -e BACKUP_DIR=/backups \
  -v "${secret_dir}/db_password":/run/secrets/db_password:ro \
  pgvector/pgvector:pg16 \
  ./scripts/backup.sh && status=0 || status=$?
rm -rf -- "${secret_dir}"
[ "${status}" -eq 0 ]
```

`docker compose exec -u 1001 db pg_dump` uses the server's client for the database. The `db` service does not mount the uploads volume, so it cannot archive those files. `docker compose exec -u 1001 app` runs as the owning user and can read `/app/uploads`, but the app image does not include `pg_dump`. Use the `db` service for the database tools and uid 1001 for the files.

Or run the script with sudo. Root can read the mode 0600 upload files. The backup directory is then owned by root and mode 0700.

```bash
sudo env \
  DB_PASSWORD_FILE="$HOME/.grc-db-password" \
  UPLOADS_DIR=/path/root/can/read \
  ./scripts/backup.sh
```

## Restore into a fresh empty database

Restore only into a database you have already created and left empty. The script does not create a database and it never drops one. Leave `grcompliance` in place and restore into a new database.

1. Create the empty database on the running Postgres service. These commands use the container's local socket, so the password is not on the command line. The image is `pgvector/pgvector:pg16`.

```bash
docker compose exec -T db createdb -U grc grcompliance_restore
```

2. A superuser must create the `vector` extension in that empty database before `restore.sh`. The dump contains `CREATE EXTENSION vector`. That statement loads a C extension and is rejected when the restoring role is not a superuser. The role that owns the empty database often is not a superuser, and `restore.sh` connects as `DB_USER`, so the restore would stop on that statement. Creating the extension first adds types and functions, not tables, so the database is still empty for the script's table check. `restore.sh` then lists the dump with `pg_restore -l`, drops the `CREATE EXTENSION` entry from the list it passes to `pg_restore -L`, and restores the remaining objects as the non-superuser owner.

In the default compose file, `POSTGRES_USER` (default `grc`) is the superuser the image creates. If the target database is owned by a different role that is not a superuser, run the command as a superuser instead of as that owner:

```bash
docker compose exec -T db psql -U grc -d grcompliance_restore -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

The command a superuser runs is `CREATE EXTENSION IF NOT EXISTS vector;`. `restore.sh` checks the dump and the target. If the dump needs `vector` and the extension is missing, it stops before writing any data and prints that command. It does not create the extension itself.

3. Reuse the password file from the backup section. `restore.sh` reads `DB_PASSWORD_FILE`. It does not take the password as an argument. Export `DB_PASSWORD` instead when you already have the password in the environment.

4. With the loopback port published, the default host is `localhost`. That name is allowed. `TARGET_DB` must be the empty database from step 1. `pg_restore` must be the same major version as the server. See [Client tools must match the server](#client-tools-must-match-the-server).

```bash
TARGET_DB=grcompliance_restore \
  DB_PASSWORD_FILE="$HOME/.grc-db-password" \
  ./scripts/restore.sh ./backups/grc-YYYYMMDD-HHMMSS
```

Replace `grc-YYYYMMDD-HHMMSS` with the backup directory you are restoring.

5. The compose service hostname is `db`. `restore.sh` refuses host `db` unless you pass `--force-prod`. `--force-prod` allows that hostname only. The target database must still be empty, checksums must still match, and an uploads directory that already has files is still refused. Point `TARGET_DB` at `grcompliance_restore`.

```bash
TARGET_DB=grcompliance_restore \
  DB_HOST=db \
  DB_PASSWORD_FILE="$HOME/.grc-db-password" \
  ./scripts/restore.sh --force-prod ./backups/grc-YYYYMMDD-HHMMSS
```

6. Uploads stay in the archive until you name an empty directory. `--force` does not fill a directory that already has files.

```bash
mkdir -p "$HOME/grc-uploads-restore"
TARGET_DB=grcompliance_restore \
  DB_PASSWORD_FILE="$HOME/.grc-db-password" \
  ./scripts/restore.sh \
  --uploads-dir "$HOME/grc-uploads-restore" \
  ./backups/grc-YYYYMMDD-HHMMSS
```

Copy those files into an empty `grc_uploads` volume when you want the app to serve them.

7. After you have checked `grcompliance_restore`, point `DATABASE_URL` in your private `.env` at that database and recreate the app container. For a disaster restore, build a new Postgres with a named volume and point the app at that database.

- `TARGET_DB` is required. If that database already has user tables, the script stops.
- GRCompliance refuses host `db` and any host that looks like production unless you pass `--force-prod`. Use that only for a scratch database. Set `PROTECTED_DB_HOSTS` to a colon-separated list of extra exact host names to refuse. There is no built-in extra host.
- `sha256sum -c` runs before the script connects to `TARGET_DB` and before it extracts uploads. A mismatch aborts the restore.
- `pg_restore` must match the server's major version. `--allow-version-mismatch` does not allow a newer client and does not bypass a bad checksum, a database that already has tables, or a production host.
- A custom-format dump is restored with `pg_restore --exit-on-error --no-owner --no-acl`. When the dump contains the `vector` extension and that extension is already installed, the `CREATE EXTENSION` entry is left out of the `pg_restore -L` list. A plain `.sql` file is restored with `psql -v ON_ERROR_STOP=1`, with that same `CREATE EXTENSION` statement removed when the extension is already installed.
- If the dump needs `vector` and the extension is missing, restore stops before writing data. A superuser has to run `CREATE EXTENSION IF NOT EXISTS vector;` in the empty target database first.
- Set `AUTH_RESTORE_DIR` to extract `auth-volume.tgz` there. A directory that already has files is left as it is unless you pass `--force`. A backup that skipped the auth archive has no `auth-volume.tgz`. `--force` does not bypass a bad checksum, a database that already has tables, or an uploads directory that already has files.
- Uploads are not restored unless you set `UPLOADS_RESTORE_DIR` or pass `--uploads-dir`. There is no default destination. The directory must be empty or must not exist yet. GRCompliance does not delete or overwrite files that are already there, and `--force` does not change that. The same rules apply to `STORAGE_UPLOADS_RESTORE_DIR` and `--storage-uploads-dir` for `storage-uploads.tgz`. A host the production guard refuses is not written.

`bash scripts/test/backup-restore-scripts.test.sh` runs shellcheck and checks that `scripts/` does not give a password a literal default.
