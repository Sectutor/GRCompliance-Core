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
#
# Environment:
#   DB_HOST                 PostgreSQL host (default: localhost)
#   DB_PORT                 PostgreSQL port (default: 5432)
#   DB_NAME                 Database to dump (default: complianceos)
#   DB_USER                 Database role (default: complianceos)
#   DB_PASSWORD             Database password. Required unless DB_PASSWORD_FILE is set.
#   DB_PASSWORD_FILE        File whose contents are the password. Mode should be 0600.
#   BACKUP_DIR              Parent directory for this run (default: ./backups)
#   BACKUP_RETENTION_DAYS   Delete grc-* directories in BACKUP_DIR older than
#                           this many days (default: 14). 0 disables retention.
#   AUTH_DIR                Auth directory to archive (default: /root/.complianceos)
#   UPLOADS_DIR             Uploaded files (default: /app/uploads).
#                           The server's working directory is /app, and compose
#                           plus the image mount this path for /uploads.
#   STORAGE_UPLOADS_DIR     Readiness report files (default: /app/storage/uploads).
#                           LocalStorageProvider writes process.cwd()/storage/uploads.
#
# A missing or empty uploads directory is logged and skipped. It does not
# fail the backup. Database name, role, auth path, and service host names
# stay as this deployment already uses them.
#
# Output, under ${BACKUP_DIR}/grc-YYYYMMDD-HHMMSS/ (mode 0700):
#   db.dump              pg_dump custom format (-Fc)
#   auth-volume.tgz      tar of AUTH_DIR (tar -C <parent> <name>)
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

usage() {
    cat <<'EOF'
Usage: backup.sh [--help]

Dump the GRCompliance database, archive the auth directory, and archive uploads.

Required:
  DB_PASSWORD or DB_PASSWORD_FILE   database password (no default; never printed)

Common environment:
  DB_HOST DB_PORT DB_NAME DB_USER
  BACKUP_DIR              directory that receives grc-* backups (default: ./backups)
  BACKUP_RETENTION_DAYS   delete grc-* backups older than N days (default: 14, 0 disables)
  AUTH_DIR                auth directory (default: /root/.complianceos)
  UPLOADS_DIR             uploaded files (default: /app/uploads)
  STORAGE_UPLOADS_DIR     readiness report files (default: /app/storage/uploads)

Each run writes db.dump (pg_dump -Fc), auth-volume.tgz, SHA256SUMS, and
checksums.sha256. uploads.tgz and storage-uploads.tgz are added when those
directories contain files. A missing or empty uploads directory is logged
and skipped. The run directory is mode 0700 and the files are mode 0600.
EOF
}

cleanup() {
    local status=$?
    unset PGPASSWORD || true
    if [ "${status}" -ne 0 ] && [ -n "${DEST}" ]; then
        case "$(basename -- "${DEST}")" in
            grc-*)
                if [ ! -s "${DEST}/db.dump" ] || [ ! -s "${DEST}/auth-volume.tgz" ] \
                    || [ ! -s "${DEST}/SHA256SUMS" ] || [ ! -s "${DEST}/checksums.sha256" ]; then
                    rm -rf -- "${DEST}"
                fi
                ;;
        esac
    fi
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

resolve_dir() {
    local path="$1"
    if [ -z "${path}" ]; then
        error "BACKUP_DIR is empty."
        exit 1
    fi
    if [ ! -d "${path}" ]; then
        mkdir -p -- "${path}"
        chmod 700 -- "${path}"
    fi
    (cd -- "${path}" && pwd)
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
        error "${label} directory is not readable: ${source}"
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

main() {
    local root=""
    local stamp=""
    local auth_parent=""
    local auth_base=""

    if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
        usage
        exit 0
    fi
    if [ "$#" -gt 0 ]; then
        usage >&2
        exit 2
    fi

    load_db_password

    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_NAME="${DB_NAME:-complianceos}"
    DB_USER="${DB_USER:-complianceos}"
    BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
    BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
    AUTH_DIR="${AUTH_DIR:-/root/.complianceos}"
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
    require_cmd sha256sum
    require_cmd tar
    require_cmd stat
    require_cmd find

    if [ ! -d "${AUTH_DIR}" ]; then
        error "AUTH_DIR does not exist or is not a directory: ${AUTH_DIR}"
        exit 1
    fi

    root="$(resolve_dir "${BACKUP_DIR}")"
    if [ "${root}" = "/" ]; then
        error "Refusing BACKUP_DIR=/."
        exit 1
    fi

    stamp="$(date -u +%Y%m%d-%H%M%S)"
    DEST="${root}/grc-${stamp}"
    if [ -e "${DEST}" ]; then
        error "Backup directory already exists: ${DEST}"
        exit 1
    fi
    mkdir -- "${DEST}"
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

    auth_parent="$(dirname -- "${AUTH_DIR}")"
    auth_base="$(basename -- "${AUTH_DIR}")"
    info "Archiving auth directory ${AUTH_DIR}."
    if ! tar -czf "${DEST}/auth-volume.tgz" -C "${auth_parent}" "${auth_base}"; then
        error "Auth archive failed."
        exit 1
    fi
    chmod 600 "${DEST}/auth-volume.tgz"

    archive_optional_tree "${UPLOADS_DIR}" "uploads.tgz" "Uploads"
    archive_optional_tree "${STORAGE_UPLOADS_DIR}" "storage-uploads.tgz" "Storage uploads"

    (
        cd -- "${DEST}"
        set -- db.dump auth-volume.tgz
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

    success "Backup completed successfully."
    info "Location: ${DEST}"
    info "Verify with: (cd ${DEST} && sha256sum -c SHA256SUMS)"

    prune_old_backups "${root}"
}

main "$@"
