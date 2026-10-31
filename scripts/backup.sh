#!/usr/bin/env bash
# backup.sh — GRCompliance database, auth, and uploads backup
#
# Generic copy for a GRCompliance self-host. Every path and database name
# below is an overridable default. There is no password default, no secret,
# and no machine-specific host. Set the variables at the top of this header
# to match your compose file.
#
# Matches the backup dry run:
#   pg_dump -Fc into a mode-0700 directory, archive the auth directory,
#   archive uploaded files, and record SHA-256 checksums. The database
#   password is never given a default and is never printed.
#
# Usage:
#   DB_PASSWORD_FILE=/run/secrets/db_password ./scripts/backup.sh
#   ./scripts/backup.sh --help
#   DB_PASSWORD is read from the environment when DB_PASSWORD_FILE is unset.
#   ./scripts/backup.sh --allow-version-mismatch
#       Continue only when pg_dump is older than the server. A newer pg_dump
#       is still refused. This does not change retention or checksums.
#
# Environment:
#   DB_HOST                 PostgreSQL host (default: localhost)
#   DB_PORT                 PostgreSQL port (default: 5432)
#   DB_NAME                 Database to dump (default: grcompliance)
#   DB_USER                 Database role (default: grc)
#   DB_PASSWORD             Database password. Required unless DB_PASSWORD_FILE is set.
#   DB_PASSWORD_FILE        File whose contents are the password. Mode should be 0600.
#   BACKUP_DIR              Parent directory for this run (default: ./backups)
#   BACKUP_RETENTION_DAYS   Delete grc-* directories in BACKUP_DIR older than
#                           this many days (default: 14). 0 disables retention.
#   AUTH_DIR                Auth directory to archive. Unset by default. This
#                           edition stores local accounts in the database table
#                           local_credentials, which pg_dump already includes.
#                           There is no COMPLIANCEOS_DATA_DIR and no auth volume.
#                           A missing, empty, or unset AUTH_DIR is logged and skipped.
#   UPLOADS_DIR             Uploaded files (default: /app/uploads).
#                           The server's working directory is /app, and compose
#                           plus the image mount this path for /uploads.
#   STORAGE_UPLOADS_DIR     Readiness report files (default: /app/storage/uploads).
#                           LocalStorageProvider writes process.cwd()/storage/uploads.
#
# A missing or empty uploads directory is logged and skipped. It does not
# fail the backup. A missing or empty auth directory is logged and skipped
# the same way. A directory that exists but is not readable by this user
# fails the run before any backup directory is created. Database name and
# role default to this compose file (grcompliance / grc) and stay overridable.
#
# pg_dump's major version must match the server. A newer client sends
# SET transaction_timeout, which an older server rejects. That mismatch is
# refused before a backup directory is created. --allow-version-mismatch
# continues only when pg_dump is older than the server.
#
# On any failure before the backup is complete, the grc-* directory this
# run created is removed. The path checks used for retention still apply.
# If this run also created BACKUP_DIR and it is empty afterwards, that
# directory is removed too. Other backups are left in place.
#
# Output, under ${BACKUP_DIR}/grc-YYYYMMDD-HHMMSS/ (mode 0700):
#   db.dump              pg_dump custom format (-Fc)
#   auth-volume.tgz      tar of AUTH_DIR (tar -C <parent> <name>), when that
#                        directory exists and contains files
#   uploads.tgz          contents of UPLOADS_DIR, when that directory has files
#   storage-uploads.tgz  contents of STORAGE_UPLOADS_DIR, when that directory has files
#   SHA256SUMS           sha256sum checksums for the files that were written
#   checksums.sha256     the same checksums
#
# Archive members are the files inside the source directory (tar -C <dir> .).
# Symlinks are stored as symlinks. Mode is 0600. Retention is unchanged.
#
# Retention only deletes direct children of BACKUP_DIR whose names match grc-*.
# It does not follow symlinks, cross filesystems, or touch any other path.
#
# Verify a finished backup with:  (cd <backup-dir> && sha256sum -c SHA256SUMS)
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

DEST=""
BACKUP_ROOT=""
CREATED_DEST=0
CREATED_BACKUP_ROOT=0
BACKUP_COMPLETE=0
ALLOW_VERSION_MISMATCH=0

