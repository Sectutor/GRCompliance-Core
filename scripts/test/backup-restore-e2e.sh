#!/usr/bin/env bash
# Throwaway end-to-end check for scripts/backup.sh and scripts/restore.sh.
#
# Starts a private Postgres 16 cluster with pgvector, loads fictional rows,
# and runs backup then restore. The database password is generated at runtime
# into a mode-0600 file and is never printed. This script does not contain a
# password or any live data.
#
# Requires PostgreSQL 16 client and server binaries, the pgvector package,
# and permission to run a process as uid 1001 (sudo setpriv).
set -euo pipefail
set +x

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP="${ROOT}/scripts/backup.sh"
RESTORE="${ROOT}/scripts/restore.sh"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${E2E_PORT:-55432}"

fail() {
    printf '%s\n' "$*" >&2
    exit 1
}

need() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

WORK=""
DATA=""
PASS_UBUNTU=""
cleanup() {
    local status=$?
    set +e
    if [ -n "${DATA}" ] && [ -d "${DATA}" ] && [ -x "${PG_BIN}/pg_ctl" ]; then
        "${PG_BIN}/pg_ctl" -D "${DATA}" -m fast stop >/dev/null 2>&1
    fi
    if [ -n "${WORK}" ] && [ -d "${WORK}" ]; then
        sudo -n rm -rf -- "${WORK}"
    fi
    exit "${status}"
}
trap cleanup EXIT

