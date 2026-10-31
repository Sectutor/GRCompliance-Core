#!/usr/bin/env bash
# End-to-end backup and restore against a throwaway pgvector/pgvector:pg16
# container. Uploads in this fixture are owned by uid 1001. The image itself
# creates /app/uploads as mode 0755 and the files as mode 0600. The restoring
# role is not a superuser. A Postgres 17 client is refused. The database
# password is generated at runtime into a mode-0600 file and is never printed.
# The uid 1001 container reads a mode-0400 copy of that file. Fictional rows only.
set -euo pipefail
set +x

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP="${ROOT}/scripts/backup.sh"
RESTORE="${ROOT}/scripts/restore.sh"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${E2E_DOCKER_PORT:-55433}"
IMAGE="${E2E_IMAGE:-pgvector/pgvector:pg16}"

fail() {
    printf '%s\n' "$*" >&2
    exit 1
}

WORK=""
CONTAINER=""
cleanup() {
    local status=$?
    set +e
    if [ -n "${CONTAINER}" ]; then
        sudo -n docker rm -f "${CONTAINER}" >/dev/null 2>&1
    fi
    if [ -n "${WORK}" ] && [ -d "${WORK}" ]; then
        sudo -n rm -rf -- "${WORK}"
    fi
    exit "${status}"
}
trap cleanup EXIT

psql_grc() {
    local database="$1"
    shift
    local pgpass="${WORK}/pgpass-grc"
    python3 - "${pgpass}" "${PASS}" "${PORT}" "${database}" <<'PY'
import pathlib, sys
dest, passfile, port, database = sys.argv[1:]
password = pathlib.Path(passfile).read_text().strip()
path = pathlib.Path(dest)
path.write_text(
    "127.0.0.1:{port}:{database}:grc:{password}\n".format(
        port=port, database=database, password=password.replace("\\", "\\\\").replace(":", "\\:")
    )
)
path.chmod(0o600)
PY
    PGPASSFILE="${pgpass}" "${PG_BIN}/psql" \
        -h 127.0.0.1 -p "${PORT}" -U grc -d "${database}" \
        -v ON_ERROR_STOP=1 -X -q "$@"
}

as_1001() {
    sudo -n setpriv --reuid=1001 --regid=1001 --clear-groups --inh-caps=-all env "$@"
}

# Run backup.sh as uid 1001 in the Postgres 16 image. Extra docker options
# are placed before the image. The password is never one of those options.
pg16_backup_as_1001() {
    sudo -n docker run --rm \
        --user 1001:1001 \
        --entrypoint bash \
        -v "${ROOT}:/work:ro" \
        -w /work \
        "$@" \
        "${IMAGE}" \
        ./scripts/backup.sh
}

assert_absent() {
    if printf '%s\n' "$1" | grep -F -q -- "$2"; then
        fail "output contains the generated database password"
    fi
}

