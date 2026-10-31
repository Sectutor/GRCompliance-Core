#!/usr/bin/env bash
# restore.sh — GRCompliance database, auth, and uploads restore
#
# Generic copy for a GRCompliance self-host. Host names, paths, and the
# database role are environment settings. There is no password default and
# no built-in extra production host. Set PROTECTED_DB_HOSTS to the Postgres
# service name your compose file uses when that name must be refused.
#
# Restores into a new empty database only. This script never drops a database,
# never hides command errors, and never prints the database password.
# Uploads are restored only into a directory you name. That directory must be
# empty or must not exist yet. Existing files are never deleted or overwritten.
#
# Usage:
#   TARGET_DB=scratch DB_PASSWORD_FILE=/run/secrets/db_password \
#       ./scripts/restore.sh /path/to/grc-YYYYMMDD-HHMMSS
#   AUTH_RESTORE_DIR=/var/lib/grcompliance/auth TARGET_DB=scratch \
#       DB_PASSWORD_FILE=/run/secrets/db_password \
#       ./scripts/restore.sh /path/to/grc-YYYYMMDD-HHMMSS
#   UPLOADS_RESTORE_DIR=/var/lib/grcompliance/uploads TARGET_DB=scratch \
#       DB_PASSWORD_FILE=/run/secrets/db_password \
#       ./scripts/restore.sh /path/to/grc-YYYYMMDD-HHMMSS
#   ./scripts/restore.sh --uploads-dir /var/lib/grcompliance/uploads <backup>
#   ./scripts/restore.sh --force-prod    # required when the host is refused
#   ./scripts/restore.sh --force         # overwrite a non-empty AUTH_RESTORE_DIR
#   ./scripts/restore.sh --allow-version-mismatch
#   ./scripts/restore.sh --help
#   DB_PASSWORD is read from the environment when DB_PASSWORD_FILE is unset.
#
# Environment:
#   TARGET_DB          Database to restore into. Required. No default.
#                      Must already exist and contain no user tables.
#   DB_HOST            PostgreSQL host (default: localhost)
#   DB_PORT            PostgreSQL port (default: 5432)
#   DB_USER            Database role (default: grc)
#   DB_PASSWORD        Database password. Required unless DB_PASSWORD_FILE is set.
#   DB_PASSWORD_FILE   File whose contents are the password.
#   PROTECTED_DB_HOSTS Extra exact database hosts to refuse, colon-separated.
#                      Default is empty. Host `db` and production-looking names
#                      are always refused. Example: PROTECTED_DB_HOSTS=app-postgres
#   AUTH_RESTORE_DIR   If set, extract auth-volume.tgz here. Refuses a non-empty
#                      directory unless --force is passed.
#   UPLOADS_RESTORE_DIR
#                      If set, extract uploads.tgz here. Required to be empty
#                      or absent. No default. --force does not override this.
#   STORAGE_UPLOADS_RESTORE_DIR
#                      If set, extract storage-uploads.tgz here. Same rules.
#
# GRCompliance refuses host `db`, any host whose name looks like production,
# and any extra exact host listed in PROTECTED_DB_HOSTS (colon-separated,
# default empty). --force does not bypass that check, a checksum failure, a
# database that already has tables, or an uploads directory that already
# has files.
#
# Checksums are verified with `sha256sum -c` before any connection to TARGET_DB.
# Custom-format dumps (pg_dump -Fc, file magic PGDMP) use:
#   pg_restore --exit-on-error --no-owner --no-acl
# Plain .sql files use:
#   psql -v ON_ERROR_STOP=1
#
# pg_restore's major version must match the server. A newer client sends
# SET transaction_timeout, which an older server rejects. That mismatch is
# refused. --allow-version-mismatch continues only when pg_restore is older
# than the server. It does not skip checksum, empty-database, or
# production-host checks, and it does not allow a newer client.
#
# Dumps from this stack include CREATE EXTENSION vector. A non-superuser
# database owner cannot run that statement. A superuser must run
# CREATE EXTENSION IF NOT EXISTS vector; in the empty target first. When
# the extension is already installed, pg_restore -l / -L drops that entry
# so the rest of the dump restores as the non-superuser owner.
#
set -euo pipefail
# A trace would print the database password. Keep tracing off.
set +x
umask 077

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'