usage() {
    cat <<'EOF'
Usage: backup.sh [--allow-version-mismatch] [--help]

Dump the GRCompliance database, archive the auth directory, and archive uploads.

Required:
  DB_PASSWORD or DB_PASSWORD_FILE   database password (no default; never printed)

Options:
  --allow-version-mismatch
                  Continue when pg_dump is older than the server, and only
                  then. A newer pg_dump is refused because it sends
                  SET transaction_timeout. The flag does not change
                  retention or which directories are archived.

Common environment:
  DB_HOST DB_PORT
  DB_NAME                 database to dump (default: grcompliance)
  DB_USER                 database role (default: grc)
  BACKUP_DIR              directory that receives grc-* backups (default: ./backups)
  BACKUP_RETENTION_DAYS   delete grc-* backups older than N days (default: 14, 0 disables)
  AUTH_DIR                auth directory (unset by default; missing or empty is skipped)
  UPLOADS_DIR             uploaded files (default: /app/uploads)
  STORAGE_UPLOADS_DIR     readiness report files (default: /app/storage/uploads)

Each run writes db.dump (pg_dump -Fc), SHA256SUMS, and checksums.sha256.
auth-volume.tgz is added when AUTH_DIR exists and contains files.
uploads.tgz and storage-uploads.tgz are added when those directories
contain files. A missing or empty auth or uploads directory is logged
and skipped. A directory that exists but is not readable fails the run
before a backup directory is created. Do not chmod those files
world-readable. Run this script as the owning user (uid 1001 in the
app image), with docker compose exec -u 1001, or with sudo.
pg_dump's major version must match the server. The run directory is
mode 0700 and the files are mode 0600. A failed run removes only the
grc-* directory it created.
EOF
}

# Drop the grc-* directory this run created. Retention's path checks apply:
# the name must match grc-*, the parent must be BACKUP_DIR, it must be a real
# directory on the same filesystem, and / is refused. Other paths are left.
remove_created_backup() {
    local dest="$1"
    local root="$2"
    local base=""
    local parent_dev=""
    local entry_dev=""

    if [ "${CREATED_DEST}" -ne 1 ] || [ -z "${dest}" ] || [ -z "${root}" ]; then
        return 0
    fi
    if [ ! -e "${dest}" ] && [ ! -L "${dest}" ]; then
        return 0
    fi
    if [ "${dest}" = "/" ] || [ "${root}" = "/" ]; then
        error "Refusing to remove /."
        return 1
    fi
    base="$(basename -- "${dest}")"
    case "${base}" in
        grc-*) ;;
        *)
            error "Refusing to remove unexpected backup name: ${base}"
            return 1
            ;;
    esac
    if [ "$(dirname -- "${dest}")" != "${root}" ]; then
        error "Refusing to remove a backup outside BACKUP_DIR."
        return 1
    fi
    if [ -L "${dest}" ] || [ ! -d "${dest}" ]; then
        error "Refusing to remove ${base} because it is not a real directory."
        return 1
    fi
    parent_dev="$(stat -c '%d' -- "${root}")" || {
        error "Refusing to remove ${base} because BACKUP_DIR could not be checked."
        return 1
    }
    entry_dev="$(stat -c '%d' -- "${dest}")" || {
        error "Refusing to remove ${base} because it could not be checked."
        return 1
    }
    if [ "${entry_dev}" != "${parent_dev}" ]; then
        error "Refusing to remove ${base} because it is on a different filesystem."
        return 1
    fi
    rm -rf -- "${dest}"
}

# If this run created BACKUP_DIR and the failure left it empty, remove that
# directory too. rmdir refuses a directory that still has anything in it.
remove_created_backup_root() {
    local root="${BACKUP_ROOT}"
    local leftover=""

    if [ "${CREATED_BACKUP_ROOT}" -ne 1 ]; then
        return 0
    fi
    if [ -z "${root}" ] || [ "${root}" = "/" ]; then
        error "Refusing to remove BACKUP_DIR."
        return 1
    fi
    if [ -L "${root}" ] || [ ! -d "${root}" ]; then
        error "Refusing to remove BACKUP_DIR because it is not a real directory."
        return 1
    fi
    leftover="$(find "${root}" -mindepth 1 -print -quit)" || {
        error "Refusing to remove BACKUP_DIR because it could not be listed."
        return 1
    }
    if [ -n "${leftover}" ]; then
        return 0
    fi
    rmdir -- "${root}"
}