main() {
    local out=""
    local status=0
    local secret=""
    local sql=""
    local uploads=""
    local storage=""
    local backup_parent=""
    local run_dir=""
    local copy=""
    local wrapper=""
    local wrapper_log=""
    local client_path=""
    local server_version=""
    local image_client=""
    local secret_dir=""
    local blocked=""
    local naive_backups=""
    local inaccessible_backups=""
    local container_backups=""
    local host_blocked=""
    local host_absent=""

    command -v python3 >/dev/null 2>&1 || fail "python3 is required"
    command -v openssl >/dev/null 2>&1 || fail "openssl is required"
    sudo -n docker info >/dev/null || fail "docker is not available"
    [ -x "${PG_BIN}/pg_dump" ] || fail "PostgreSQL 16 pg_dump is required on the host to match the server major version"
    sudo -n setpriv --reuid=1001 --regid=1001 --clear-groups --inh-caps=-all true \
        || fail "cannot run a process as uid 1001"

    WORK="$(mktemp -d)"
    chmod 755 "${WORK}"
    PASS="${WORK}/db-password"
    uploads="${WORK}/uploads"
    storage="${WORK}/storage-uploads"
    backup_parent="${WORK}/for-uid-1001"
    wrapper="${WORK}/pg17"
    wrapper_log="${WORK}/wrapper.log"
    sql="${WORK}/init.sql"
    CONTAINER="grc-e2e-db-$$"
    client_path="${PG_BIN}:${PATH}"

    umask 077
    openssl rand -base64 24 | tr -d '\n' > "${PASS}"
    chmod 600 "${PASS}"
    secret="$(cat -- "${PASS}")"
    [ -n "${secret}" ] || fail "generated password was empty"

    sudo -n docker run -d --name "${CONTAINER}" \
        -v "${PASS}:/run/secrets/db_password:ro" \
        -e POSTGRES_PASSWORD_FILE=/run/secrets/db_password \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_DB=postgres \
        -p "127.0.0.1:${PORT}:5432" \
        "${IMAGE}" >/dev/null

    local ready=0
    local attempt=0
    while [ "${attempt}" -lt 60 ]; do
        if "${PG_BIN}/pg_isready" -h 127.0.0.1 -p "${PORT}" -U postgres >/dev/null 2>&1; then
            ready=1
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    [ "${ready}" -eq 1 ] || fail "Postgres in ${IMAGE} did not become ready"
    server_version="$(sudo -n docker exec "${CONTAINER}" psql -U postgres -d postgres -X -q -tAc "SELECT current_setting('server_version_num')")"
    server_version="${server_version//[[:space:]]/}"
    image_client="$(sudo -n docker exec "${CONTAINER}" pg_dump --version)"
    printf '%s\n' "server_version_num=${server_version}"
    printf '%s\n' "image client: ${image_client}"
    [ "${server_version}" -ge 160000 ] || fail "expected a Postgres 16 server, got ${server_version}"
    [ "$((server_version / 10000))" -eq 16 ] || fail "this script expects server major version 16"

    python3 - "${sql}" "${PASS}" <<'PY'
import pathlib, sys
dest, passfile = sys.argv[1:]
password = pathlib.Path(passfile).read_text().strip().replace("'", "''")
pathlib.Path(dest).write_text(
    "CREATE ROLE grc NOSUPERUSER NOCREATEDB NOCREATEROLE LOGIN PASSWORD '" + password + "';\n"
    "CREATE DATABASE grcompliance OWNER grc;\n"
    "CREATE DATABASE grcompliance_restore OWNER grc;\n"
)
PY
    chmod 600 "${sql}"
    sudo -n docker cp "${sql}" "${CONTAINER}:/tmp/grc-init.sql"
    sudo -n docker exec "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q -f /tmp/grc-init.sql
    sudo -n docker exec "${CONTAINER}" rm -f /tmp/grc-init.sql
    rm -f -- "${sql}"
    sudo -n docker exec "${CONTAINER}" psql -U postgres -d grcompliance -v ON_ERROR_STOP=1 -X -q \
        -c "CREATE EXTENSION IF NOT EXISTS vector;"
    if [ "$(sudo -n docker exec "${CONTAINER}" psql -U postgres -d postgres -X -q -tAc "SELECT rolsuper FROM pg_roles WHERE rolname = 'grc'")" != "f" ]; then
        fail "role grc is a superuser; this test needs a non-superuser owner"
    fi
    psql_grc grcompliance -c "CREATE TABLE policy_notes (id integer PRIMARY KEY, body text NOT NULL, embedding vector(3));"
    psql_grc grcompliance -c "INSERT INTO policy_notes (id, body, embedding) VALUES (1, 'Fictional access-control note for the backup test', '[0.25,0.50,0.75]');"

    mkdir -p "${uploads}/clients/1" "${storage}/reports" "${backup_parent}" "${wrapper}" "${WORK}/readable-uploads"
    printf '%s\n' 'fictional-evidence-bytes' > "${uploads}/clients/1/policy.pdf"
    printf '%s\n' 'fictional-report-bytes' > "${storage}/reports/gap.pdf"
    chmod 700 "${uploads}" "${uploads}/clients" "${uploads}/clients/1" "${storage}" "${storage}/reports"
    chmod 600 "${uploads}/clients/1/policy.pdf" "${storage}/reports/gap.pdf"
    cp -- "${PASS}" "${WORK}/db-password-1001"
    sudo -n chown -R 1001:1001 "${uploads}" "${storage}" "${backup_parent}" "${WORK}/db-password-1001"
    sudo -n chmod 600 "${WORK}/db-password-1001"

    set +e
    out="$(
        DB_PASSWORD_FILE="${PASS}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_NAME=grcompliance \
        DB_USER=grc \
        BACKUP_DIR="${WORK}/denied-backups" \
        BACKUP_RETENTION_DAYS=0 \
        UPLOADS_DIR="${uploads}" \
        STORAGE_UPLOADS_DIR="${storage}" \
        PATH="${client_path}" \
        bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "backup read uploads owned by uid 1001"
    printf '%s\n' "${out}" | grep -q 'not readable by this user' || fail "unreadable uploads were not explained: ${out}"
    [ ! -e "${WORK}/denied-backups" ] || fail "unreadable uploads left a backup directory behind"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "docker permission refusal: ok"

    host_blocked="${WORK}/host-blocked"
    mkdir -p "${host_blocked}/uploads"
    printf '%s\n' 'fictional-hidden-bytes' > "${host_blocked}/uploads/hidden.pdf"
    chmod 000 "${host_blocked}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${PASS}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_NAME=grcompliance \
        DB_USER=grc \
        BACKUP_DIR="${WORK}/host-blocked-backups" \
        BACKUP_RETENTION_DAYS=0 \
        UPLOADS_DIR="${host_blocked}/uploads" \
        STORAGE_UPLOADS_DIR="${WORK}/host-absent-storage" \
        PATH="${client_path}" \
        bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    chmod 700 "${host_blocked}" || fail "could not restore mode on the blocked parent"
    [ "${status}" -ne 0 ] || fail "inaccessible uploads path was treated as missing"
    printf '%s\n' "${out}" | grep -q 'exists but is not accessible' || fail "inaccessible uploads path was not refused: ${out}"
    printf '%s\n' "${out}" | grep -q 'uid 1001' || fail "inaccessible uploads message did not name uid 1001"
    printf '%s\n' "${out}" | grep -q 'world-readable' || fail "inaccessible uploads message did not forbid a world-readable mode"
    if printf '%s\n' "${out}" | grep -q 'does not exist'; then
        fail "inaccessible uploads path was reported as not existing"
    fi
    if printf '%s\n' "${out}" | grep -q 'Continuing without'; then
        fail "inaccessible uploads path was skipped"
    fi
    [ ! -e "${WORK}/host-blocked-backups" ] || fail "inaccessible uploads left a backup directory behind"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "docker inaccessible path refusal: ok"

    host_absent="${WORK}/host-absent-backups"
    set +e
    out="$(
        DB_PASSWORD_FILE="${PASS}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_NAME=grcompliance \
        DB_USER=grc \
        BACKUP_DIR="${host_absent}" \
        BACKUP_RETENTION_DAYS=0 \
        UPLOADS_DIR="${WORK}/no-such-uploads" \
        STORAGE_UPLOADS_DIR="${WORK}/no-such-storage" \
        PATH="${client_path}" \
        bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "absent uploads path failed the backup: ${out}"
    printf '%s\n' "${out}" | grep -q "Uploads directory does not exist: ${WORK}/no-such-uploads" || fail "absent uploads path was not warned: ${out}"
    printf '%s\n' "${out}" | grep -q "Storage uploads directory does not exist: ${WORK}/no-such-storage" || fail "absent storage path was not warned: ${out}"
    printf '%s\n' "${out}" | grep -q 'Continuing without it' || fail "absent path was not skipped"
    if printf '%s\n' "${out}" | grep -q 'exists but is not accessible'; then
        fail "absent path was reported as inaccessible"
    fi
    run_dir="$(find "${host_absent}" -mindepth 1 -maxdepth 1 -type d -name 'grc-*' -print)"
    [ -n "${run_dir}" ] || fail "absent path did not write a backup"
    [ ! -e "${run_dir}/uploads.tgz" ] || fail "absent uploads path was archived"
    [ ! -e "${run_dir}/storage-uploads.tgz" ] || fail "absent storage path was archived"
    (cd -- "${run_dir}" && sha256sum -c SHA256SUMS) || fail "absent-path backup checksums did not verify"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "docker absent path warning: ok"

    secret_dir="$(mktemp -d "${WORK}/secret.XXXXXX")"
    chmod 700 "${secret_dir}"
    cp -- "${PASS}" "${secret_dir}/db_password"
    sudo -n chown 1001:1001 "${secret_dir}/db_password"
    sudo -n chmod 400 "${secret_dir}/db_password"
    [ "$(stat -c '%a' -- "${secret_dir}/db_password")" = "400" ] || fail "uid 1001 password copy is not mode 0400"
    [ "$(stat -c '%u' -- "${secret_dir}/db_password")" = "1001" ] || fail "uid 1001 password copy is not owned by uid 1001"
    [ "$(stat -c '%a' -- "${PASS}")" = "600" ] || fail "original password file mode changed"
    [ "$(stat -c '%u' -- "${PASS}")" = "$(id -u)" ] || fail "original password file owner changed"

    naive_backups="${WORK}/naive-backups"
    mkdir -p "${naive_backups}"
    set +e
    out="$(
        pg16_backup_as_1001 \
            -v "${PASS}:/run/secrets/db_password:ro" \
            -v "${naive_backups}:/backups" \
            -e DB_PASSWORD_FILE=/run/secrets/db_password \
            -e DB_HOST=127.0.0.1 \
            -e DB_PORT=1 \
            -e BACKUP_DIR=/backups \
            -e BACKUP_RETENTION_DAYS=0 \
            -e UPLOADS_DIR=/no/such/uploads \
            -e STORAGE_UPLOADS_DIR=/no/such/storage \
            2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "uid 1001 read a mode 0600 password file owned by another user"
    printf '%s\n' "${out}" | grep -q 'cannot be read' || fail "unreadable password file inside the container was not explained: ${out}"
    [ -z "$(find "${naive_backups}" -mindepth 1 -name 'grc-*' -print -quit)" ] || fail "unreadable password file still created a backup"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "docker uid 1001 rejects the host-owned password file: ok"

    blocked="${WORK}/uid1001-blocked"
    mkdir -p "${blocked}/uploads"
    printf '%s\n' 'fictional-hidden-bytes' > "${blocked}/uploads/hidden.pdf"
    chmod 700 "${blocked}"
    inaccessible_backups="${WORK}/inaccessible-backups"
    mkdir -p "${inaccessible_backups}"
    set +e
    out="$(
        pg16_backup_as_1001 \
            -v "${secret_dir}/db_password:/run/secrets/db_password:ro" \
            -v "${blocked}:/host-blocked:ro" \
            -v "${inaccessible_backups}:/backups" \
            -e DB_PASSWORD_FILE=/run/secrets/db_password \
            -e DB_HOST=127.0.0.1 \
            -e DB_PORT=1 \
            -e BACKUP_DIR=/backups \
            -e BACKUP_RETENTION_DAYS=0 \
            -e UPLOADS_DIR=/host-blocked/uploads \
            -e STORAGE_UPLOADS_DIR=/no/such/storage-uploads \
            2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "uid 1001 treated an unsearchable uploads path as missing"
    printf '%s\n' "${out}" | grep -q 'exists but is not accessible' || fail "container did not refuse the inaccessible uploads path: ${out}"
    printf '%s\n' "${out}" | grep -q 'uid 1001' || fail "container inaccessible message did not name uid 1001"
    if printf '%s\n' "${out}" | grep -q 'does not exist'; then
        fail "container reported an inaccessible uploads path as not existing"
    fi
    if printf '%s\n' "${out}" | grep -q 'Continuing without'; then
        fail "container skipped an inaccessible uploads path"
    fi
    [ -z "$(find "${inaccessible_backups}" -mindepth 1 -name 'grc-*' -print -quit)" ] || fail "inaccessible container path still created a backup"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "docker uid 1001 inaccessible path refusal: ok"

    # Share the database container's network namespace and use its localhost.
    # The documented command joins grcompliance_default and sets DB_HOST=db.
    # The password file, uid, and uploads mount are the same either way.
    container_backups="${WORK}/container-backups"
    mkdir -p "${container_backups}"
    sudo -n chown 1001:1001 "${container_backups}"
    sudo -n chmod 700 "${container_backups}"
    set +e
    out="$(
        pg16_backup_as_1001 \
            --network "container:${CONTAINER}" \
            -v "${secret_dir}/db_password:/run/secrets/db_password:ro" \
            -v "${uploads}:/app/uploads:ro" \
            -v "${container_backups}:/backups" \
            -e DB_HOST=127.0.0.1 \
            -e DB_PORT=5432 \
            -e DB_NAME=grcompliance \
            -e DB_USER=grc \
            -e DB_PASSWORD_FILE=/run/secrets/db_password \
            -e BACKUP_DIR=/backups \
            -e BACKUP_RETENTION_DAYS=0 \
            -e UPLOADS_DIR=/app/uploads \
            -e STORAGE_UPLOADS_DIR=/no/such/storage-uploads \
            2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "uid 1001 container backup failed: ${out}"
    printf '%s\n' "${out}" | grep -q 'Backup completed successfully' || fail "uid 1001 container backup did not report success: ${out}"
    printf '%s\n' "${out}" | grep -q 'matches PostgreSQL server 16' || fail "uid 1001 container backup did not confirm the client major version: ${out}"
    printf '%s\n' "${out}" | grep -q 'Storage uploads directory does not exist: /no/such/storage-uploads' || fail "uid 1001 container did not warn for an absent storage path: ${out}"
    printf '%s\n' "${out}" | grep -q 'Continuing without it' || fail "uid 1001 container did not skip the absent storage path"
    if printf '%s\n' "${out}" | grep -q 'exists but is not accessible'; then
        fail "uid 1001 container reported an absent path as inaccessible"
    fi
    assert_absent "${out}" "${secret}"
    run_dir="$(sudo -n find "${container_backups}" -mindepth 1 -maxdepth 1 -type d -name 'grc-*' -print)"
    [ -n "${run_dir}" ] || fail "uid 1001 container did not create a backup directory"
    [ "$(printf '%s\n' "${run_dir}" | wc -l)" -eq 1 ] || fail "uid 1001 container created more than one backup directory"
    sudo -n bash -c "cd -- $(printf '%q' "${run_dir}") && sha256sum -c SHA256SUMS" || fail "uid 1001 container backup checksums did not verify"
    sudo -n tar -tzf "${run_dir}/uploads.tgz" | grep -q 'clients/1/policy.pdf' || fail "uid 1001 container archive is missing the fictional upload"
    [ ! -e "${run_dir}/storage-uploads.tgz" ] || fail "uid 1001 container archived an absent storage path"
    sudo -n "${PG_BIN}/pg_restore" -l "${run_dir}/db.dump" | grep -q 'policy_notes' || fail "uid 1001 container dump is missing the fictional table"
    rm -rf -- "${secret_dir}"
    [ ! -e "${secret_dir}" ] || fail "password copy was left on disk"
    printf '%s\n' "docker uid 1001 password copy backup: ok"

    cat > "${wrapper}/pg_dump" <<'EOF'
#!/bin/sh
set -eu
if [ "${1:-}" = "--version" ]; then
    exec sudo -n docker run --rm --entrypoint pg_dump postgres:17 --version
fi
printf '%s\n' "$*" >> "${WRAPPER_LOG:?}"
printf '%s\n' "pg_dump 17 should not dump" >&2
exit 99
EOF
    cat > "${wrapper}/pg_restore" <<'EOF'
#!/bin/sh
set -eu
if [ "${1:-}" = "--version" ]; then
    exec sudo -n docker run --rm --entrypoint pg_restore postgres:17 --version
fi
printf '%s\n' "$*" >> "${WRAPPER_LOG:?}"
printf '%s\n' "pg_restore 17 should not restore" >&2
exit 99
EOF
    chmod 755 "${wrapper}" "${wrapper}/pg_dump" "${wrapper}/pg_restore"
    : > "${wrapper_log}"
    chmod 666 "${wrapper_log}"
    set +e
    out="$(
        WRAPPER_LOG="${wrapper_log}" \
        DB_PASSWORD_FILE="${PASS}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_NAME=grcompliance \
        DB_USER=grc \
        BACKUP_DIR="${WORK}/mismatch-backups" \
        BACKUP_RETENTION_DAYS=0 \
        UPLOADS_DIR="${WORK}/readable-uploads" \
        STORAGE_UPLOADS_DIR="${WORK}/missing-storage" \
        PATH="${wrapper}:${client_path}" \
        bash "${BACKUP}" --allow-version-mismatch 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "Postgres 17 pg_dump was allowed against the pg16 container"
    printf '%s\n' "${out}" | grep -q 'transaction_timeout' || fail "version mismatch did not name transaction_timeout: ${out}"
    printf '%s\n' "${out}" | grep -q 'not safe to override' || fail "newer pg_dump override was accepted: ${out}"
    [ ! -e "${WORK}/mismatch-backups" ] || fail "version mismatch left a backup directory behind"
    [ ! -s "${wrapper_log}" ] || fail "version mismatch still ran pg_dump"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "docker newer pg_dump refusal: ok"

    set +e
    out="$(
        as_1001 \
            DB_PASSWORD_FILE="${WORK}/db-password-1001" \
            DB_HOST=127.0.0.1 \
            DB_PORT="${PORT}" \
            DB_NAME=grcompliance \
            DB_USER=grc \
            BACKUP_DIR="${backup_parent}/backups" \
            BACKUP_RETENTION_DAYS=0 \
            UPLOADS_DIR="${uploads}" \
            STORAGE_UPLOADS_DIR="${storage}" \
            PATH="${client_path}" \
            bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "backup as uid 1001 failed: ${out}"
    printf '%s\n' "${out}" | grep -q 'matches PostgreSQL server 16' || fail "backup did not confirm the client major version: ${out}"
    assert_absent "${out}" "${secret}"
    run_dir="$(sudo -n find "${backup_parent}/backups" -mindepth 1 -maxdepth 1 -type d -name 'grc-*' -print)"
    [ -n "${run_dir}" ] || fail "backup directory was not created"
    sudo -n bash -c "cd -- $(printf '%q' "${run_dir}") && sha256sum -c SHA256SUMS" || fail "backup checksums did not verify"
    copy="${WORK}/backup-copy"
    sudo -n cp -a "${run_dir}" "${copy}"
    sudo -n chown -R "$(id -u):$(id -g)" "${copy}"
    chmod 700 "${copy}"
    printf '%s\n' "docker backup as uid 1001: ok"

    : > "${wrapper_log}"
    set +e
    out="$(
        WRAPPER_LOG="${wrapper_log}" \
        DB_PASSWORD_FILE="${PASS}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_USER=grc \
        TARGET_DB=grcompliance_restore \
        PATH="${wrapper}:${client_path}" \
        bash "${RESTORE}" --allow-version-mismatch "${copy}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "Postgres 17 pg_restore was allowed against the pg16 container"
    printf '%s\n' "${out}" | grep -q 'transaction_timeout' || fail "pg_restore mismatch did not name transaction_timeout: ${out}"
    printf '%s\n' "${out}" | grep -q 'not safe to override' || fail "newer pg_restore override was accepted: ${out}"
    [ ! -s "${wrapper_log}" ] || fail "version mismatch still ran pg_restore"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "docker newer pg_restore refusal: ok"

    set +e
    out="$(
        DB_PASSWORD_FILE="${PASS}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_USER=grc \
        TARGET_DB=grcompliance_restore \
        PATH="${client_path}" \
        bash "${RESTORE}" "${copy}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "restore without the vector extension succeeded: ${out}"
    printf '%s\n' "${out}" | grep -F -q 'CREATE EXTENSION IF NOT EXISTS vector;' || fail "missing vector message did not name the command: ${out}"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "docker missing vector refusal: ok"

    sudo -n docker exec "${CONTAINER}" psql -U postgres -d grcompliance_restore -v ON_ERROR_STOP=1 -X -q \
        -c "CREATE EXTENSION IF NOT EXISTS vector;"

    set +e
    out="$(
        DB_PASSWORD_FILE="${PASS}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_USER=grc \
        TARGET_DB=grcompliance_restore \
        UPLOADS_RESTORE_DIR="${WORK}/restored-uploads" \
        STORAGE_UPLOADS_RESTORE_DIR="${WORK}/restored-storage" \
        PATH="${client_path}" \
        bash "${RESTORE}" "${copy}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "restore as non-superuser failed: ${out}"
    printf '%s\n' "${out}" | grep -q 'CREATE EXTENSION entry will be skipped' || fail "restore did not skip the existing vector extension: ${out}"
    assert_absent "${out}" "${secret}"
    restored_row="$(psql_grc grcompliance_restore -tAc "SELECT body = 'Fictional access-control note for the backup test' AND embedding = '[0.25,0.50,0.75]'::vector FROM policy_notes WHERE id = 1")"
    restored_row="${restored_row//[[:space:]]/}"
    [ "${restored_row}" = "t" ] || fail "restored fictional row did not match"
    [ "$(cat "${WORK}/restored-uploads/clients/1/policy.pdf")" = "fictional-evidence-bytes" ] || fail "restored upload did not match"
    [ "$(cat "${WORK}/restored-storage/reports/gap.pdf")" = "fictional-report-bytes" ] || fail "restored storage upload did not match"
    printf '%s\n' "docker restore as non-superuser: ok"
    printf '%s\n' "docker e2e backup and restore passed"
}

main "$@"