info()    { printf '%b\n' "${CYAN}[INFO]${NC}  $*"; }
success() { printf '%b\n' "${GREEN}[OK]${NC}    $*"; }
warn()    { printf '%b\n' "${YELLOW}[WARN]${NC}  $*"; }
error()   { printf '%b\n' "${RED}[ERROR]${NC} $*" >&2; }

FORCE=0
FORCE_PROD=0
ALLOW_VERSION_MISMATCH=0
BACKUP_ARG=""
DUMP_FILE=""
BACKUP_PATH=""
SQL_TO_RESTORE=""
TOC_LIST=""
RESTORE_LIST=""

usage() {
    cat <<'EOF'
Usage: restore.sh [--force-prod] [--force] [--allow-version-mismatch] [--uploads-dir DIR] [--storage-uploads-dir DIR] <backup-dir-or-dump>

Restore a GRCompliance backup into an existing empty database.

Required:
  TARGET_DB                         database to restore into (no default)
  DB_PASSWORD or DB_PASSWORD_FILE   database password (no default; never printed)
  backup path                       directory containing db.dump, or a dump file

Options:
  --force-prod    Allow a host that GRCompliance treats as production.
                  Does not allow a non-empty database or a non-empty uploads directory.
  --force         Allow a non-empty AUTH_RESTORE_DIR to be overwritten.
                  Does not allow a non-empty database, a bad checksum,
                  or a non-empty uploads directory.
  --allow-version-mismatch
                  Continue when pg_restore is older than the server, and
                  only then. A newer pg_restore is refused because it sends
                  SET transaction_timeout. Does not skip checksum,
                  empty-database, or production-host checks.
  --uploads-dir DIR
                  Extract uploads.tgz into DIR. DIR must be empty or must not
                  exist yet. Same as UPLOADS_RESTORE_DIR. No default.
  --storage-uploads-dir DIR
                  Extract storage-uploads.tgz into DIR. Same rules.
                  Same as STORAGE_UPLOADS_RESTORE_DIR. No default.

Environment:
  DB_HOST DB_PORT
  DB_USER                        database role (default: grc)
  PROTECTED_DB_HOSTS             extra hosts to refuse (colon-separated, default empty)
  AUTH_RESTORE_DIR               extract auth-volume.tgz here (optional)
  UPLOADS_RESTORE_DIR            extract uploads.tgz here (optional; no default)
  STORAGE_UPLOADS_RESTORE_DIR    extract storage-uploads.tgz here (optional; no default)

Custom-format dumps: pg_restore --exit-on-error --no-owner --no-acl
                     The vector CREATE EXTENSION entry is omitted with
                     pg_restore -l / -L when the extension is already installed.
Plain .sql:          psql -v ON_ERROR_STOP=1
Checksums:           sha256sum -c SHA256SUMS (and any .sha256 files) before restore.
pg_restore's major version must match the server. Before restore, a superuser
must run CREATE EXTENSION IF NOT EXISTS vector; in the empty target database
when the dump needs pgvector.
EOF
}

cleanup() {
    local status=$?
    set +e
    unset PGPASSWORD
    if [ -n "${TOC_LIST}" ]; then
        rm -f -- "${TOC_LIST}"
    fi
    if [ -n "${RESTORE_LIST}" ]; then
        rm -f -- "${RESTORE_LIST}"
    fi
    if [ -n "${SQL_TO_RESTORE}" ] && [ "${SQL_TO_RESTORE}" != "${DUMP_FILE}" ]; then
        rm -f -- "${SQL_TO_RESTORE}"
    fi
    exit "${status}"
}
trap cleanup EXIT