cleanup() {
    local status=$?
    set +e
    unset PGPASSWORD
    if [ "${status}" -ne 0 ] && [ "${BACKUP_COMPLETE}" -ne 1 ]; then
        remove_created_backup "${DEST}" "${BACKUP_ROOT}"
        remove_created_backup_root
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

prepare_backup_root() {
    local path="$1"
    if [ -z "${path}" ]; then
        error "BACKUP_DIR is empty."
        exit 1
    fi
    if [ -L "${path}" ]; then
        error "Refusing to use a symlink as BACKUP_DIR."
        exit 1
    fi
    if [ ! -d "${path}" ]; then
        mkdir -p -- "${path}"
        chmod 700 -- "${path}"
        CREATED_BACKUP_ROOT=1
    fi
    BACKUP_ROOT="$(cd -- "${path}" && pwd)"
    if [ "${BACKUP_ROOT}" = "/" ]; then
        error "Refusing BACKUP_DIR=/."
        exit 1
    fi
}

explain_unreadable() {
    local label="$1"
    local source="$2"
    error "${label} directory is not readable by this user: ${source}"
    error "The app image owns uploads as uid 1001 with mode 0700. cp -a keeps that owner and mode, so a different user cannot archive them."
    error "Run backup.sh as that user, with docker compose exec -u 1001, or with sudo. Do not chmod the files world-readable."
}

# Fail before any backup directory is created when a tree exists but this
# user cannot read every directory and regular file in it. Missing paths and
# non-directories are left for the archive step, which skips them.
preflight_readable_dir() {
    local source="$1"
    local label="$2"
    local resolved=""
    local blocked=""
    local find_status=0

    if [ -z "${source}" ] || [ ! -e "${source}" ] || [ ! -d "${source}" ]; then
        return 0
    fi
    if [ -L "${source}" ]; then
        if [ ! -r "${source}" ] || [ ! -x "${source}" ]; then
            explain_unreadable "${label}" "${source}"
            exit 1
        fi
    elif [ ! -r "${source}" ] || [ ! -x "${source}" ]; then
        explain_unreadable "${label}" "${source}"
        exit 1
    fi
    resolved="$(cd -- "${source}" && pwd)"
    blocked="$(find "${resolved}" \( -type d \( ! -readable -o ! -executable \) -o -type f ! -readable \) -print -quit)" || find_status=$?
    if [ "${find_status}" -ne 0 ] || [ -n "${blocked}" ]; then
        explain_unreadable "${label}" "${source}"
        exit 1
    fi
}

psql_query() {
    local database="$1"
    local sql="$2"
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${database}" \
        --no-password \
        -v ON_ERROR_STOP=1 \
        -tAc "${sql}"
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
    local database="$1"
    local raw=""
    if ! raw="$(psql_query "${database}" "SELECT current_setting('server_version_num')")"; then
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

# Refuse a major-version mismatch before creating a backup directory.
# A newer client is never allowed: pg_dump 17 sends SET transaction_timeout,
# which PostgreSQL 16 rejects. An older client continues only with the flag.
assert_pg_dump_matches_server() {
    local client_major=""
    local server_major=""
    client_major="$(tool_major_version pg_dump)"
    server_major="$(server_major_version "${DB_NAME}")"
    if [ "${client_major}" -eq "${server_major}" ]; then
        info "pg_dump major version ${client_major} matches PostgreSQL server ${server_major}."
        return 0
    fi
    if [ "${client_major}" -gt "${server_major}" ]; then
        error "pg_dump major version ${client_major} does not match PostgreSQL server major version ${server_major}."
        error "A newer client sends SET transaction_timeout, which PostgreSQL ${server_major} rejects, and the command aborts."
        error "Refusing to continue. A newer client is not safe to override."
        error "Use pg_dump from the same major version as the server."
        error "Example: docker compose exec db pg_dump"
        error "or the postgres:${server_major} image."
        exit 1
    fi
    if [ "${ALLOW_VERSION_MISMATCH}" -eq 1 ]; then
        warn "pg_dump major version ${client_major} is older than PostgreSQL server ${server_major}. Continuing because --allow-version-mismatch was passed."
        return 0
    fi
    error "pg_dump major version ${client_major} does not match PostgreSQL server major version ${server_major}."
    error "Refusing to continue. Pass --allow-version-mismatch only if you have confirmed this older client is safe for this server."
    exit 1
}

prune_old_backups() {
    local days="${BACKUP_RETENTION_DAYS}"
    local root="$1"
    local entry=""
    local base=""
    local parent_dev=""
    local entry_dev=""
    local removed=0

    if [ "${days}" -eq 0 ]; then
        info "BACKUP_RETENTION_DAYS=0, retention disabled."
        return 0
    fi
    if [ "${root}" = "/" ]; then
        error "Refusing to prune BACKUP_DIR=/."
        exit 1
    fi

    parent_dev="$(stat -c '%d' -- "${root}")"
    while IFS= read -r -d '' entry; do
        [ -n "${entry}" ] || continue
        base="$(basename -- "${entry}")"
        case "${base}" in
            grc-*) ;;
            *)
                error "Refusing to delete unexpected name: ${base}"
                exit 1
                ;;
        esac
        if [ "$(dirname -- "${entry}")" != "${root}" ]; then
            error "Refusing to delete outside BACKUP_DIR."
            exit 1
        fi
        if [ -L "${entry}" ] || [ ! -d "${entry}" ]; then
            continue
        fi
        entry_dev="$(stat -c '%d' -- "${entry}")"
        if [ "${entry_dev}" != "${parent_dev}" ]; then
            error "Refusing to delete ${base} because it is on a different filesystem."
            exit 1
        fi
        rm -rf -- "${entry}"
        removed=$((removed + 1))
        info "Removed old backup ${base}"
    done < <(find "${root}" -mindepth 1 -maxdepth 1 -name 'grc-*' -mtime "+${days}" -print0)

    if [ "${removed}" -eq 0 ]; then
        info "No grc-* backups older than ${days} days in ${root}."
    fi
}

