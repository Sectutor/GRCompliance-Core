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
SECRET_ADDED=0
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
  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --dir PATH

The installer is not copied into the install directory. Upgrade with the curl command above.

  --dir PATH     Install directory (default: ~/grcompliance or \$GRC_HOME)
  --upgrade      Pull the current image, or rebuild from source, without touching .env
  --bind-local   Also publish Postgres and Redis on 127.0.0.1 (off by default)

  APP_URL        Address the app accepts. Default: http://localhost:\$APP_PORT
  PUBLIC_URL     Used when APP_URL is unset
  HEALTH_RETRIES How many /health attempts before failure (default: 90).
                 The installer stops sooner when the app container is
                 crash-looping or has exited.

  On Ubuntu or Debian the installer can install Docker only after you answer yes.
  It can also ask to join Tailscale. Both default to no without a terminal.
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

prompt_yes() {
  local question="$1" reply=""
  if [[ ! -t 0 ]]; then
    echo "${question} [y/N] No terminal is attached, so the answer is No." >&2
    return 1
  fi
  read -r -p "${question} [y/N] " reply || return 1
  case "${reply}" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

os_id() {
  local id=""
  if [[ -r /etc/os-release ]]; then
    id="$(. /etc/os-release && printf '%s' "${ID:-}")"
  fi
  printf '%s\n' "${id}"
}

offer_docker_install() {
  local id script
  id="$(os_id)"
  echo "Docker is not installed or not on PATH." >&2
  if [[ "${id}" != "ubuntu" && "${id}" != "debian" ]]; then
    cat <<'EOF' >&2
  Linux: https://docs.docker.com/engine/install/
  macOS and Windows: https://www.docker.com/products/docker-desktop/
EOF
    exit 1
  fi
  if ! prompt_yes "Install Docker for me?"; then
    echo "Docker was not installed. Install it from https://docs.docker.com/engine/install/ and run this again." >&2
    exit 1
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required to install Docker." >&2
    exit 1
  fi
  script="$(mktemp)"
  curl -fsSL https://get.docker.com -o "${script}"
  sudo sh "${script}"
  rm -f "${script}"
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker still is not on PATH after the installer." >&2
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

write_env() {
  local postgres_password redis_password jwt_secret encryption_key admin_password
  local app_port admin_email postgres_user postgres_db grc_version mode public_url
  postgres_password="$(openssl rand -hex 24)"
  redis_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -hex 32)"
  encryption_key="$(openssl rand -hex 32)"
  admin_password="$(openssl rand -hex 18)"
  app_port="${APP_PORT:-3001}"
  public_url="$(resolve_public_url "${app_port}")"
  admin_email="${ADMIN_EMAIL:-admin@grcompliance.local}"
  postgres_user="${POSTGRES_USER:-grc}"
  postgres_db="${POSTGRES_DB:-grcompliance}"
  grc_version="${GRC_VERSION:-latest}"
  updater_secret="$(openssl rand -hex 32)"
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
GRC_VERSION=${grc_version}
GRC_UPDATER_VERSION=${GRC_UPDATER_VERSION:-1}
GRC_AIRGAP=${airgap}
UPDATER_SECRET=${updater_secret}
AUTH_MODE=local
EOF
  chmod 600 .env
  if stat -c '%a' .env >/dev/null 2>&1; then
    mode="$(stat -c '%a' .env)"
  else
    mode="$(stat -f '%OLp' .env)"
  fi
  if [[ "${mode}" != "600" ]]; then
    echo "Refusing to continue: ${INSTALL_DIR}/.env mode is ${mode}, expected 600." >&2
    exit 1
  fi
  echo "Created ${INSTALL_DIR}/.env with mode 600."
  FRESH=1
  echo "Admin email: ${admin_email}"
  echo "Admin password (shown once): ${admin_password}"
  echo "Store this password now. It will not be printed again."
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
  echo "Added UPDATER_SECRET to ${INSTALL_DIR}/.env. Other values were not changed."
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

ensure_source() {
  if ! command -v git >/dev/null 2>&1; then
    echo "git is required to build the image locally because ${IMAGE} is not available yet." >&2
    exit 1
  fi
  if [[ -d src/.git ]]; then
    git -C src fetch --depth 1 origin "${GIT_REF}"
    git -C src checkout --detach FETCH_HEAD
  else
    rm -rf src
    git clone --depth 1 --branch "${GIT_REF}" "${GIT_URL}" src
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

replace_literal() {
  local text="$1" search="$2" repl="$3" out="" remain
  remain="$text"
  if [[ -z "${search}" || "${search}" == "${repl}" ]]; then
    printf '%s' "${text}"
    return 0
  fi
  while [[ "${remain}" == *"${search}"* ]]; do
    out+="${remain%%"${search}"*}${repl}"
    remain="${remain#*"${search}"}"
  done
  printf '%s%s' "${out}" "${remain}"
}

redact_line() {
  local line="$1" secret
  if ((${#SECRET_VALUES[@]})); then
    for secret in "${SECRET_VALUES[@]}"; do
      line="$(replace_literal "${line}" "${secret}" "***")"
    done
  fi
  printf '%s\n' "${line}"
}

load_secret_values() {
  local line key value
  SECRET_VALUES=()
  [[ -f .env ]] || return 0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%%$'\r'}"
    [[ -z "${line}" || "${line}" == \#* || "${line}" != *"="* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "${key}" in
      *PASSWORD*|*SECRET*|*TOKEN*|*KEY*|DATABASE_URL) ;;
      *) continue ;;
    esac
    [[ ${#value} -ge 8 ]] || continue
    SECRET_VALUES+=("${value}")
  done < .env
}

redacted_app_logs() {
  local raw line
  raw="$(compose_cmd logs --tail 40 app 2>&1 || true)"
  load_secret_values
  if [[ -z "${raw//[[:space:]]/}" ]]; then
    printf '%s\n' "(no app log lines)"
    return 0
  fi
  while IFS= read -r line || [[ -n "${line}" ]]; do
    redact_line "${line}"
  done <<< "${raw}"
}

app_container_id() {
  compose_cmd ps -q app 2>/dev/null | head -n 1 || true
}

read_app_runtime() {
  local id raw rest
  APP_STATUS="missing"
  APP_RESTARTS=0
  APP_EXIT=0
  APP_POLICY=""
  id="$(app_container_id)"
  [[ -n "${id}" ]] || return 0
  raw="$(docker inspect --format '{{.State.Status}}|{{.RestartCount}}|{{.State.ExitCode}}|{{.HostConfig.RestartPolicy.Name}}' "${id}" 2>/dev/null || true)"
  [[ -n "${raw}" ]] || return 0
  APP_STATUS="${raw%%|*}"
  rest="${raw#*|}"
  APP_RESTARTS="${rest%%|*}"
  rest="${rest#*|}"
  APP_EXIT="${rest%%|*}"
  rest="${rest#*|}"
  APP_POLICY="${rest%%|*}"
}

app_watch_reset() {
  APP_WATCH_BASELINE=""
  APP_WATCH_EXITED=0
  APP_WATCH_RESTARTING=0
  APP_WATCH_REASON=""
}

app_watch_observe() {
  local restarts="${APP_RESTARTS:-0}" delta
  APP_WATCH_REASON=""
  [[ "${restarts}" =~ ^[0-9]+$ ]] || restarts=0
  if [[ -z "${APP_WATCH_BASELINE}" ]]; then
    APP_WATCH_BASELINE="${restarts}"
  fi
  delta=$((restarts - APP_WATCH_BASELINE))
  ((delta < 0)) && delta=0
  APP_WATCH_DELTA="${delta}"
  case "${APP_STATUS}" in
    restarting) APP_WATCH_RESTARTING=$((APP_WATCH_RESTARTING + 1)); APP_WATCH_EXITED=0 ;;
    exited|dead) APP_WATCH_EXITED=$((APP_WATCH_EXITED + 1)); APP_WATCH_RESTARTING=0 ;;
    *) APP_WATCH_RESTARTING=0; APP_WATCH_EXITED=0 ;;
  esac
  if ((delta >= 3)) || ((APP_WATCH_RESTARTING >= 2)); then
    APP_WATCH_REASON="crash-loop"
  elif [[ "${APP_STATUS}" == "dead" ]] || { [[ "${APP_STATUS}" == "exited" ]] && [[ "${APP_POLICY}" == "no" ]]; } || ((APP_WATCH_EXITED >= 2)); then
    APP_WATCH_REASON="exited"
  fi
}

report_health_failure() {
  local logs
  logs="$(redacted_app_logs)"
  {
    if [[ "$1" == "crash-loop" ]]; then
      echo "GRCompliance stopped waiting for /health because the app container is crash-looping."
    elif [[ "$1" == "exited" ]]; then
      echo "GRCompliance stopped waiting for /health because the app container has exited."
    else
      echo "GRCompliance did not return HTTP 200 from /health after ${HEALTH_RETRIES} attempts."
    fi
    echo "Last app log lines (secrets redacted):"
    printf '%s\n' "${logs}"
    echo "Next steps, from ${INSTALL_DIR}:"
    echo "  docker compose ps -a"
    echo "  docker compose logs --tail 100 app"
    echo "After fixing the cause, run:"
    echo "  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --upgrade"
  } >&2
  exit 1
}

print_reach_urls() {
  local port="$1" ip="" ts=""
  echo "On this machine: http://127.0.0.1:${port}"
  ip="$(hostname -I 2>/dev/null | awk '{ print $1 }' || true)"
  if [[ -n "${ip}" && "${ip}" != 127.* ]]; then
    echo "On your network: http://${ip}:${port}"
  fi
  if command -v tailscale >/dev/null 2>&1; then
    ts="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
    if [[ -n "${ts}" ]]; then
      echo "On your private network: http://${ts}:${port}"
    fi
  fi
}

offer_tailscale() {
  local id
  if ! prompt_yes "Join a private network with Tailscale?"; then
    return 0
  fi
  echo "This joins a private network you control. We do not receive a copy of your data."
  if ! command -v tailscale >/dev/null 2>&1; then
    id="$(os_id)"
    if [[ "${id}" == "ubuntu" || "${id}" == "debian" ]] && prompt_yes "Install the Tailscale client now?"; then
      if command -v sudo >/dev/null 2>&1; then
        curl -fsSL https://tailscale.com/install.sh | sudo sh || echo "Tailscale was not installed." >&2
      else
        echo "sudo is required to install Tailscale." >&2
        return 0
      fi
    else
      echo "You can install Tailscale later from https://tailscale.com/download and run: sudo tailscale up" >&2
      return 0
    fi
  fi
  if command -v tailscale >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
    sudo tailscale up || echo "Tailscale did not finish. You can run: sudo tailscale up" >&2
  fi
}

wait_for_health() {
  local port attempt code public_url
  port="$(app_port_from_env)"
  app_watch_reset
  echo "Waiting for GRCompliance to return HTTP 200 on port ${port} (${HEALTH_RETRIES} attempts)..."
  for attempt in $(seq 1 "${HEALTH_RETRIES}"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${port}/health" 2>/dev/null || true)"
    if [[ "${code}" == "200" ]]; then
      public_url="$(app_url_from_env)"
      echo "GRCompliance is up: ${public_url}"
      print_reach_urls "${port}"
      echo "Open that address in a browser. It is the APP_URL this install accepts."
      echo "Sign in with the administrator email in .env."
      if [[ "${FRESH}" -eq 1 ]]; then
        echo "The first start loads the Latore LTD demo workspace."
      else
        echo "Re-run left the existing database and uploaded files in place."
      fi
      if [[ "${UPGRADE}" -eq 1 ]]; then
        if [[ "${SECRET_ADDED}" -eq 1 ]]; then
          echo "Upgrade finished. Existing secrets were kept. UPDATER_SECRET was added because it was missing."
        else
          echo "Upgrade finished. The existing .env was left unchanged."
        fi
      fi
      echo "Upgrade later with:"
      echo "  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --upgrade"
      offer_tailscale || true
      return 0
    fi
    read_app_runtime
    app_watch_observe
    if [[ -n "${APP_WATCH_REASON}" ]]; then
      report_health_failure "${APP_WATCH_REASON}"
    fi
    if [[ "${attempt}" -eq 1 || $((attempt % 3)) -eq 0 ]]; then
      echo "Still waiting for HTTP 200 (attempt ${attempt}/${HEALTH_RETRIES}; ${APP_STATUS:-missing})."
    fi
    if [[ "${attempt}" -lt "${HEALTH_RETRIES}" ]]; then
      sleep 5
    fi
  done
  report_health_failure "timeout"
}

start_stack() {
  local version image app_pull updater_pull
  version="$(awk -F= '$1=="GRC_VERSION" { print $2 }' .env)"
  version="${version:-latest}"
  export GRC_VERSION="${version}"
  image="$(awk -F= '$1=="GRC_IMAGE" { print substr($0, index($0, "=")+1); exit }' .env)"
  if [[ -n "${image}" ]]; then
    export GRC_IMAGE="${image}"
  fi
  app_pull=0
  updater_pull=0
  compose_cmd pull app || app_pull=$?
  compose_cmd pull updater || updater_pull=$?
  if [[ "${app_pull}" -eq 0 && "${updater_pull}" -eq 0 ]]; then
    compose_cmd up -d --no-build --remove-orphans
  elif [[ "${app_pull}" -eq 0 ]]; then
    echo "Published updater image is not available. Building the sidecar from source."
    ensure_source
    GRC_BUILD_CONTEXT="${INSTALL_DIR}/src" compose_cmd up -d --build --no-deps updater
    compose_cmd up -d --no-build --remove-orphans
  else
    echo "Published image ${IMAGE}:${version} is not available. Building from source."
    ensure_source
    GRC_BUILD_CONTEXT="${INSTALL_DIR}/src" compose_cmd up -d --build --remove-orphans
  fi
}

main() {
  require_docker
  require_openssl
  mkdir -p "${INSTALL_DIR}"
  cd "${INSTALL_DIR}"
  download_compose
  if [[ -f .env ]]; then
    echo "Keeping existing ${INSTALL_DIR}/.env"
  else
    write_env
  fi
  ensure_updater_secret
  ensure_updater_state
  start_stack
  wait_for_health
}

if [[ "${GRC_INSTALL_LIB:-0}" != "1" ]]; then
  main "$@"
fi