load_db_password() {
    if [ -z "${DB_PASSWORD:-}" ] && [ -n "${DB_PASSWORD_FILE:-}" ]; then
        if [ ! -r "${DB_PASSWORD_FILE}" ]; then
            error "DB_PASSWORD_FILE is set but cannot be read."
            exit 1
        fi
        DB_PASSWORD="$(tr -d '\r\n' < "${DB_PASSWORD_FILE}")"
    fi
    if [ -z "${DB_PASSWORD:-}" ]; then
        error "DB_PASSWORD is required. Export DB_PASSWORD or set DB_PASSWORD_FILE to a file that contains the password."
        exit 1
    fi
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        error "Required command not found: $1"
        exit 1
    fi
}

# Refuse the bundled database host and hosts that look like production.
# `db` is an exact match. A DNS label of prod or production also matches.
# PROTECTED_DB_HOSTS adds extra exact names. It has no default.
host_is_protected() {
    local host="$1"
    local extra=""
    local -a extras=()
    host="$(printf '%s' "${host}" | tr '[:upper:]' '[:lower:]')"
    host="${host%.}"
    case "${host}" in
        db)
            return 0
            ;;
    esac
    if printf '%s\n' "${host}" | grep -Eq '(^|[._-])prod(uction)?([._-]|$)'; then
        return 0
    fi
    if [ -z "${PROTECTED_DB_HOSTS:-}" ]; then
        return 1
    fi
    IFS=':' read -r -a extras <<< "${PROTECTED_DB_HOSTS}"
    for extra in "${extras[@]}"; do
        extra="$(printf '%s' "${extra}" | tr '[:upper:]' '[:lower:]')"
        extra="${extra%.}"
        [ -n "${extra}" ] || continue
        if [ "${host}" = "${extra}" ]; then
            return 0
        fi
    done
    return 1
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit 0
                ;;
            --force-prod)
                FORCE_PROD=1
                ;;
            --force)
                FORCE=1
                ;;
            --allow-version-mismatch)
                ALLOW_VERSION_MISMATCH=1
                ;;
            --uploads-dir)
                shift
                if [ "$#" -eq 0 ] || [ -z "${1}" ]; then
                    error "--uploads-dir requires a directory."
                    usage >&2
                    exit 2
                fi
                case "$1" in
                    -*)
                        error "--uploads-dir requires a directory."
                        usage >&2
                        exit 2
                        ;;
                esac
                UPLOADS_RESTORE_DIR="$1"
                ;;
            --storage-uploads-dir)
                shift
                if [ "$#" -eq 0 ] || [ -z "${1}" ]; then
                    error "--storage-uploads-dir requires a directory."
                    usage >&2
                    exit 2
                fi
                case "$1" in
                    -*)
                        error "--storage-uploads-dir requires a directory."
                        usage >&2
                        exit 2
                        ;;
                esac
                STORAGE_UPLOADS_RESTORE_DIR="$1"
                ;;
            --)
                shift
                if [ "$#" -gt 1 ]; then
                    error "Unexpected extra argument."
                    usage >&2
                    exit 2
                fi
                BACKUP_ARG="${1:-}"
                break
                ;;
            -*)
                error "Unknown option: $1"
                usage >&2
                exit 2
                ;;
            *)
                if [ -n "${BACKUP_ARG}" ]; then
                    error "Unexpected extra argument: $1"
                    usage >&2
                    exit 2
                fi
                BACKUP_ARG="$1"
                ;;
        esac
        shift
    done
}