# Remaining args are psql args. The password comes from the mode-0600 file
# via a PGPASSFILE kept inside the work directory.
psql_grc() {
    local database="$1"
    shift
    local pgpass="${WORK}/pgpass-grc"
    python3 - "${pgpass}" "${PASS_UBUNTU}" "${PORT}" "${database}" <<'PY'
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

write_role_sql() {
    local dest="$1"
    python3 - "${dest}" "${PASS_UBUNTU}" <<'PY'
import pathlib, sys
dest, passfile = sys.argv[1:]
password = pathlib.Path(passfile).read_text().strip().replace("'", "''")
pathlib.Path(dest).write_text(
    "CREATE ROLE grc NOSUPERUSER NOCREATEDB NOCREATEROLE LOGIN PASSWORD '"
    + password
    + "';\n"
    "CREATE DATABASE grcompliance OWNER grc;\n"
    "CREATE DATABASE grcompliance_restore OWNER grc;\n"
)
PY
}

as_1001() {
    sudo -n setpriv --reuid=1001 --regid=1001 --clear-groups --inh-caps=-all env "$@"
}

assert_absent() {
    local haystack="$1"
    local needle="$2"
    if printf '%s\n' "${haystack}" | grep -F -q -- "${needle}"; then
        fail "output contains the generated database password"
    fi
}

main() {
    local pass_sql=""
    local out=""
    local status=0
    local run_dir=""
    local secret=""
    local uploads=""
    local storage=""
    local readable_uploads=""
    local backup_parent=""
    local denied_parent=""
    local wrapper=""
    local wrapper_log=""
    local restore_uploads=""
    local client_path=""
    local toc=""

    need python3
    need sudo
    need openssl
    [ -x "${PG_BIN}/initdb" ] || fail "PostgreSQL 16 initdb not found at ${PG_BIN}/initdb"
    [ -x "${PG_BIN}/pg_ctl" ] || fail "PostgreSQL 16 pg_ctl not found"
    [ -f /usr/share/postgresql/16/extension/vector.control ] || fail "pgvector control file for PostgreSQL 16 is not installed"
    sudo -n setpriv --reuid=1001 --regid=1001 --clear-groups --inh-caps=-all true \
        || fail "cannot run a process as uid 1001"

    WORK="$(mktemp -d)"
    chmod 755 "${WORK}"
    DATA="${WORK}/pgdata"
    PASS_UBUNTU="${WORK}/db-password"
    PASS_1001="${WORK}/db-password-1001"
    uploads="${WORK}/uploads"
    storage="${WORK}/storage-uploads"
    readable_uploads="${WORK}/readable-uploads"
    backup_parent="${WORK}/for-uid-1001"
    denied_parent="${WORK}/denied-backups"
    wrapper="${WORK}/pg17"
    wrapper_log="${WORK}/wrapper.log"
    restore_uploads="${backup_parent}/restored-uploads"
    pass_sql="${WORK}/create-role.sql"
    toc="${WORK}/toc.txt"

    umask 077
    openssl rand -base64 24 | tr -d '\n' > "${PASS_UBUNTU}"
    chmod 600 "${PASS_UBUNTU}"
    secret="$(cat -- "${PASS_UBUNTU}")"
    [ -n "${secret}" ] || fail "generated password was empty"
    cp -- "${PASS_UBUNTU}" "${PASS_1001}"
    sudo -n chown 1001:1001 "${PASS_1001}"
    sudo -n chmod 600 "${PASS_1001}"

    mkdir -p "${uploads}/clients/1" "${storage}/reports" "${readable_uploads}" "${backup_parent}" "${wrapper}"
    printf '%s\n' 'fictional-evidence-bytes' > "${uploads}/clients/1/policy.pdf"
    printf '%s\n' 'fictional-report-bytes' > "${storage}/reports/gap.pdf"
    chmod 700 "${uploads}" "${uploads}/clients" "${uploads}/clients/1" "${storage}" "${storage}/reports"
    chmod 600 "${uploads}/clients/1/policy.pdf" "${storage}/reports/gap.pdf"
    sudo -n chown -R 1001:1001 "${uploads}" "${storage}" "${PASS_1001}" "${backup_parent}"

    "${PG_BIN}/initdb" -D "${DATA}" -U postgres --pwfile="${PASS_UBUNTU}" \
        --auth-local=trust --auth-host=scram-sha-256 --no-instructions
    "${PG_BIN}/pg_ctl" -D "${DATA}" -l "${WORK}/postgres.log" -w start \
        -o "-c listen_addresses=127.0.0.1 -c port=${PORT} -c unix_socket_directories=${DATA}" \
        || {
            cat "${WORK}/postgres.log" >&2 || true
            fail "Postgres did not start"
        }

    write_role_sql "${pass_sql}"
    chmod 600 "${pass_sql}"
    "${PG_BIN}/psql" -h "${DATA}" -p "${PORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q -f "${pass_sql}"
    rm -f -- "${pass_sql}"
    "${PG_BIN}/psql" -h "${DATA}" -p "${PORT}" -U postgres -d grcompliance -v ON_ERROR_STOP=1 -X -q \
        -c "CREATE EXTENSION IF NOT EXISTS vector;"

    if [ "$("${PG_BIN}/psql" -h "${DATA}" -p "${PORT}" -U postgres -d postgres -X -q -tAc "SELECT rolsuper FROM pg_roles WHERE rolname = 'grc'")" != "f" ]; then
        fail "role grc is a superuser; this test needs a non-superuser owner"
    fi

    psql_grc grcompliance -c "CREATE TABLE policy_notes (id integer PRIMARY KEY, body text NOT NULL, embedding vector(3));"
    psql_grc grcompliance -c "INSERT INTO policy_notes (id, body, embedding) VALUES (1, 'Fictional access-control note for the backup test', '[0.25,0.50,0.75]');"

    client_path="${PG_BIN}:${PATH}"

    set +e
    out="$(
        DB_PASSWORD_FILE="${PASS_UBUNTU}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_NAME=grcompliance \
        DB_USER=grc \
        BACKUP_DIR="${denied_parent}" \
        BACKUP_RETENTION_DAYS=0 \
        UPLOADS_DIR="${uploads}" \
        STORAGE_UPLOADS_DIR="${storage}" \
        PATH="${client_path}" \
        bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "backup as uid $(id -u) read uploads owned by uid 1001"
    printf '%s\n' "${out}" | grep -q 'not readable by this user' || fail "unreadable uploads were not explained: ${out}"
    printf '%s\n' "${out}" | grep -q 'uid 1001' || fail "unreadable uploads message did not name uid 1001"
    printf '%s\n' "${out}" | grep -q 'world-readable' || fail "unreadable uploads message did not forbid a world-readable mode"
    [ ! -e "${denied_parent}" ] || fail "unreadable uploads left a backup directory behind"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "permission refusal: ok"

    cat > "${wrapper}/pg_dump" <<'EOF'
#!/bin/sh
set -eu
if [ "${1:-}" = "--version" ]; then
    printf '%s\n' "pg_dump (PostgreSQL) 17.2"
    exit 0
fi
printf '%s\n' "$*" >> "${WRAPPER_LOG:?}"
printf '%s\n' "pg_dump wrapper should not dump" >&2
exit 99
EOF
    cat > "${wrapper}/pg_restore" <<'EOF'
#!/bin/sh
set -eu
if [ "${1:-}" = "--version" ]; then
    printf '%s\n' "pg_restore (PostgreSQL) 17.2"
    exit 0
fi
printf '%s\n' "$*" >> "${WRAPPER_LOG:?}"
printf '%s\n' "pg_restore wrapper should not restore" >&2
exit 99
EOF
    chmod 755 "${wrapper}" "${wrapper}/pg_dump" "${wrapper}/pg_restore"
    : > "${wrapper_log}"
    set +e
    out="$(
        WRAPPER_LOG="${wrapper_log}" \
        DB_PASSWORD_FILE="${PASS_UBUNTU}" \
        DB_HOST=127.0.0.1 \
        DB_PORT="${PORT}" \
        DB_NAME=grcompliance \
        DB_USER=grc \
        BACKUP_DIR="${WORK}/mismatch-backups" \
        BACKUP_RETENTION_DAYS=0 \
        UPLOADS_DIR="${readable_uploads}" \
        STORAGE_UPLOADS_DIR="${WORK}/missing-storage" \
        PATH="${wrapper}:${client_path}" \
        bash "${BACKUP}" --allow-version-mismatch 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "Postgres 17 pg_dump was allowed against Postgres 16"
    printf '%s\n' "${out}" | grep -q 'transaction_timeout' || fail "version mismatch did not name transaction_timeout: ${out}"
    printf '%s\n' "${out}" | grep -q 'does not match PostgreSQL server' || fail "version mismatch was not explained: ${out}"
    printf '%s\n' "${out}" | grep -q 'not safe to override' || fail "newer pg_dump override was accepted: ${out}"
    [ ! -e "${WORK}/mismatch-backups" ] || fail "version mismatch left a backup directory behind"
    [ ! -s "${wrapper_log}" ] || fail "version mismatch still ran pg_dump"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "newer pg_dump refusal: ok"

    set +e
    out="$(
        as_1001 \
            DB_PASSWORD_FILE="${PASS_1001}" \
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
    printf '%s\n' "${out}" | grep -q 'Backup completed successfully' || fail "backup did not report success"
    printf '%s\n' "${out}" | grep -q 'matches PostgreSQL server 16' || fail "backup did not confirm the client major version"
    assert_absent "${out}" "${secret}"
    run_dir="$(sudo -n find "${backup_parent}/backups" -mindepth 1 -maxdepth 1 -type d -name 'grc-*' -print)"
    [ -n "${run_dir}" ] || fail "backup directory was not created"
    [ "$(printf '%s\n' "${run_dir}" | wc -l)" -eq 1 ] || fail "expected one backup directory"
    sudo -n bash -c "cd -- $(printf '%q' "${run_dir}") && sha256sum -c SHA256SUMS" || fail "backup checksums did not verify"
    sudo -n tar -tzf "${run_dir}/uploads.tgz" | grep -q 'clients/1/policy.pdf' || fail "uploads archive is missing the fictional file"
    sudo -n "${PG_BIN}/pg_restore" -l "${run_dir}/db.dump" | cat > "${toc}"
    grep -E 'EXTENSION - vector([[:space:]]|$)' "${toc}" || fail "dump does not list the vector extension: $(cat "${toc}")"
    printf '%s\n' "backup as uid 1001: ok"
    printf '%s\n' "toc extension lines:"
    grep -E 'EXTENSION|COMMENT - EXTENSION' "${toc}" || true

    : > "${wrapper_log}"
    chmod 666 "${wrapper_log}"
    set +e
    out="$(
        as_1001 \
            WRAPPER_LOG="${wrapper_log}" \
            DB_PASSWORD_FILE="${PASS_1001}" \
            DB_HOST=127.0.0.1 \
            DB_PORT="${PORT}" \
            DB_USER=grc \
            TARGET_DB=grcompliance_restore \
            PATH="${wrapper}:${client_path}" \
            bash "${RESTORE}" --allow-version-mismatch "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "Postgres 17 pg_restore was allowed against Postgres 16"
    printf '%s\n' "${out}" | grep -q 'transaction_timeout' || fail "pg_restore mismatch did not name transaction_timeout: ${out}"
    printf '%s\n' "${out}" | grep -q 'not safe to override' || fail "newer pg_restore override was accepted: ${out}"
    [ ! -s "${wrapper_log}" ] || fail "version mismatch still ran pg_restore"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "newer pg_restore refusal: ok"

    set +e
    out="$(
        as_1001 \
            DB_PASSWORD_FILE="${PASS_1001}" \
            DB_HOST=db \
            DB_PORT="${PORT}" \
            DB_USER=grc \
            TARGET_DB=grcompliance_restore \
            PATH="${client_path}" \
            bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "restore on host db was allowed"
    printf '%s\n' "${out}" | grep -q 'GRCompliance treats this host as production' || fail "production guard did not run: ${out}"
    assert_absent "${out}" "${secret}"

    set +e
    out="$(
        as_1001 \
            DB_PASSWORD_FILE="${PASS_1001}" \
            DB_HOST=127.0.0.1 \
            DB_PORT="${PORT}" \
            DB_USER=grc \
            TARGET_DB=grcompliance_restore \
            UPLOADS_RESTORE_DIR="${restore_uploads}" \
            PATH="${client_path}" \
            bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "restore without the vector extension succeeded: ${out}"
    printf '%s\n' "${out}" | grep -F -q 'CREATE EXTENSION IF NOT EXISTS vector;' || fail "missing vector message did not name the command: ${out}"
    printf '%s\n' "${out}" | grep -q 'superuser' || fail "missing vector message did not mention a superuser: ${out}"
    [ ! -e "${restore_uploads}" ] || fail "failed restore created the uploads directory"
    table_count="$("${PG_BIN}/psql" -h "${DATA}" -p "${PORT}" -U postgres -d grcompliance_restore -X -q -tAc "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname = 'public'")"
    table_count="${table_count//[[:space:]]/}"
    [ "${table_count}" = "0" ] || fail "failed restore wrote user tables"
    assert_absent "${out}" "${secret}"
    printf '%s\n' "missing vector refusal: ok"

    "${PG_BIN}/psql" -h "${DATA}" -p "${PORT}" -U postgres -d grcompliance_restore -v ON_ERROR_STOP=1 -X -q \
        -c "CREATE EXTENSION IF NOT EXISTS vector;"

    set +e
    out="$(
        as_1001 \
            DB_PASSWORD_FILE="${PASS_1001}" \
            DB_HOST=127.0.0.1 \
            DB_PORT="${PORT}" \
            DB_USER=grc \
            TARGET_DB=grcompliance_restore \
            UPLOADS_RESTORE_DIR="${restore_uploads}" \
            STORAGE_UPLOADS_RESTORE_DIR="${backup_parent}/restored-storage" \
            PATH="${client_path}" \
            bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "restore as non-superuser failed: ${out}"
    printf '%s\n' "${out}" | grep -q 'Restore completed successfully' || fail "restore did not report success"
    printf '%s\n' "${out}" | grep -q 'CREATE EXTENSION entry will be skipped' || fail "restore did not skip the existing vector extension"
    assert_absent "${out}" "${secret}"
    restored_row="$(psql_grc grcompliance_restore -tAc "SELECT body = 'Fictional access-control note for the backup test' AND embedding = '[0.25,0.50,0.75]'::vector FROM policy_notes WHERE id = 1")"
    restored_row="${restored_row//[[:space:]]/}"
    [ "${restored_row}" = "t" ] || fail "restored fictional row did not match"
    [ "$(sudo -n cat "${restore_uploads}/clients/1/policy.pdf")" = "fictional-evidence-bytes" ] || fail "restored upload did not match"
    [ "$(sudo -n cat "${backup_parent}/restored-storage/reports/gap.pdf")" = "fictional-report-bytes" ] || fail "restored storage upload did not match"
    printf '%s\n' "restore as non-superuser: ok"
    printf '%s\n' "e2e backup and restore passed"
}

main "$@"