# 0 when the directory contains a file or a symlink, 1 when it does not.
tree_has_files() {
    local dir="$1"
    local found=""
    local find_status=0
    if [ ! -r "${dir}" ] || [ ! -x "${dir}" ]; then
        return 2
    fi
    found="$(find "${dir}" -mindepth 1 \( -type f -o -type l \) -print -quit)" || find_status=$?
    if [ "${find_status}" -ne 0 ]; then
        return 2
    fi
    if [ -n "${found}" ]; then
        return 0
    fi
    return 1
}

# Archive one uploads tree. Missing and empty directories are notes, not failures.
archive_optional_tree() {
    local source="$1"
    local archive_name="$2"
    local label="$3"
    local resolved=""
    local status=0

    if [ -z "${source}" ]; then
        warn "${label} path is unset. Continuing without it."
        return 0
    fi
    if [ ! -e "${source}" ]; then
        warn "${label} directory is missing: ${source}. Continuing without it."
        return 0
    fi
    if [ ! -d "${source}" ]; then
        warn "${label} path is not a directory: ${source}. Continuing without it."
        return 0
    fi
    resolved="$(cd -- "${source}" && pwd)"
    if [ "${resolved}" = "/" ]; then
        error "Refusing to archive ${label} from /."
        exit 1
    fi
    tree_has_files "${resolved}" || status=$?
    if [ "${status}" -eq 2 ]; then
        explain_unreadable "${label}" "${source}"
        exit 1
    fi
    if [ "${status}" -eq 1 ]; then
        warn "${label} directory is empty: ${source}. Continuing without it."
        return 0
    fi
    if [ "${status}" -ne 0 ]; then
        error "Could not inspect ${label} directory: ${source}"
        exit 1
    fi
    info "Archiving ${label} from ${source}."
    if ! tar -czf "${DEST}/${archive_name}" -C "${resolved}" .; then
        error "${label} archive failed."
        exit 1
    fi
    chmod 600 "${DEST}/${archive_name}"
}