resolve_backup() {
    local input="$1"
    local sqls=()
    if [ -z "${input}" ]; then
        error "Backup path is required."
        usage >&2
        exit 2
    fi
    if [ -d "${input}" ]; then
        BACKUP_PATH="$(cd -- "${input}" && pwd)"
        if [ -f "${BACKUP_PATH}/db.dump" ]; then
            DUMP_FILE="${BACKUP_PATH}/db.dump"
            return 0
        fi
        shopt -s nullglob
        sqls=("${BACKUP_PATH}"/*.sql)
        shopt -u nullglob
        if [ "${#sqls[@]}" -eq 1 ]; then
            DUMP_FILE="${sqls[0]}"
            return 0
        fi
        if [ "${#sqls[@]}" -eq 0 ]; then
            error "No db.dump or .sql file in ${BACKUP_PATH}."
            exit 1
        fi
        error "Multiple .sql files in ${BACKUP_PATH}. Pass one file."
        exit 1
    fi
    if [ -f "${input}" ]; then
        DUMP_FILE="$(cd -- "$(dirname -- "${input}")" && pwd)/$(basename -- "${input}")"
        BACKUP_PATH="$(dirname -- "${DUMP_FILE}")"
        return 0
    fi
    error "Backup path does not exist: ${input}"
    exit 1
}

checksum_lists_name() {
    local file="$1"
    local name="$2"
    [ -f "${file}" ] || return 1
    awk -v name="${name}" '
        $2 == name || $2 == ("*" name) { found = 1 }
        END { exit found ? 0 : 1 }
    ' "${file}"
}

verify_checksums() {
    local dir="$1"
    local dump_name="$2"
    local found=0
    local listed=0
    local sum_file=""

    if [ -f "${dir}/SHA256SUMS" ]; then
        info "Checking SHA256SUMS."
        if ! (cd -- "${dir}" && sha256sum -c SHA256SUMS); then
            error "Checksum mismatch. Restore aborted."
            exit 1
        fi
        found=1
        if checksum_lists_name "${dir}/SHA256SUMS" "${dump_name}"; then
            listed=1
        fi
    fi

    shopt -s nullglob
    for sum_file in "${dir}"/*.sha256; do
        info "Checking $(basename -- "${sum_file}")."
        if ! (cd -- "${dir}" && sha256sum -c "$(basename -- "${sum_file}")"); then
            error "Checksum mismatch. Restore aborted."
            exit 1
        fi
        found=1
        if checksum_lists_name "${sum_file}" "${dump_name}"; then
            listed=1
        fi
    done
    shopt -u nullglob

    if [ "${found}" -ne 1 ]; then
        error "No SHA256SUMS or .sha256 file in ${dir}. Refusing to restore an unverified backup."
        exit 1
    fi
    if [ "${listed}" -ne 1 ]; then
        error "${dump_name} is not listed in the checksum file. Refusing to restore."
        exit 1
    fi
}

psql_exec() {
    local database="$1"
    shift
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${database}" \
        --no-password \
        -v ON_ERROR_STOP=1 \
        "$@"
}

assert_target_empty() {
    local count=""
    local sql="SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname <> 'pg_catalog' AND n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'"

    if ! psql_exec "${TARGET_DB}" -tAc "SELECT 1" >/dev/null; then
        error "TARGET_DB '${TARGET_DB}' is not reachable on ${DB_HOST}. Create an empty database first. This script does not create or drop databases."
        exit 1
    fi
    if ! count="$(psql_exec "${TARGET_DB}" -tAc "${sql}")"; then
        error "Could not check whether TARGET_DB is empty."
        exit 1
    fi
    count="${count//[[:space:]]/}"
    if [ -z "${count}" ] || [ "${count}" != "0" ]; then
        error "TARGET_DB '${TARGET_DB}' exists and is not empty. Refusing to restore."
        exit 1
    fi
}

tool_major_version() {
    local tool="$1"
    local line=""
    local major=""
    if ! line="$("${tool}" --version)"; then
        error "Could not read ${tool} --version."
        exit 1
    fi
    major="$(printf '%s\n' "${line}" | sed -n 's/.*PostgreSQL)[[:space:]]\{1,\}\([0-9]\{1,\}\)\..*/\1/p' | head -n 1)"
    if [ -z "${major}" ]; then
        error "Could not parse the major version from ${tool} --version: ${line}"
        exit 1
    fi
    printf '%s\n' "${major}"
}

server_major_version() {
    local raw=""
    if ! raw="$(psql_exec "${TARGET_DB}" -tAc "SELECT current_setting('server_version_num')")"; then
        error "Could not read the PostgreSQL server version on ${DB_HOST}:${DB_PORT}."
        exit 1
    fi
    raw="${raw//[[:space:]]/}"
    case "${raw}" in
        ''|*[!0-9]*)
            error "PostgreSQL server version was not a number."
            exit 1
            ;;
    esac
    if [ "${raw}" -lt 100000 ]; then
        error "PostgreSQL server version ${raw} is older than 10. This script expects PostgreSQL 10 or newer."
        exit 1
    fi
    printf '%s\n' "$((raw / 10000))"
}

