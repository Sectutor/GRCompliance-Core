#!/usr/bin/env bash
# Static and stubbed checks for scripts/backup.sh and scripts/restore.sh.
# Runs shellcheck, rejects password literals under scripts/, and exercises
# both scripts with stand-ins so nothing connects to a real database.
set -euo pipefail
set +x

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP="${ROOT}/scripts/backup.sh"
RESTORE="${ROOT}/scripts/restore.sh"

fail() {
    printf '%s\n' "$*" >&2
    exit 1
}

need() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

# A password variable must not gain a literal default, and a password
# assignment in a shell script must not use a literal value.
# ${VAR}, ${VAR:-}, ${VAR:-$(...)}, and ${VAR:?message} stay allowed.
# The application database name may still default; that is not a password.
scan_password_literals() {
    local file=""
    local line=""
    local value=""
    local found=0
    local hits=""
    local where=""
    local default_re='\$\{[A-Za-z_][A-Za-z0-9_]*(PASSWORD|PASSWD|PGPASSWORD|PGPASS)[A-Za-z0-9_]*(:-|-)[^}$[:space:]][^}]*\}'
    local expansion_re='\$\{[A-Za-z_][A-Za-z0-9_]*(PASSWORD|PASSWD|PGPASSWORD|PGPASS)[A-Za-z0-9_]*(:-|-)(\$\{|\$\()'

    hits="$(grep -RInE --binary-files=without-match -e "${default_re}" "${ROOT}/scripts" || true)"
    if [ -n "${hits}" ]; then
        while IFS= read -r line; do
            [ -n "${line}" ] || continue
            if printf '%s\n' "${line}" | grep -Eq "${expansion_re}"; then
                continue
            fi
            where="${line%%:*}"
            line="${line#*:}"
            where="${where}:${line%%:*}"
            printf '%s\n' "${where}: password variable has a literal default" >&2
            found=1
        done <<< "${hits}"
    fi

    while IFS= read -r -d '' file; do
        while IFS= read -r line || [ -n "${line}" ]; do
            if [[ "${line}" =~ (^|[[:space:]])([A-Za-z_][A-Za-z0-9_]*(PASSWORD|PASSWD|PGPASSWORD))[[:space:]]*=[[:space:]]*(.*) ]]; then
                value="${BASH_REMATCH[4]}"
                if [ -z "${value}" ] || [[ "${value}" == \#* ]]; then
                    continue
                fi
                if [[ "${value}" == \$* || "${value}" == \"\$* || "${value}" == \'\$* ]]; then
                    continue
                fi
                if [[ "${value}" == \"\"* || "${value}" == \'\'* ]]; then
                    continue
                fi
                printf '%s\n' "${file}: password assigned a literal value" >&2
                found=1
            fi
        done < "${file}"
    done < <(find "${ROOT}/scripts" -type f \( -name '*.sh' -o -name '*.bash' \) -print0)

    [ "${found}" -eq 0 ]
}

assert_source_rules() {
    # Match the SQL statement. The plural "databases" in help text is not a statement.
    if grep -nE -i 'drop[[:space:]]+database([^[:alpha:]]|$)' "${BACKUP}" "${RESTORE}"; then
        fail "backup or restore contains DROP DATABASE"
    fi
    if grep -n '2>/dev/null' "${BACKUP}" "${RESTORE}"; then
        fail "backup or restore hides stderr"
    fi
    if grep -n 'OneDrive' "${BACKUP}" "${RESTORE}"; then
        fail "backup or restore contains a hardcoded OneDrive path"
    fi
    if grep -n 'md5sum' "${BACKUP}" "${RESTORE}"; then
        fail "backup or restore still uses md5sum"
    fi
    grep -q -- '-Fc' "${BACKUP}" || fail "backup.sh does not pass -Fc to pg_dump"
    grep -q 'sha256sum' "${BACKUP}" || fail "backup.sh does not write a sha256 checksum"
    grep -q 'checksums\.sha256' "${BACKUP}" || fail "backup.sh does not write a .sha256 file"
    grep -q 'sha256sum -c' "${RESTORE}" || fail "restore.sh does not run sha256sum -c"
    grep -q -- '--exit-on-error' "${RESTORE}" || fail "restore.sh does not pass --exit-on-error"
    grep -q -- '--no-owner' "${RESTORE}" || fail "restore.sh does not pass --no-owner"
    grep -q -- '--no-acl' "${RESTORE}" || fail "restore.sh does not pass --no-acl"
    grep -q 'ON_ERROR_STOP=1' "${RESTORE}" || fail "restore.sh does not set ON_ERROR_STOP"
    grep -q -- '--force-prod' "${RESTORE}" || fail "restore.sh does not implement --force-prod"
    grep -q 'uploads\.tgz' "${BACKUP}" || fail "backup.sh does not archive uploads.tgz"
    grep -q 'storage-uploads\.tgz' "${BACKUP}" || fail "backup.sh does not archive storage-uploads.tgz"
    grep -q '/app/uploads' "${BACKUP}" || fail "backup.sh does not default uploads to /app/uploads"
    grep -q '/app/storage/uploads' "${BACKUP}" || fail "backup.sh does not default the readiness uploads path"
    grep -q 'UPLOADS_RESTORE_DIR' "${RESTORE}" || fail "restore.sh does not require an uploads target"
    grep -q -- '--uploads-dir' "${RESTORE}" || fail "restore.sh does not accept --uploads-dir"
    grep -q 'GRCompliance treats this host as production' "${RESTORE}" || fail "production guard does not name GRCompliance"
}

run_static_checks() {
    need shellcheck
    need bash
    bash -n "${BACKUP}"
    bash -n "${RESTORE}"
    bash -n "${BASH_SOURCE[0]}"
    shellcheck "${BACKUP}" "${RESTORE}" "${BASH_SOURCE[0]}"
    scan_password_literals || fail "password literal scan failed"
    assert_source_rules
    printf '%s\n' "static checks passed"
}

write_stubs() {
    local bin="$1"
    mkdir -p "${bin}"
    cat > "${bin}/pg_dump" <<'EOF'
#!/bin/sh
set -eu
echo "stub-stderr-visible" >&2
if [ "${FAIL_PG_DUMP:-0}" = "1" ]; then
    echo "stub-dump-failed" >&2
    exit 1
fi
out=""
prev=""
for arg in "$@"; do
    if [ "$prev" = "-f" ]; then
        out=$arg
    fi
    prev=$arg
done
if [ -z "$out" ]; then
    echo "pg_dump stub: missing -f" >&2
    exit 1
fi
printf 'PGDMP' > "$out"
printf '%s\n' "$*" >> "${STUB_LOG:?}"
EOF
    cat > "${bin}/pg_restore" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$*" >> "${PG_RESTORE_LOG:?}"
EOF
    cat > "${bin}/psql" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$*" >> "${PSQL_LOG:?}"
query=""
prev=""
for arg in "$@"; do
    if [ "$prev" = "-tAc" ]; then
        query=$arg
    fi
    prev=$arg
done
case "$query" in
    "SELECT 1")
        if [ "${PSQL_DB_EXISTS:-1}" != "1" ]; then
            echo "psql: database does not exist" >&2
            exit 1
        fi
        printf '%s\n' "1"
        ;;
    *count\(*)
        printf '%s\n' "${PSQL_TABLE_COUNT:-0}"
        ;;
    "")
        printf '%s\n' "stub-psql"
        ;;
    *)
        echo "psql stub: unexpected query" >&2
        exit 1
        ;;
esac
EOF
    chmod 755 "${bin}/pg_dump" "${bin}/pg_restore" "${bin}/psql"
}

assert_mode() {
    local path="$1"
    local want="$2"
    local got=""
    got="$(stat -c '%a' -- "${path}")"
    [ "${got}" = "${want}" ] || fail "${path} mode ${got}, want ${want}"
}

assert_absent() {
    local haystack="$1"
    local needle="$2"
    if printf '%s\n' "${haystack}" | grep -F -q -- "${needle}"; then
        fail "output contains a secret value"
    fi
}

run_behavior() {
    local work=""
    local bin=""
    local auth=""
    local backup_dir=""
    local outside=""
    local secret_file=""
    local stub_log=""
    local psql_log=""
    local restore_log=""
    local out=""
    local status=0
    local run_dir=""
    local env_path=""

    need tar
    need sha256sum
    need stat
    need find

    work="$(mktemp -d)"
    # shellcheck disable=SC2064
    trap "rm -rf -- '${work}'" EXIT
    bin="${work}/bin"
    auth="${work}/auth/.complianceos"
    uploads="${work}/uploads"
    storage_uploads="${work}/storage-uploads"
    backup_dir="${work}/backups"
    outside="${work}/outside"
    secret_file="${work}/db-password"
    stub_log="${work}/pg_dump.log"
    psql_log="${work}/psql.log"
    restore_log="${work}/pg_restore.log"
    write_stubs "${bin}"
    mkdir -p "${auth}" "${uploads}/clients/1" "${storage_uploads}/reports" "${outside}/grc-old" "${backup_dir}/grc-old" "${backup_dir}/backup_old"
    printf '%s\n' 'evidence-bytes' > "${uploads}/clients/1/policy.pdf"
    printf '%s\n' 'report-bytes' > "${storage_uploads}/reports/gap.pdf"
    printf '%s\n' '{"users":[]}' > "${auth}/local-users.json"
    printf '%s\n' 'local-only' > "${secret_file}"
    chmod 600 "${secret_file}"
    printf '%s\n' 'keep' > "${backup_dir}/keep.txt"
    touch -d '20 days ago' "${backup_dir}/grc-old" "${backup_dir}/backup_old" "${backup_dir}/keep.txt" "${outside}/grc-old"
    env_path="${bin}:${PATH}"

    out="$(bash "${BACKUP}" --help)" || fail "backup --help failed"
    printf '%s\n' "${out}" | grep -q 'DB_PASSWORD' || fail "backup --help missing password instructions"

    out="$(bash "${RESTORE}" --help)" || fail "restore --help failed"
    printf '%s\n' "${out}" | grep -q 'TARGET_DB' || fail "restore --help missing TARGET_DB"
    printf '%s\n' "${out}" | grep -q 'GRCompliance' || fail "restore --help did not name GRCompliance"
    printf '%s\n' "${out}" | grep -q -- '--uploads-dir' || fail "restore --help missing --uploads-dir"
    printf '%s\n' "${out}" | grep -q 'PROTECTED_DB_HOSTS' || fail "restore --help missing PROTECTED_DB_HOSTS"

    set +e
    out="$(DB_HOST=127.0.0.1 DB_PORT=1 PATH="${env_path}" bash "${BACKUP}" 2>&1)"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "backup without a password exited 0"
    printf '%s\n' "${out}" | grep -q 'DB_PASSWORD is required' || fail "backup did not explain the missing password"

    set +e
    out="$(DB_HOST=127.0.0.1 DB_PORT=1 PATH="${env_path}" bash "${RESTORE}" 2>&1)"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "restore without a password exited 0"
    printf '%s\n' "${out}" | grep -q 'DB_PASSWORD is required' || fail "restore did not explain the missing password"

    chmod 000 "${secret_file}"
    set +e
    out="$(DB_PASSWORD_FILE="${secret_file}" DB_HOST=127.0.0.1 PATH="${env_path}" bash "${BACKUP}" 2>&1)"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "unreadable password file was accepted"
    printf '%s\n' "${out}" | grep -q 'cannot be read' || fail "unreadable password file was not explained"
    assert_absent "${out}" "local-only"
    chmod 600 "${secret_file}"

    umask 022
    : > "${stub_log}"
    set +e
    out="$(
        STUB_LOG="${stub_log}" \
        FAIL_PG_DUMP=1 \
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        BACKUP_DIR="${work}/failed-backups" \
        AUTH_DIR="${auth}" \
        PATH="${env_path}" \
        bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "failed pg_dump was treated as success"
    printf '%s\n' "${out}" | grep -q 'stub-dump-failed' || fail "pg_dump stderr was hidden"
    assert_absent "${out}" "local-only"
    [ ! -d "${work}/failed-backups" ] || [ -z "$(find "${work}/failed-backups" -mindepth 1 -name 'grc-*' -print -quit)" ] || fail "partial backup was kept"

    : > "${stub_log}"
    set +e
    out="$(
        STUB_LOG="${stub_log}" \
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        BACKUP_DIR="${backup_dir}" \
        BACKUP_RETENTION_DAYS=14 \
        AUTH_DIR="${auth}" \
        UPLOADS_DIR="${uploads}" \
        STORAGE_UPLOADS_DIR="${storage_uploads}" \
        PATH="${env_path}" \
        bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "backup failed: ${out}"
    printf '%s\n' "${out}" | grep -q 'stub-stderr-visible' || fail "pg_dump stderr was hidden on success"
    printf '%s\n' "${out}" | grep -q 'Backup completed successfully' || fail "backup did not report success"
    assert_absent "${out}" "local-only"
    [ ! -d "${backup_dir}/grc-old" ] || fail "retention left an old grc-* directory"
    [ -d "${backup_dir}/backup_old" ] || fail "retention deleted a directory outside the grc-* pattern"
    [ -f "${backup_dir}/keep.txt" ] || fail "retention deleted an unrelated file"
    [ -d "${outside}/grc-old" ] || fail "retention deleted a grc-* directory outside BACKUP_DIR"
    run_dir="$(find "${backup_dir}" -mindepth 1 -maxdepth 1 -type d -name 'grc-*' -print)"
    [ -n "${run_dir}" ] || fail "backup directory was not created"
    [ "$(printf '%s\n' "${run_dir}" | wc -l)" -eq 1 ] || fail "expected one new backup directory"
    assert_mode "${run_dir}" "700"
    assert_mode "${run_dir}/db.dump" "600"
    assert_mode "${run_dir}/auth-volume.tgz" "600"
    assert_mode "${run_dir}/uploads.tgz" "600"
    assert_mode "${run_dir}/storage-uploads.tgz" "600"
    assert_mode "${run_dir}/SHA256SUMS" "600"
    assert_mode "${run_dir}/checksums.sha256" "600"
    [ "$(head -c 5 -- "${run_dir}/db.dump")" = "PGDMP" ] || fail "db.dump is not a custom-format dump"
    grep -q -- '-Fc' "${stub_log}" || fail "pg_dump was not called with -Fc"
    (cd -- "${run_dir}" && sha256sum -c SHA256SUMS) || fail "SHA256SUMS did not verify"
    (cd -- "${run_dir}" && sha256sum -c checksums.sha256) || fail "checksums.sha256 did not verify"
    tar -tzf "${run_dir}/auth-volume.tgz" | grep -q 'local-users.json' || fail "auth archive is missing local-users.json"
    tar -tzf "${run_dir}/uploads.tgz" | grep -q 'clients/1/policy.pdf' || fail "uploads archive is missing policy.pdf"
    tar -tzf "${run_dir}/storage-uploads.tgz" | grep -q 'reports/gap.pdf' || fail "storage uploads archive is missing gap.pdf"
    grep -q 'uploads.tgz' "${run_dir}/SHA256SUMS" || fail "SHA256SUMS does not list uploads.tgz"
    grep -q 'storage-uploads.tgz' "${run_dir}/SHA256SUMS" || fail "SHA256SUMS does not list storage-uploads.tgz"

    mkdir -p "${work}/keep-backups/grc-old"
    touch -d '20 days ago' "${work}/keep-backups/grc-old"
    : > "${stub_log}"
    set +e
    out="$(
        STUB_LOG="${stub_log}" \
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        BACKUP_DIR="${work}/keep-backups" \
        BACKUP_RETENTION_DAYS=0 \
        AUTH_DIR="${auth}" \
        PATH="${env_path}" \
        bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "retention disable failed: ${out}"
    [ -d "${work}/keep-backups/grc-old" ] || fail "BACKUP_RETENTION_DAYS=0 deleted an old backup"
    assert_absent "${out}" "local-only"

    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        PATH="${env_path}" \
        bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "restore without TARGET_DB exited 0"
    printf '%s\n' "${out}" | grep -q 'TARGET_DB is required' || fail "restore did not require TARGET_DB"
    assert_absent "${out}" "local-only"

    : > "${psql_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=db \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PSQL_LOG="${psql_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "restore onto host db was allowed"
    printf '%s\n' "${out}" | grep -q 'Refusing to restore' || fail "host db refusal was not explained"
    printf '%s\n' "${out}" | grep -q 'GRCompliance treats this host as production' || fail "production guard did not name GRCompliance"
    [ ! -s "${psql_log}" ] || fail "host db refusal still connected"

    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=db.prod.example \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PSQL_LOG="${psql_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" --force "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "--force bypassed a production-looking host"

    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=app-postgres \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PROTECTED_DB_HOSTS=app-postgres \
        PSQL_LOG="${psql_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "restore onto a PROTECTED_DB_HOSTS host was allowed"

    cp -a "${run_dir}" "${work}/bad-checksum"
    printf '%s\n' '0000000000000000000000000000000000000000000000000000000000000000  db.dump' > "${work}/bad-checksum/SHA256SUMS"
    cp -- "${work}/bad-checksum/SHA256SUMS" "${work}/bad-checksum/checksums.sha256"
    : > "${psql_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PSQL_LOG="${psql_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${work}/bad-checksum" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "checksum mismatch was restored"
    printf '%s\n' "${out}" | grep -q 'Checksum mismatch' || fail "checksum mismatch was not explained"
    [ ! -s "${psql_log}" ] || fail "checksum mismatch still connected"
    assert_absent "${out}" "local-only"

    : > "${psql_log}"
    : > "${restore_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PSQL_DB_EXISTS=0 \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "missing database was restored"
    printf '%s\n' "${out}" | grep -q 'does not create or drop' || fail "missing database was not explained"
    [ ! -s "${restore_log}" ] || fail "missing database still called pg_restore"

    : > "${psql_log}"
    : > "${restore_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PSQL_TABLE_COUNT=4 \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" --force "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "non-empty database was restored"
    printf '%s\n' "${out}" | grep -q 'not empty' || fail "non-empty database was not explained"
    [ ! -s "${restore_log}" ] || fail "--force restored into a non-empty database"

    auth_dest="${work}/auth-out"
    mkdir -p "${auth_dest}"
    printf '%s\n' 'keep-me' > "${auth_dest}/local-users.json"
    : > "${psql_log}"
    : > "${restore_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        AUTH_RESTORE_DIR="${auth_dest}" \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "non-empty auth directory was overwritten"
    printf '%s\n' "${out}" | grep -q 'Refusing to overwrite' || fail "auth overwrite was not explained"
    [ "$(cat "${auth_dest}/local-users.json")" = "keep-me" ] || fail "auth file was overwritten"
    [ ! -s "${psql_log}" ] || fail "auth refusal still connected"

    : > "${psql_log}"
    : > "${restore_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=db \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" --force-prod "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "--force-prod on an empty scratch database failed: ${out}"
    grep -q -- '--exit-on-error' "${restore_log}" || fail "pg_restore missing --exit-on-error"
    grep -q -- '--no-owner' "${restore_log}" || fail "pg_restore missing --no-owner"
    grep -q -- '--no-acl' "${restore_log}" || fail "pg_restore missing --no-acl"
    assert_absent "${out}" "local-only"
    if grep -F -q -- 'local-only' "${psql_log}" "${restore_log}" "${stub_log}"; then
        fail "command log contains a secret value"
    fi

    rm -rf -- "${auth_dest}"
    mkdir -p "${auth_dest}"
    : > "${psql_log}"
    : > "${restore_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        AUTH_RESTORE_DIR="${auth_dest}" \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "auth restore failed: ${out}"
    [ -f "${auth_dest}/local-users.json" ] || fail "auth file was not extracted"
    grep -q 'users' "${auth_dest}/local-users.json" || fail "auth file contents were not extracted"

    printf '%s\n' 'replaced' > "${auth_dest}/local-users.json"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        AUTH_RESTORE_DIR="${auth_dest}" \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" --force "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "--force auth restore failed: ${out}"
    grep -q 'users' "${auth_dest}/local-users.json" || fail "--force did not extract the auth archive"

    plain="${work}/plain"
    mkdir -p "${plain}"
    printf '%s\n' 'SELECT 1;' > "${plain}/plain.sql"
    (
        cd -- "${plain}"
        sha256sum plain.sql > SHA256SUMS
        cp -- SHA256SUMS checksums.sha256
    )
    : > "${psql_log}"
    : > "${restore_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=product.example \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${plain}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "plain sql restore failed: ${out}"
    grep -q 'ON_ERROR_STOP=1' "${psql_log}" || fail "psql was not run with ON_ERROR_STOP=1"
    grep -q 'plain.sql' "${psql_log}" || fail "psql was not given the sql file"
    [ ! -s "${restore_log}" ] || fail "plain sql restore called pg_restore"
    assert_absent "${out}" "local-only"

    python3 - "${work}/evil.tgz" <<'PY'
import io, sys, tarfile
path = sys.argv[1]
with tarfile.open(path, "w:gz") as archive:
    info = tarfile.TarInfo("../escaped")
    payload = b"nope"
    info.size = len(payload)
    archive.addfile(info, io.BytesIO(payload))
PY
    evil_dir="${work}/evil-backup"
    mkdir -p "${evil_dir}"
    cp -- "${work}/evil.tgz" "${evil_dir}/auth-volume.tgz"
    printf 'PGDMP' > "${evil_dir}/db.dump"
    (
        cd -- "${evil_dir}"
        sha256sum db.dump auth-volume.tgz > SHA256SUMS
        cp -- SHA256SUMS checksums.sha256
    )
    : > "${psql_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        AUTH_RESTORE_DIR="${work}/evil-out" \
        PSQL_LOG="${psql_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${evil_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "unsafe auth archive was extracted"
    [ ! -e "${work}/escaped" ] || fail "unsafe auth archive wrote outside the destination"
    [ ! -s "${psql_log}" ] || fail "unsafe auth archive still connected"

    empty_uploads="${work}/empty-uploads"
    missing_uploads="${work}/missing-uploads"
    mkdir -p "${empty_uploads}"
    : > "${stub_log}"
    set +e
    out="$(
        STUB_LOG="${stub_log}" \
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        BACKUP_DIR="${work}/empty-upload-backups" \
        BACKUP_RETENTION_DAYS=0 \
        AUTH_DIR="${auth}" \
        UPLOADS_DIR="${empty_uploads}" \
        STORAGE_UPLOADS_DIR="${missing_uploads}" \
        PATH="${env_path}" \
        bash "${BACKUP}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "missing or empty uploads failed the backup: ${out}"
    printf '%s\n' "${out}" | grep -q "Uploads directory is empty: ${empty_uploads}" || fail "empty uploads directory was not noted"
    printf '%s\n' "${out}" | grep -q "Storage uploads directory is missing: ${missing_uploads}" || fail "missing storage uploads directory was not noted"
    empty_run="$(find "${work}/empty-upload-backups" -mindepth 1 -maxdepth 1 -type d -name 'grc-*' -print)"
    [ -n "${empty_run}" ] || fail "backup without uploads was not written"
    [ ! -e "${empty_run}/uploads.tgz" ] || fail "empty uploads directory was archived"
    [ ! -e "${empty_run}/storage-uploads.tgz" ] || fail "missing storage uploads directory was archived"
    (cd -- "${empty_run}" && sha256sum -c SHA256SUMS) || fail "checksums failed when uploads were skipped"
    assert_absent "${out}" "local-only"

    kept="${work}/uploads-kept"
    mkdir -p "${kept}"
    printf '%s\n' 'keep-upload' > "${kept}/policy.pdf"
    : > "${psql_log}"
    : > "${restore_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        UPLOADS_RESTORE_DIR="${kept}" \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" --force "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "--force overwrote an existing uploads directory"
    printf '%s\n' "${out}" | grep -q 'will not overwrite or delete' || fail "uploads overwrite was not explained"
    [ "$(cat "${kept}/policy.pdf")" = "keep-upload" ] || fail "existing upload was overwritten"
    [ ! -s "${psql_log}" ] || fail "uploads refusal still connected"
    [ ! -s "${restore_log}" ] || fail "uploads refusal still called pg_restore"

    uploads_out="${work}/uploads-out"
    storage_out="${work}/storage-out"
    : > "${psql_log}"
    : > "${restore_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PSQL_LOG="${psql_log}" \
        PG_RESTORE_LOG="${restore_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" --uploads-dir "${uploads_out}" --storage-uploads-dir "${storage_out}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -eq 0 ] || fail "uploads restore failed: ${out}"
    [ "$(cat "${uploads_out}/clients/1/policy.pdf")" = "evidence-bytes" ] || fail "uploads file was not restored"
    [ "$(cat "${storage_out}/reports/gap.pdf")" = "report-bytes" ] || fail "storage uploads file was not restored"
    assert_mode "${uploads_out}" "700"
    assert_mode "${storage_out}" "700"
    assert_absent "${out}" "local-only"

    link_target="${work}/uploads-link-target"
    mkdir -p "${link_target}"
    ln -s "${link_target}" "${work}/uploads-link"
    : > "${psql_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        UPLOADS_RESTORE_DIR="${work}/uploads-link" \
        PSQL_LOG="${psql_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "symlink uploads target was accepted"
    printf '%s\n' "${out}" | grep -q 'will not follow it' || fail "symlink uploads target was not explained"
    [ ! -s "${psql_log}" ] || fail "symlink uploads target still connected"
    [ -z "$(find "${link_target}" -mindepth 1 -print -quit)" ] || fail "symlink uploads target was written"

    prod_uploads="${work}/prod-uploads"
    : > "${psql_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=app-postgres \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        PROTECTED_DB_HOSTS=app-postgres \
        UPLOADS_RESTORE_DIR="${prod_uploads}" \
        PSQL_LOG="${psql_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${run_dir}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "production host was allowed to receive uploads"
    printf '%s\n' "${out}" | grep -q 'GRCompliance treats this host as production' || fail "uploads production guard did not name GRCompliance"
    [ ! -e "${prod_uploads}" ] || fail "production guard created the uploads directory"
    [ ! -s "${psql_log}" ] || fail "uploads production guard still connected"

    python3 - "${work}/evil-uploads.tgz" <<'PY'
import io, sys, tarfile
path = sys.argv[1]
with tarfile.open(path, "w:gz") as archive:
    info = tarfile.TarInfo("../escaped-upload")
    payload = b"nope"
    info.size = len(payload)
    archive.addfile(info, io.BytesIO(payload))
PY
    evil_uploads="${work}/evil-uploads-backup"
    mkdir -p "${evil_uploads}"
    cp -- "${work}/evil-uploads.tgz" "${evil_uploads}/uploads.tgz"
    printf 'PGDMP' > "${evil_uploads}/db.dump"
    (
        cd -- "${evil_uploads}"
        sha256sum db.dump uploads.tgz > SHA256SUMS
        cp -- SHA256SUMS checksums.sha256
    )
    : > "${psql_log}"
    set +e
    out="$(
        DB_PASSWORD_FILE="${secret_file}" \
        DB_HOST=127.0.0.1 \
        DB_PORT=1 \
        TARGET_DB=scratch_restore \
        UPLOADS_RESTORE_DIR="${work}/evil-uploads-out" \
        PSQL_LOG="${psql_log}" \
        PATH="${env_path}" \
        bash "${RESTORE}" "${evil_uploads}" 2>&1
    )"
    status=$?
    set -e
    [ "${status}" -ne 0 ] || fail "unsafe uploads archive was extracted"
    [ ! -e "${work}/escaped-upload" ] || fail "unsafe uploads archive wrote outside the destination"
    [ ! -e "${work}/evil-uploads-out" ] || fail "unsafe uploads archive created the destination"
    [ ! -s "${psql_log}" ] || fail "unsafe uploads archive still connected"

    printf '%s\n' "behavior checks passed"
}

run_static_checks
run_behavior
printf '%s\n' "backup and restore script checks passed"