# Archive AUTH_DIR when it exists and has files. This edition keeps local
# accounts in local_credentials, so a missing directory is a note, not a failure.
archive_auth() {
    local source="${AUTH_DIR:-}"
    local resolved=""
    local parent=""
    local base=""
    local status=0

    if [ -z "${source}" ]; then
        warn "AUTH_DIR is unset. Local accounts in this edition live in the database table local_credentials and are included in db.dump. Continuing without an auth archive."
        return 0
    fi
    if [ ! -e "${source}" ]; then
        warn "Auth directory is missing: ${source}. Continuing without an auth archive."
        return 0
    fi
    if [ ! -d "${source}" ]; then
        warn "Auth path is not a directory: ${source}. Continuing without an auth archive."
        return 0
    fi
    resolved="$(cd -- "${source}" && pwd)"
    if [ "${resolved}" = "/" ]; then
        error "Refusing to archive auth from /."
        exit 1
    fi
    tree_has_files "${resolved}" || status=$?
    if [ "${status}" -eq 2 ]; then
        explain_unreadable "Auth" "${source}"
        exit 1
    fi
    if [ "${status}" -eq 1 ]; then
        warn "Auth directory is empty: ${source}. Continuing without an auth archive."
        return 0
    fi
    if [ "${status}" -ne 0 ]; then
        error "Could not inspect auth directory: ${source}"
        exit 1
    fi
    parent="$(dirname -- "${resolved}")"
    base="$(basename -- "${resolved}")"
    info "Archiving auth directory ${source}."
    if ! tar -czf "${DEST}/auth-volume.tgz" -C "${parent}" "${base}"; then
        error "Auth archive failed."
        exit 1
    fi
    chmod 600 "${DEST}/auth-volume.tgz"
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit 0
                ;;
            --allow-version-mismatch)
                ALLOW_VERSION_MISMATCH=1
                ;;
            *)
                usage >&2
                error "Unknown argument: $1"
                exit 2
                ;;
        esac
        shift
    done
}

main() {
    local stamp=""

    parse_args "$@"
    load_db_password

    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_NAME="${DB_NAME:-grcompliance}"
    DB_USER="${DB_USER:-grc}"
    BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
    BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
    AUTH_DIR="${AUTH_DIR:-}"
    UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"
    STORAGE_UPLOADS_DIR="${STORAGE_UPLOADS_DIR:-/app/storage/uploads}"

    case "${BACKUP_RETENTION_DAYS}" in
        ''|*[!0-9]*)
            error "BACKUP_RETENTION_DAYS must be a non-negative integer (0 disables retention)."
            exit 1
            ;;
    esac
    case "${DB_PORT}" in
        ''|*[!0-9]*)
            error "DB_PORT must be a positive integer."
            exit 1
            ;;
    esac

    require_cmd pg_dump
    require_cmd psql
    require_cmd sha256sum
    require_cmd tar
    require_cmd stat
    require_cmd find
    require_cmd sed
    require_cmd head

    preflight_readable_dir "${AUTH_DIR}" "Auth"
    preflight_readable_dir "${UPLOADS_DIR}" "Uploads"
    preflight_readable_dir "${STORAGE_UPLOADS_DIR}" "Storage uploads"
    assert_pg_dump_matches_server

    prepare_backup_root "${BACKUP_DIR}"

    stamp="$(date -u +%Y%m%d-%H%M%S)"
    DEST="${BACKUP_ROOT}/grc-${stamp}"
    if [ -e "${DEST}" ] || [ -L "${DEST}" ]; then
        error "Backup directory already exists: ${DEST}"
        exit 1
    fi
    mkdir -- "${DEST}"
    CREATED_DEST=1
    chmod 700 -- "${DEST}"

    info "Dumping database '${DB_NAME}' from ${DB_HOST}:${DB_PORT} (custom format)."
    # Password is passed in the environment of this one command, matching the dry run.
    # stderr is left attached so connection failures stay visible.
    if ! PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --no-password \
        -Fc \
        -f "${DEST}/db.dump"; then
        error "Database dump failed."
        exit 1
    fi
    chmod 600 "${DEST}/db.dump"

    archive_auth
    archive_optional_tree "${UPLOADS_DIR}" "uploads.tgz" "Uploads"
    archive_optional_tree "${STORAGE_UPLOADS_DIR}" "storage-uploads.tgz" "Storage uploads"

    (
        cd -- "${DEST}"
        set -- db.dump
        if [ -f auth-volume.tgz ]; then
            set -- "$@" auth-volume.tgz
        fi
        if [ -f uploads.tgz ]; then
            set -- "$@" uploads.tgz
        fi
        if [ -f storage-uploads.tgz ]; then
            set -- "$@" storage-uploads.tgz
        fi
        sha256sum "$@" > SHA256SUMS
        cp -- SHA256SUMS checksums.sha256
    )
    chmod 600 "${DEST}/SHA256SUMS" "${DEST}/checksums.sha256"
    chmod 700 "${DEST}"
    BACKUP_COMPLETE=1

    success "Backup completed successfully."
    info "Location: ${DEST}"
    info "Verify with: (cd ${DEST} && sha256sum -c SHA256SUMS)"

    prune_old_backups "${BACKUP_ROOT}"
}

main "$@"