# A newer pg_restore sends SET transaction_timeout and is refused even when
# --allow-version-mismatch is set. An older client continues only with that flag.
assert_tool_matches_server() {
    local tool="$1"
    local client_major=""
    local server_major=""
    client_major="$(tool_major_version "${tool}")"
    server_major="$(server_major_version)"
    if [ "${client_major}" -eq "${server_major}" ]; then
        info "${tool} major version ${client_major} matches PostgreSQL server ${server_major}."
        return 0
    fi
    if [ "${client_major}" -gt "${server_major}" ]; then
        error "${tool} major version ${client_major} does not match PostgreSQL server major version ${server_major}."
        error "A newer client sends SET transaction_timeout, which PostgreSQL ${server_major} rejects, and the command aborts."
        error "Refusing to continue. A newer client is not safe to override."
        error "Use ${tool} from the same major version as the server."
        error "Example: docker compose exec db ${tool}"
        error "or the postgres:${server_major} image."
        exit 1
    fi
    if [ "${ALLOW_VERSION_MISMATCH}" -eq 1 ]; then
        warn "${tool} major version ${client_major} is older than PostgreSQL server ${server_major}. Continuing because --allow-version-mismatch was passed."
        return 0
    fi
    error "${tool} major version ${client_major} does not match PostgreSQL server major version ${server_major}."
    error "Refusing to continue. Pass --allow-version-mismatch only if you have confirmed this older client is safe for this server."
    error "That flag does not skip checksum, empty-database, or production-host checks, and it does not allow a newer client."
    exit 1
}

vector_extension_installed() {
    local present=""
    if ! present="$(psql_exec "${TARGET_DB}" -tAc "SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'vector'")"; then
        error "Could not check whether the vector extension is installed in '${TARGET_DB}'."
        exit 1
    fi
    present="${present//[[:space:]]/}"
    [ "${present}" = "1" ]
}

refuse_missing_vector() {
    error "The dump requires the vector extension, but it is not installed in '${TARGET_DB}'."
    error "CREATE EXTENSION vector needs a superuser. The database owner often is not one, so restore cannot create it."
    error "A superuser must run this command in the empty target database before restore.sh:"
    error "  CREATE EXTENSION IF NOT EXISTS vector;"
    exit 1
}

# Comment out the extension object itself. Table rows that use the vector
# type stay in the list; only CREATE EXTENSION and its comment/ACL do not.
filter_vector_toc() {
    awk '
        /^[0-9]+; [0-9]+ [0-9]+ EXTENSION - vector([[:space:]]|$)/ { print ";" $0; next }
        /^[0-9]+; [0-9]+ [0-9]+ COMMENT - EXTENSION vector([[:space:]]|$)/ { print ";" $0; next }
        /^[0-9]+; [0-9]+ [0-9]+ ACL - EXTENSION vector([[:space:]]|$)/ { print ";" $0; next }
        { print }
    '
}

