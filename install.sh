#!/usr/bin/env bash
# One-line install for GRCompliance.
# curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
set -euo pipefail

RAW_BASE="${GRC_RAW_BASE:-https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main}"
GIT_URL="${GRC_GIT_URL:-https://github.com/Sectutor/GRCompliance-Core.git}"
GIT_REF="${GRC_REF:-main}"
IMAGE="ghcr.io/sectutor/grcompliance-core"
INSTALL_DIR="${GRC_HOME:-${HOME}/grcompliance}"
UPGRADE=0
FRESH=0
BIND_LOCAL=0
BIND_MODE=""
SECRET_ADDED=0
BIND_NOTE=""
LOG_FILE=""
if [[ "${GRC_BIND_LOCAL:-0}" == "1" ]]; then
  BIND_LOCAL=1
fi
HEALTH_RETRIES="${HEALTH_RETRIES:-90}"

usage() {
  cat <<EOF
Usage:
  curl -fsSL ${RAW_BASE}/install.sh | bash
  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --upgrade
  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --bind-local
  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --public
  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --local
  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --upgrade --local
  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --dir PATH

The installer is not copied into the install directory. Upgrade with the curl command above.

  --dir PATH     Install directory (default: ~/grcompliance or \$GRC_HOME)
  --upgrade      Pull the current image, or rebuild from source, without touching secrets
  --bind-local   Also publish Postgres and Redis on 127.0.0.1 (off by default)
  --public       Publish the app on all interfaces (BIND_ADDRESS=0.0.0.0). Plain HTTP.
                 Put a reverse proxy with TLS in front before this host is reachable
                 from a network. Default is 127.0.0.1 only.
  --local        Publish the app on 127.0.0.1 only (BIND_ADDRESS=127.0.0.1) and
                 recreate the app container. Use this to undo --public. Works on a
                 fresh install and with --upgrade.

  APP_URL        Address the app accepts. Default: http://localhost:\$APP_PORT
  PUBLIC_URL     Used when APP_URL is unset
  BIND_ADDRESS   Host address for the app port. Default 127.0.0.1. --public sets 0.0.0.0.
  GRC_PUBLIC_BIND  Set to 1 for the same result as --public.
  GRC_LOCAL_BIND   Set to 1 for the same result as --local. Wins over GRC_PUBLIC_BIND.
  HEALTH_RETRIES How many /health attempts before failure (default: 90)
  GRC_ALLOW_SIGNUP  Set to 1 to allow free local sign-up. Default off. No payment step.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --upgrade)
      UPGRADE=1
      shift
      ;;
    --bind-local)
      BIND_LOCAL=1
      shift
      ;;
    --public)
      BIND_MODE=public
      shift
      ;;
    --local)
      BIND_MODE=local
      shift
      ;;
    --dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --dir" >&2
        exit 1
      fi
      INSTALL_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

# True when /dev/tty can be opened. The check runs in a subshell so a missing
# controlling terminal does not print "/dev/tty: No such device or address".
tty_is_open() {
  [[ -c /dev/tty ]] || return 1
  ( : </dev/tty ) 2>/dev/null
}