prepare_custom_vector_list() {
    local toc=""
    local filtered=""
    require_cmd mktemp
    toc="$(mktemp)"
    TOC_LIST="${toc}"
    if ! pg_restore -l "${DUMP_FILE}" > "${toc}"; then
        error "Could not list dump contents with pg_restore -l. Restore aborted."
        exit 1
    fi
    if ! grep -Eq '^[0-9]+; [0-9]+ [0-9]+ EXTENSION - vector([[:space:]]|$)' "${toc}"; then
        return 0
    fi
    if ! vector_extension_installed; then
        refuse_missing_vector
    fi
    filtered="$(mktemp)"
    RESTORE_LIST="${filtered}"
    filter_vector_toc < "${toc}" > "${filtered}"
    info "The vector extension is already installed. Its CREATE EXTENSION entry will be skipped so a non-superuser can restore."
}

plain_sql_needs_vector() {
    if grep -Eq '^[[:space:]]*CREATE[[:space:]]+EXTENSION[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?vector([[:space:]]|;|$)' "${DUMP_FILE}"; then
        return 0
    fi
    if grep -Eq '^[[:space:]]*COMMENT[[:space:]]+ON[[:space:]]+EXTENSION[[:space:]]+vector([[:space:]]|;|$)' "${DUMP_FILE}"; then
        return 0
    fi
    return 1
}

prepare_plain_vector_sql() {
    local filtered=""
    if ! plain_sql_needs_vector; then
        return 0
    fi
    if ! vector_extension_installed; then
        refuse_missing_vector
    fi
    require_cmd mktemp
    filtered="$(mktemp)"
    SQL_TO_RESTORE="${filtered}"
    awk '
        /^[[:space:]]*CREATE[[:space:]]+EXTENSION[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?vector([[:space:]]|;|$)/ { next }
        /^[[:space:]]*COMMENT[[:space:]]+ON[[:space:]]+EXTENSION[[:space:]]+vector([[:space:]]|;|$)/ { next }
        { print }
    ' "${DUMP_FILE}" > "${filtered}"
    info "The vector extension is already installed. Its CREATE EXTENSION statement will be skipped so a non-superuser can restore."
}

prepare_database_restore() {
    local magic=""
    magic="$(head -c 5 -- "${DUMP_FILE}")"
    if [ "${magic}" = "PGDMP" ]; then
        require_cmd pg_restore
        assert_tool_matches_server pg_restore
        prepare_custom_vector_list
        return 0
    fi
    case "${DUMP_FILE}" in
        *.sql)
            prepare_plain_vector_sql
            return 0
            ;;
    esac
    error "Unsupported dump. Expected a pg_dump custom-format file or a plain .sql file."
    exit 1
}

restore_dump() {
    local magic=""
    local -a args=()
    magic="$(head -c 5 -- "${DUMP_FILE}")"
    if [ "${magic}" = "PGDMP" ]; then
        require_cmd pg_restore
        info "Restoring custom-format dump with pg_restore."
        args+=(--exit-on-error --no-owner --no-acl)
        if [ -n "${RESTORE_LIST}" ]; then
            args+=(-L "${RESTORE_LIST}")
        fi
        args+=(-h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${TARGET_DB}" --no-password)
        PGPASSWORD="${DB_PASSWORD}" pg_restore "${args[@]}" "${DUMP_FILE}"
        return 0
    fi
    case "${DUMP_FILE}" in
        *.sql)
            info "Restoring plain SQL with psql."
            psql_exec "${TARGET_DB}" -f "${SQL_TO_RESTORE:-${DUMP_FILE}}"
            return 0
            ;;
    esac
    error "Unsupported dump. Expected a pg_dump custom-format file or a plain .sql file."
    exit 1
}

assert_archive_safe() {
    local archive="$1"
    local label="$2"
    local listing=""
    local entry=""
    if ! listing="$(tar -tzf "${archive}")"; then
        error "Cannot read ${label}."
        exit 1
    fi
    if [ -z "${listing}" ]; then
        error "${label} is empty."
        exit 1
    fi
    while IFS= read -r entry; do
        [ -n "${entry}" ] || continue
        case "${entry}" in
            /*|../*|*/../*|*/..|..)
                error "Refusing ${label} entry that escapes the destination."
                exit 1
                ;;
        esac
    done <<< "${listing}"
}

auth_archive_path() {
    printf '%s\n' "${BACKUP_PATH}/auth-volume.tgz"
}

prepare_auth_restore() {
    local archive=""
    local occupied=0
    if [ -z "${AUTH_RESTORE_DIR:-}" ]; then
        return 0
    fi
    require_cmd tar
    archive="$(auth_archive_path)"
    if [ ! -f "${archive}" ]; then
        error "AUTH_RESTORE_DIR is set but auth-volume.tgz is not in ${BACKUP_PATH}."
        exit 1
    fi
    if ! checksum_lists_name "${BACKUP_PATH}/SHA256SUMS" "auth-volume.tgz" \
        && ! checksum_lists_any_sha "${BACKUP_PATH}" "auth-volume.tgz"; then
        error "auth-volume.tgz is not listed in the checksum file. Refusing to extract."
        exit 1
    fi
    assert_archive_safe "${archive}" "auth archive"
    if [ -e "${AUTH_RESTORE_DIR}" ] && [ ! -d "${AUTH_RESTORE_DIR}" ]; then
        error "AUTH_RESTORE_DIR exists and is not a directory."
        exit 1
    fi
    if [ -d "${AUTH_RESTORE_DIR}" ]; then
        while IFS= read -r -d '' _; do
            occupied=1
            break
        done < <(find "${AUTH_RESTORE_DIR}" -mindepth 1 -print0)
        if [ "${occupied}" -eq 1 ] && [ "${FORCE}" -ne 1 ]; then
            error "AUTH_RESTORE_DIR is not empty. Refusing to overwrite without --force."
            exit 1
        fi
    fi
}

restore_auth() {
    local archive=""
    if [ -z "${AUTH_RESTORE_DIR:-}" ]; then
        info "AUTH_RESTORE_DIR is unset. Auth archive left untouched."
        return 0
    fi
    archive="$(auth_archive_path)"
    mkdir -p -- "${AUTH_RESTORE_DIR}"
    chmod 700 -- "${AUTH_RESTORE_DIR}"
    info "Extracting auth archive into ${AUTH_RESTORE_DIR}."
    tar -xzf "${archive}" -C "${AUTH_RESTORE_DIR}" --strip-components=1
    success "Auth archive extracted."
}

prepare_tree_restore() {
    local archive_name="$1"
    local dest="$2"
    local label="$3"
    local archive=""
    local occupied=0

    if [ -z "${dest}" ]; then
        return 0
    fi
    require_cmd tar
    archive="${BACKUP_PATH}/${archive_name}"
    if [ ! -f "${archive}" ]; then
        error "${label} is set but ${archive_name} is not in ${BACKUP_PATH}."
        exit 1
    fi
    if ! checksum_lists_name "${BACKUP_PATH}/SHA256SUMS" "${archive_name}" \
        && ! checksum_lists_any_sha "${BACKUP_PATH}" "${archive_name}"; then
        error "${archive_name} is not listed in the checksum file. Refusing to extract."
        exit 1
    fi
    assert_archive_safe "${archive}" "${label}"
    if [ -L "${dest}" ]; then
        error "${label} is a symlink. GRCompliance will not follow it."
        exit 1
    fi
    if [ -e "${dest}" ] && [ ! -d "${dest}" ]; then
        error "${label} exists and is not a directory."
        exit 1
    fi
    if [ -d "${dest}" ]; then
        while IFS= read -r -d '' _; do
            occupied=1
            break
        done < <(find "${dest}" -mindepth 1 -print0)
        if [ "${occupied}" -eq 1 ]; then
            error "${label} is not empty. GRCompliance will not overwrite or delete existing files."
            exit 1
        fi
    fi
}