prompt_yes_no() {
  local reply=""
  if ! tty_is_open; then
    return 1
  fi
  # read -p writes the prompt to stderr. Print it on the terminal instead.
  printf '%s' "$1" >/dev/tty || return 1
  if ! IFS= read -r reply </dev/tty; then
    return 1
  fi
  case "${reply}" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

print_docker_install_instructions() {
  cat <<'EOF'
Install Docker Engine, then run this installer again.

Official convenience script (review it before you run it):
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh

Package instructions: https://docs.docker.com/engine/install/
macOS and Windows: https://docs.docker.com/desktop/
EOF
}

offer_docker_install() {
  echo "Docker is not installed or not on PATH." >&2
  if ! prompt_yes_no "Install Docker now with Docker's official convenience script? [y/N] "; then
    print_docker_install_instructions >&2
    exit 1
  fi
  local script
  script="$(mktemp)"
  curl -fsSL https://get.docker.com -o "${script}"
  if [[ "$(id -u)" -eq 0 ]]; then
    sh "${script}"
  elif command -v sudo >/dev/null 2>&1; then
    sudo sh "${script}"
  else
    rm -f "${script}"
    echo "sudo is required to install Docker. The convenience script was not run." >&2
    print_docker_install_instructions >&2
    exit 1
  fi
  rm -f "${script}"
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    echo "Docker still is not usable. Open a new shell, or start the service, and run this installer again." >&2
    exit 1
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    offer_docker_install
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is installed, but the daemon is not reachable. Start Docker and run this again." >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    cat <<'EOF' >&2
The Docker Compose plugin is missing. The command is "docker compose", not "docker-compose".
Install it from https://docs.docker.com/compose/install/linux/
EOF
    exit 1
  fi
}

require_openssl() {
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl is required to generate secrets. Install openssl and run this again." >&2
    exit 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to download the compose file." >&2
    exit 1
  fi
  if ! [[ "${HEALTH_RETRIES}" =~ ^[1-9][0-9]*$ ]]; then
    echo "HEALTH_RETRIES must be a positive integer (got: ${HEALTH_RETRIES})." >&2
    exit 1
  fi
}

validate_public_url() {
  local url="$1"
  local rest host lower
  if [[ ! "${url}" =~ ^https?://[^[:space:]/]+ ]]; then
    echo "APP_URL must be an absolute http(s) URL for this instance" >&2
    exit 1
  fi
  if [[ "${url}" == *"@"* ]]; then
    echo "APP_URL must not include credentials" >&2
    exit 1
  fi
  if [[ "${url}" == *"\`"* || "${url}" == *"'"* || "${url}" == *'"'* || "${url}" == *'$'* || "${url}" == *' '* || "${url}" == *$'\t'* || "${url}" == *$'\n'* || "${url}" == *'\\'* ]]; then
    echo "APP_URL contains unsupported characters" >&2
    exit 1
  fi
  rest="${url#*://}"
  host="${rest%%/*}"
  if [[ "${host}" == \[*\]* ]]; then
    host="${host%%]*}"
    host="${host#[}"
  else
    host="${host%%:*}"
  fi
  if [[ -z "${host}" ]]; then
    echo "APP_URL must be an absolute http(s) URL for this instance" >&2
    exit 1
  fi
  lower="$(printf '%s' "${host}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${lower}" == "grcompliance.com" || "${lower}" == *.grcompliance.com ]]; then
    echo "APP_URL must be this instance's own address" >&2
    exit 1
  fi
}

resolve_public_url() {
  local app_port="$1"
  local url="${APP_URL:-${PUBLIC_URL:-http://localhost:${app_port}}}"
  validate_public_url "${url}"
  printf '%s\n' "${url}"
}

validate_bind_address() {
  local value="$1"
  if [[ ! "${value}" =~ ^[0-9A-Za-z.:%_-]+$ ]]; then
    echo "BIND_ADDRESS must be an IP address or hostname" >&2
    exit 1
  fi
}

resolve_bind_mode() {
  if [[ -n "${BIND_MODE}" ]]; then
    return
  fi
  if [[ "${GRC_LOCAL_BIND:-0}" == "1" || "${GRC_LOCAL_BIND:-}" == "true" ]]; then
    BIND_MODE=local
    return
  fi
  if [[ "${GRC_PUBLIC_BIND:-0}" == "1" || "${GRC_PUBLIC_BIND:-}" == "true" ]]; then
    BIND_MODE=public
  fi
}

desired_bind_address() {
  resolve_bind_mode
  if [[ "${BIND_MODE}" == "local" ]]; then
    printf '%s\n' "127.0.0.1"
    return
  fi
  if [[ "${BIND_MODE}" == "public" ]]; then
    printf '%s\n' "0.0.0.0"
    return
  fi
  if [[ -n "${BIND_ADDRESS:-}" ]]; then
    printf '%s\n' "${BIND_ADDRESS}"
    return
  fi
  printf '%s\n' "127.0.0.1"
}

assert_env_mode() {
  local mode
  if stat -c '%a' .env >/dev/null 2>&1; then
    mode="$(stat -c '%a' .env)"
  else
    mode="$(stat -f '%OLp' .env)"
  fi
  if [[ "${mode}" != "600" ]]; then
    echo "Refusing to continue: ${INSTALL_DIR}/.env mode is ${mode}, expected 600." >&2
    exit 1
  fi
}

upsert_env_value() {
  local key="$1" value="$2" current tmp
  current="$(awk -F= -v key="${key}" '$1==key { print substr($0, index($0, "=")+1); exit }' .env)"
  if [[ "${current}" == "${value}" ]]; then
    return
  fi
  tmp="$(mktemp)"
  if grep -q "^${key}=" .env; then
    awk -v key="${key}" -v value="${value}" 'BEGIN { FS = "=" } $1 == key { print key "=" value; next } { print $0 }' .env >"${tmp}"
  else
    cat .env >"${tmp}"
    printf '\n%s=%s\n' "${key}" "${value}" >>"${tmp}"
  fi
  chmod 600 "${tmp}"
  mv "${tmp}" .env
  chmod 600 .env
  assert_env_mode
  if [[ "${key}" == "BIND_ADDRESS" ]]; then
    BIND_NOTE="BIND_ADDRESS set to ${value} in .env; other settings unchanged."
  fi
}

ensure_bind_address() {
  local desired
  resolve_bind_mode
  if [[ "${BIND_MODE}" == "local" ]]; then
    desired="127.0.0.1"
  elif [[ "${BIND_MODE}" == "public" ]]; then
    desired="0.0.0.0"
  elif [[ -n "${BIND_ADDRESS:-}" ]]; then
    desired="${BIND_ADDRESS}"
  elif awk -F= '$1=="BIND_ADDRESS" && length($2)>0 { found=1 } END { exit found ? 0 : 1 }' .env; then
    return
  else
    desired="127.0.0.1"
  fi
  validate_bind_address "${desired}"
  upsert_env_value BIND_ADDRESS "${desired}"
}

write_env() {
  local postgres_password redis_password jwt_secret encryption_key admin_password
  local app_port admin_email postgres_user postgres_db grc_version public_url bind_address allow_signup
  postgres_password="$(openssl rand -hex 24)"
  redis_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -hex 32)"
  encryption_key="$(openssl rand -hex 32)"
  admin_password="$(openssl rand -hex 18)"
  app_port="${APP_PORT:-3001}"
  public_url="$(resolve_public_url "${app_port}")"
  bind_address="$(desired_bind_address)"
  validate_bind_address "${bind_address}"
  admin_email="${ADMIN_EMAIL:-admin@grcompliance.local}"
  postgres_user="${POSTGRES_USER:-grc}"
  postgres_db="${POSTGRES_DB:-grcompliance}"
  grc_version="${GRC_VERSION:-latest}"
  updater_secret="$(openssl rand -hex 32)"
  allow_signup=0
  if [[ "${GRC_ALLOW_SIGNUP:-0}" == "1" || "${GRC_ALLOW_SIGNUP:-}" == "true" ]]; then
    allow_signup=1
  fi
  airgap=0
  if [[ "${GRC_AIRGAP:-0}" == "1" || "${GRC_AIRGAP:-}" == "true" ]]; then
    airgap=1
  fi
  umask 077
  cat > .env <<EOF
POSTGRES_USER=${postgres_user}
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=${postgres_db}
DATABASE_URL=postgres://${postgres_user}:${postgres_password}@db:5432/${postgres_db}?sslmode=disable
REDIS_PASSWORD=${redis_password}
JWT_SECRET=${jwt_secret}
ENCRYPTION_KEY=${encryption_key}
ADMIN_EMAIL=${admin_email}
ADMIN_PASSWORD=${admin_password}
APP_URL=${public_url}
APP_PORT=${app_port}
BIND_ADDRESS=${bind_address}
GRC_VERSION=${grc_version}
GRC_UPDATER_VERSION=${GRC_UPDATER_VERSION:-1}
GRC_AIRGAP=${airgap}
GRC_ALLOW_SIGNUP=${allow_signup}
UPDATER_SECRET=${updater_secret}
AUTH_MODE=local
EOF
  if [[ -n "${ADMIN_NAME:-}" ]]; then
    printf 'ADMIN_NAME=%s\n' "${ADMIN_NAME}" >> .env
  fi
  chmod 600 .env
  assert_env_mode
  FRESH=1
}

ensure_updater_state() {
  mkdir -p updater-state
  if [[ ! -f updater-state/release.env ]]; then
    umask 077
    : > updater-state/release.env
    chmod 600 updater-state/release.env
  fi
}

ensure_updater_secret() {
  SECRET_ADDED=0
  if awk -F= '$1=="UPDATER_SECRET" && length($2)>0 { found=1 } END { exit found ? 0 : 1 }' .env; then
    return
  fi
  local secret
  secret="$(openssl rand -hex 32)"
  umask 077
  printf '\nUPDATER_SECRET=%s\n' "${secret}" >> .env
  chmod 600 .env
  SECRET_ADDED=1
}

download_compose() {
  local tmp name
  for name in docker-compose.yml docker-compose.local-ports.yml; do
    tmp="$(mktemp)"
    curl -fsSL "${RAW_BASE}/${name}" -o "${tmp}"
    mv "${tmp}" "${name}"
  done
}

compose_cmd() {
  if [[ "${BIND_LOCAL}" -eq 1 ]]; then
    docker compose -f docker-compose.yml -f docker-compose.local-ports.yml "$@"
  else
    docker compose -f docker-compose.yml "$@"
  fi
}

quiet() {
  if [[ -z "${LOG_FILE}" ]]; then
    "$@"
    return
  fi
  "$@" >>"${LOG_FILE}" 2>&1
}

ensure_source() {
  if ! command -v git >/dev/null 2>&1; then
    echo "git is required to build the image locally because ${IMAGE} is not available yet." >&2
    exit 1
  fi
  if [[ -d src/.git ]]; then
    quiet git -C src fetch --depth 1 origin "${GIT_REF}"
    quiet git -C src checkout --detach FETCH_HEAD
  else
    rm -rf src
    quiet git clone --depth 1 --branch "${GIT_REF}" "${GIT_URL}" src
  fi
}

app_port_from_env() {
  local value
  value="$(awk -F= '$1=="APP_PORT" { print $2 }' .env)"
  if [[ -z "${value}" ]]; then
    value="3001"
  fi
  printf '%s\n' "${value}"
}

app_url_from_env() {
  local value
  value="$(awk -F= '$1=="APP_URL" { print substr($0, index($0, "=")+1); exit }' .env)"
  if [[ -z "${value}" ]]; then
    value="http://localhost:$(app_port_from_env)"
  fi
  printf '%s\n' "${value}"
}

env_value() {
  local key="$1" fallback="$2" value
  value="$(awk -F= -v key="${key}" '$1==key { print substr($0, index($0, "=")+1); exit }' .env)"
  if [[ -z "${value}" ]]; then
    value="${fallback}"
  fi
  printf '%s\n' "${value}"
}

health_host() {
  local bind
  bind="$(env_value BIND_ADDRESS "127.0.0.1")"
  if [[ "${bind}" == "0.0.0.0" || "${bind}" == "::" || "${bind}" == "*" ]]; then
    printf '%s\n' "127.0.0.1"
    return
  fi
  printf '%s\n' "${bind}"
}

print_summary() {
  local public_url admin_email bind
  public_url="$(app_url_from_env)"
  admin_email="$(env_value ADMIN_EMAIL "admin@grcompliance.local")"
  bind="$(env_value BIND_ADDRESS "127.0.0.1")"
  echo "GRCompliance is up: ${public_url}"
  echo
  echo "URL:               ${public_url}"
  echo "Admin username:    ${admin_email}"
  echo "One-time password: ADMIN_PASSWORD in ${INSTALL_DIR}/.env (mode 600). It is not printed here."
  echo "Install log:       ${LOG_FILE}"
  echo
  echo "Next steps:"
  echo "  1. Open the URL and sign in. Change the administrator password after the first login."
  if [[ "${bind}" == "127.0.0.1" || "${bind}" == "localhost" || "${bind}" == "::1" ]]; then
    echo "  2. The app listens on ${bind} only, over plain HTTP. Re-run with --public or set BIND_ADDRESS to publish it, and put a reverse proxy with TLS in front."
  else
    echo "  2. The app is published on ${bind} over plain HTTP. Put a reverse proxy with TLS in front before this host is reachable from a network."
  fi
  if [[ "${FRESH}" -eq 1 ]]; then
    echo "  3. The first start loads the Latore LTD demo workspace."
  else
    echo "  3. Re-run left the existing database and uploaded files in place."
  fi
  if [[ "${UPGRADE}" -eq 1 ]]; then
    if [[ "${SECRET_ADDED}" -eq 1 && -n "${BIND_NOTE}" ]]; then
      echo "Upgrade finished. Existing secrets were kept. UPDATER_SECRET was added because it was missing. ${BIND_NOTE}"
    elif [[ "${SECRET_ADDED}" -eq 1 ]]; then
      echo "Upgrade finished. Existing secrets were kept. UPDATER_SECRET was added because it was missing."
    elif [[ -n "${BIND_NOTE}" ]]; then
      echo "Upgrade finished. ${BIND_NOTE}"
    else
      echo "Upgrade finished. The existing .env was left unchanged."
    fi
  fi
  echo "Upgrade later with:"
  echo "  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --upgrade"
}

wait_for_health() {
  local port attempt code host
  port="$(app_port_from_env)"
  host="$(health_host)"
  for attempt in $(seq 1 "${HEALTH_RETRIES}"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://${host}:${port}/health" 2>/dev/null || true)"
    if [[ "${code}" == "200" ]]; then
      print_summary
      return 0
    fi
    if [[ "${attempt}" -lt "${HEALTH_RETRIES}" ]]; then
      sleep 5
    fi
  done
  cat <<EOF >&2
GRCompliance did not return HTTP 200 from /health after ${HEALTH_RETRIES} attempts.
The install log is ${LOG_FILE}
Inspect the stack from ${INSTALL_DIR}:
  docker compose logs
  docker compose logs app
EOF
  exit 1
}

# Same order Docker Compose uses for ${GRC_IMAGE}: the shell wins, then .env,
# then ghcr.io/sectutor/grcompliance-core:$GRC_VERSION.
attempted_app_image() {
  local pinned version
  if [[ -n "${GRC_IMAGE:-}" ]]; then
    printf '%s\n' "${GRC_IMAGE}"
    return
  fi
  pinned="$(env_value GRC_IMAGE "")"
  if [[ -n "${pinned}" ]]; then
    printf '%s\n' "${pinned}"
    return
  fi
  if [[ -n "${GRC_VERSION:-}" ]]; then
    version="${GRC_VERSION}"
  else
    version="$(awk -F= '$1=="GRC_VERSION" { print $2; exit }' .env)"
    version="${version:-latest}"
  fi
  printf '%s:%s\n' "${IMAGE}" "${version}"
}

attempted_updater_image() {
  local version
  version="$(env_value GRC_UPDATER_VERSION "1")"
  printf '%s:%s\n' "ghcr.io/sectutor/grcompliance-updater" "${version}"
}

start_stack() {
  local version app_pull updater_pull attempted
  if [[ -z "${GRC_VERSION:-}" ]]; then
    version="$(awk -F= '$1=="GRC_VERSION" { print $2; exit }' .env)"
    version="${version:-latest}"
    export GRC_VERSION="${version}"
  fi
  # Export the resolved reference so compose pull and this message name the same image.
  attempted="$(attempted_app_image)"
  export GRC_IMAGE="${attempted}"
  app_pull=0
  updater_pull=0
  quiet compose_cmd pull app || app_pull=$?
  quiet compose_cmd pull updater || updater_pull=$?
  if [[ "${app_pull}" -eq 0 && "${updater_pull}" -eq 0 ]]; then
    if ! quiet compose_cmd up -d --no-build --remove-orphans; then
      echo "docker compose up failed. See ${LOG_FILE}." >&2
      exit 1
    fi
  elif [[ "${app_pull}" -eq 0 ]]; then
    echo "Published updater image $(attempted_updater_image) is not available. Building the sidecar from source next. See ${LOG_FILE}."
    ensure_source
    if ! GRC_BUILD_CONTEXT="${INSTALL_DIR}/src" quiet compose_cmd up -d --build --no-deps updater; then
      echo "updater build failed. See ${LOG_FILE}." >&2
      exit 1
    fi
    if ! quiet compose_cmd up -d --no-build --remove-orphans; then
      echo "docker compose up failed. See ${LOG_FILE}." >&2
      exit 1
    fi
  else
    echo "Published image ${attempted} is not available. Building that app image from source next. See ${LOG_FILE}."
    ensure_source
    if ! GRC_BUILD_CONTEXT="${INSTALL_DIR}/src" quiet compose_cmd up -d --build --remove-orphans; then
      echo "docker compose up failed. See ${LOG_FILE}." >&2
      exit 1
    fi
  fi
  if [[ "${BIND_MODE}" == "local" || "${BIND_MODE}" == "public" ]]; then
    if ! quiet compose_cmd up -d --force-recreate --no-deps app; then
      echo "Could not recreate the app container for BIND_ADDRESS. See ${LOG_FILE}." >&2
      exit 1
    fi
  fi
}

prepare_log() {
  LOG_FILE="${INSTALL_DIR}/install.log"
  umask 077
  touch "${LOG_FILE}"
  chmod 600 "${LOG_FILE}"
}

main() {
  require_docker
  require_openssl
  mkdir -p "${INSTALL_DIR}"
  cd "${INSTALL_DIR}"
  prepare_log
  echo "Installing GRCompliance. Verbose output is in ${LOG_FILE}."
  if ! quiet download_compose; then
    echo "Could not download the compose files. See ${LOG_FILE}." >&2
    exit 1
  fi
  if [[ -f .env ]]; then
    :
  else
    write_env
  fi
  ensure_updater_secret
  ensure_bind_address
  ensure_updater_state
  start_stack
  wait_for_health
}

main "$@"