restore_tree() {
    local archive_name="$1"
    local dest="$2"
    local label="$3"
    local archive=""

    if [ -z "${dest}" ]; then
        if [ -f "${BACKUP_PATH}/${archive_name}" ]; then
            info "${label} is unset. ${archive_name} left untouched."
        fi
        return 0
    fi
    archive="${BACKUP_PATH}/${archive_name}"
    mkdir -p -- "${dest}"
    chmod 700 -- "${dest}"
    info "Extracting ${label} into ${dest}."
    tar -xzf "${archive}" -C "${dest}"
    success "${label} extracted."
}

checksum_lists_any_sha() {
    local dir="$1"
    local name="$2"
    local sum_file=""
    shopt -s nullglob
    for sum_file in "${dir}"/*.sha256; do
        if checksum_lists_name "${sum_file}" "${name}"; then
            shopt -u nullglob
            return 0
        fi
    done
    shopt -u nullglob
    return 1
}

main() {
    local dump_name=""

    parse_args "$@"
    load_db_password

    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_USER="${DB_USER:-grc}"

    case "${DB_PORT}" in
        ''|*[!0-9]*)
            error "DB_PORT must be a positive integer."
            exit 1
            ;;
    esac
    case "${DB_HOST}" in
        ""|-*)
            error "DB_HOST is invalid."
            exit 1
            ;;
    esac
    if [ -z "${TARGET_DB:-}" ]; then
        error "TARGET_DB is required. Set TARGET_DB to an existing empty database. This script does not create or drop databases."
        exit 1
    fi
    case "${TARGET_DB}" in
        [A-Za-z_][A-Za-z0-9_]*) ;;
        *)
            error "TARGET_DB must be a database name made of letters, digits, and underscores."
            exit 1
            ;;
    esac

    if host_is_protected "${DB_HOST}"; then
        if [ "${FORCE_PROD}" -ne 1 ]; then
            error "Refusing to restore on host '${DB_HOST}'. GRCompliance treats this host as production. Pass --force-prod only for a scratch database."
            exit 1
        fi
        warn "Continuing on host '${DB_HOST}' because --force-prod was passed. The target database must still be empty."
    fi

    require_cmd sha256sum
    require_cmd psql
    require_cmd head
    require_cmd sed
    require_cmd awk

    resolve_backup "${BACKUP_ARG}"
    dump_name="$(basename -- "${DUMP_FILE}")"
    info "Using backup: ${BACKUP_PATH}"
    verify_checksums "${BACKUP_PATH}" "${dump_name}"
    # Refuse an unsafe extract before opening a database connection.
    prepare_auth_restore
    prepare_tree_restore "uploads.tgz" "${UPLOADS_RESTORE_DIR:-}" "Uploads restore directory"
    prepare_tree_restore "storage-uploads.tgz" "${STORAGE_UPLOADS_RESTORE_DIR:-}" "Storage uploads restore directory"

    info "Checking that ${TARGET_DB} on ${DB_HOST} exists and has no user tables."
    assert_target_empty
    prepare_database_restore
    restore_dump
    restore_auth
    restore_tree "uploads.tgz" "${UPLOADS_RESTORE_DIR:-}" "Uploads restore directory"
    restore_tree "storage-uploads.tgz" "${STORAGE_UPLOADS_RESTORE_DIR:-}" "Storage uploads restore directory"

    success "Restore completed successfully."
    info "Database: ${TARGET_DB} on ${DB_HOST}:${DB_PORT}"
}

main "$@"
