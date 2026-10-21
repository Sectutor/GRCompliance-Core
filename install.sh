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

  HEALTH_RETRIES How many /health attempts before failure (default: 90).
                 The installer stops sooner when the app container is
                 crash-looping or has exited.
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

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    cat <<'EOF' >&2
Docker is not installed or not on PATH.
  Linux: https://docs.docker.com/engine/install/
  macOS and Windows: https://www.docker.com/products/docker-desktop/
EOF
    exit 1
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

write_env() {
  local postgres_password redis_password jwt_secret encryption_key admin_password
  local app_port admin_email postgres_user postgres_db grc_version mode
  postgres_password="$(openssl rand -hex 24)"
  redis_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -hex 32)"
  encryption_key="$(openssl rand -hex 32)"
  admin_password="$(openssl rand -hex 18)"
  app_port="${APP_PORT:-3001}"
  admin_email="${ADMIN_EMAIL:-admin@grcompliance.local}"
  postgres_user="${POSTGRES_USER:-grc}"
  postgres_db="${POSTGRES_DB:-grcompliance}"
  grc_version="${GRC_VERSION:-latest}"
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
APP_URL=http://localhost:${app_port}
APP_PORT=${app_port}
GRC_VERSION=${grc_version}
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

# Literal substring replace. Secrets can contain sed metacharacters, so this
# does not go through sed.
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

url_encode_secret() {
  local raw="$1" i c hex out=""
  local len="${#raw}"
  for ((i = 0; i < len; i++)); do
    c="${raw:i:1}"
    case "${c}" in
      [a-zA-Z0-9.~_-]) out+="${c}" ;;
      *)
        hex="$(printf '%s' "${c}" | od -An -tu1 | awk '{ printf "%%%02X", $1 }')"
        out+="${hex}"
        ;;
    esac
  done
  printf '%s' "${out}"
}

secret_key_name() {
  case "$1" in
    *PASSWORD*|*SECRET*|*TOKEN*|*KEY*|DATABASE_URL) return 0 ;;
    *) return 1 ;;
  esac
}

remember_secret_value() {
  local value="$1" existing min="${2:-8}"
  [[ "${#value}" -ge "${min}" ]] || return 0
  [[ "${value}" != "***" ]] || return 0
  if ((${#SECRET_VALUES[@]})); then
    for existing in "${SECRET_VALUES[@]}"; do
      [[ "${existing}" == "${value}" ]] && return 0
    done
  fi
  SECRET_VALUES+=("${value}")
}

load_secret_values() {
  local line key value encoded min i j tmp
  SECRET_VALUES=()
  [[ -f .env ]] || return 0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    line="${line#export }"
    [[ "${line}" == *"="* ]] || continue
    key="${line%%=*}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${line#*=}"
    if [[ "${value}" == \"*\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' ]]; then
      value="${value:1:${#value}-2}"
    else
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
    fi
    secret_key_name "${key}" || continue
    min=8
    if [[ "${key}" == "ADMIN_PASSWORD" ]]; then
      min=4
    fi
    remember_secret_value "${value}" "${min}"
    # Percent-encoded copies show up in driver errors. If od/awk is missing,
    # keep the raw value redaction and still print the failure.
    if encoded="$(url_encode_secret "${value}" 2>/dev/null)"; then
      if [[ "${encoded}" != "${value}" && -n "${encoded}" ]]; then
        remember_secret_value "${encoded}" "${min}"
      fi
    fi
  done < .env

  for ((i = 0; i < ${#SECRET_VALUES[@]}; i++)); do
    for ((j = i + 1; j < ${#SECRET_VALUES[@]}; j++)); do
      if ((${#SECRET_VALUES[j]} > ${#SECRET_VALUES[i]})); then
        tmp="${SECRET_VALUES[i]}"
        SECRET_VALUES[i]="${SECRET_VALUES[j]}"
        SECRET_VALUES[j]="${tmp}"
      fi
    done
  done
}

redact_env_secrets() {
  local line secret
  load_secret_values
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if ((${#SECRET_VALUES[@]})); then
      for secret in "${SECRET_VALUES[@]}"; do
        line="$(replace_literal "${line}" "${secret}" "***")"
      done
    fi
    printf '%s\n' "${line}"
  done
  return 0
}

redacted_app_logs() {
  local raw redacted
  raw="$(compose_cmd logs --tail 80 app 2>&1 || true)"
  redacted="$(printf '%s\n' "${raw}" | redact_env_secrets)"
  if [[ -z "${redacted//[[:space:]]/}" ]]; then
    printf '%s\n' "(no app log lines)"
  else
    printf '%s\n' "${redacted}"
  fi
}

app_container_id() {
  local ids id best best_created created
  ids="$(compose_cmd ps -aq app 2>/dev/null || true)"
  best=""
  best_created=""
  while IFS= read -r id; do
    [[ -z "${id}" ]] && continue
    created="$(docker inspect --format '{{.Created}}' "${id}" 2>/dev/null || true)"
    if [[ -n "${created}" && ( -z "${best_created}" || "${created}" > "${best_created}" ) ]]; then
      best="${id}"
      best_created="${created}"
    fi
  done <<< "${ids}"
  printf '%s\n' "${best}"
}

read_app_runtime() {
  local id raw rest
  APP_STATUS="missing"
  APP_RESTARTS=0
  APP_EXIT=0
  APP_OOM="false"
  APP_POLICY=""
  APP_ERROR=""
  id="$(app_container_id)"
  [[ -n "${id}" ]] || return 0
  raw="$(docker inspect --format '{{.State.Status}}|{{.RestartCount}}|{{.State.ExitCode}}|{{.State.OOMKilled}}|{{.HostConfig.RestartPolicy.Name}}|{{.State.Error}}' "${id}" 2>/dev/null || true)"
  [[ -n "${raw}" ]] || return 0
  APP_STATUS="${raw%%|*}"
  rest="${raw#*|}"
  APP_RESTARTS="${rest%%|*}"
  rest="${rest#*|}"
  APP_EXIT="${rest%%|*}"
  rest="${rest#*|}"
  APP_OOM="${rest%%|*}"
  rest="${rest#*|}"
  APP_POLICY="${rest%%|*}"
  APP_ERROR="${rest#*|}"
}

app_watch_reset() {
  APP_WATCH_BASELINE=""
  APP_WATCH_EXITED_STREAK=0
  APP_WATCH_RESTARTING_STREAK=0
  APP_WATCH_DELTA=0
  APP_WATCH_REASON=""
}

# Decide whether the app container is crash-looping or has exited.
# A container that stays running, including one with an old RestartCount from
# an earlier failure, keeps waiting so a slow boot can still become healthy.
app_watch_observe() {
  local restarts status delta limit
  : "${APP_WATCH_BASELINE=}"
  : "${APP_WATCH_EXITED_STREAK:=0}"
  : "${APP_WATCH_RESTARTING_STREAK:=0}"
  status="${APP_STATUS:-missing}"
  restarts="${APP_RESTARTS:-0}"
  APP_WATCH_REASON=""
  if [[ ! "${restarts}" =~ ^[0-9]+$ ]]; then
    restarts=0
  fi
  if [[ "${status}" == "missing" ]]; then
    APP_WATCH_EXITED_STREAK=0
    APP_WATCH_RESTARTING_STREAK=0
    APP_WATCH_DELTA=0
    return 0
  fi
  if [[ -z "${APP_WATCH_BASELINE}" ]]; then
    APP_WATCH_BASELINE="${restarts}"
  fi
  delta=$((restarts - APP_WATCH_BASELINE))
  if ((delta < 0)); then
    APP_WATCH_BASELINE="${restarts}"
    delta=0
  fi
  APP_WATCH_DELTA="${delta}"

  case "${status}" in
    restarting)
      APP_WATCH_RESTARTING_STREAK=$((APP_WATCH_RESTARTING_STREAK + 1))
      APP_WATCH_EXITED_STREAK=0
      ;;
    exited|dead)
      APP_WATCH_EXITED_STREAK=$((APP_WATCH_EXITED_STREAK + 1))
      APP_WATCH_RESTARTING_STREAK=0
      ;;
    *)
      APP_WATCH_RESTARTING_STREAK=0
      APP_WATCH_EXITED_STREAK=0
      ;;
  esac

  limit="${GRC_CRASH_RESTART_LIMIT:-3}"
  if [[ ! "${limit}" =~ ^[1-9][0-9]*$ ]]; then
    limit=3
  fi
  if ((delta >= limit)); then
    APP_WATCH_REASON="crash-loop"
    return 0
  fi
  if [[ "${status}" == "dead" ]]; then
    APP_WATCH_REASON="exited"
    return 0
  fi
  if [[ "${status}" == "exited" && "${APP_POLICY:-}" == "no" ]]; then
    APP_WATCH_REASON="exited"
    return 0
  fi
  if ((APP_WATCH_EXITED_STREAK >= 2)); then
    APP_WATCH_REASON="exited"
    return 0
  fi
  if ((APP_WATCH_RESTARTING_STREAK >= 2)); then
    APP_WATCH_REASON="crash-loop"
    return 0
  fi
  return 0
}

app_status_phrase() {
  case "${APP_STATUS:-missing}" in
    missing) printf '%s\n' "app container not created yet" ;;
    created) printf '%s\n' "app container waiting to start" ;;
    running) printf '%s\n' "app container running" ;;
    restarting) printf '%s\n' "app container restarting" ;;
    exited) printf '%s\n' "app container exited" ;;
    dead) printf '%s\n' "app container dead" ;;
    *) printf '%s\n' "app status ${APP_STATUS}" ;;
  esac
}

health_failure_summary() {
  local delta oom_note
  delta="${APP_WATCH_DELTA:-0}"
  oom_note=""
  if [[ "${APP_OOM:-false}" == "true" ]]; then
    oom_note=" The last exit was an out-of-memory kill."
  fi
  case "${1}" in
    crash-loop)
      printf '%s\n' \
        "GRCompliance stopped waiting for /health because the app container is crash-looping." \
        "Status: ${APP_STATUS}. Exit code: ${APP_EXIT}. Docker restart count: ${APP_RESTARTS}. New restarts during this wait: ${delta}.${oom_note}" \
        "Startup is exiting repeatedly, so further /health attempts would wait on the same failure."
      ;;
    exited)
      printf '%s\n' \
        "GRCompliance stopped waiting for /health because the app container has exited and is not running again." \
        "Status: ${APP_STATUS}. Exit code: ${APP_EXIT}. Docker restart count: ${APP_RESTARTS}. New restarts during this wait: ${delta}.${oom_note}"
      ;;
    *)
      printf '%s\n' \
        "GRCompliance did not return HTTP 200 from /health after ${HEALTH_RETRIES} attempts." \
        "$(app_status_phrase). Restarts during this wait: ${delta}."
      ;;
  esac
}

report_health_failure() {
  local summary logs error_line
  summary="$(health_failure_summary "$1")"
  logs="$(redacted_app_logs)"
  error_line=""
  if [[ -n "${APP_ERROR:-}" ]]; then
    error_line="$(printf '%s\n' "${APP_ERROR}" | redact_env_secrets)"
  fi
  {
    printf '%s\n' "${summary}"
    if [[ -n "${error_line}" ]]; then
      printf '%s\n' "Docker reported: ${error_line}"
    fi
    printf '%s\n' "Last app and bootstrap log lines (secrets redacted):"
    printf '%s\n' "${logs}"
    printf '%s\n' ""
    printf '%s\n' "Next steps, from ${INSTALL_DIR}:"
    printf '%s\n' "  docker compose ps -a"
    printf '%s\n' "  docker compose logs --tail 100 app"
    printf '%s\n' "If those lines say the host db or redis cannot be resolved, the app container is not on the compose network with Postgres and Redis. That happens when the app is attached to the host network. This installer does not change networking or firewall rules."
    printf '%s\n' "After fixing the cause, run:"
    printf '%s\n' "  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --upgrade"
  } >&2
  exit 1
}

sample_app_once() {
  read_app_runtime
  app_watch_observe
}

wait_for_health() {
  local port attempt code phrase delta last_phrase
  port="$(app_port_from_env)"
  app_watch_reset
  last_phrase=""
  echo "Waiting for GRCompliance to return HTTP 200 on port ${port} (${HEALTH_RETRIES} attempts, 5s apart)..."
  for attempt in $(seq 1 "${HEALTH_RETRIES}"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${port}/health" 2>/dev/null || true)"
    if [[ "${code}" == "200" ]]; then
      echo "GRCompliance is up: http://127.0.0.1:${port}"
      echo "Sign in with the administrator email in .env."
      if [[ "${FRESH}" -eq 1 ]]; then
        echo "The first start loads the Latore LTD demo workspace."
      fi
      if [[ "${UPGRADE}" -eq 1 ]]; then
        echo "Upgrade finished. The existing .env was left unchanged."
      fi
      echo "Upgrade later with:"
      echo "  curl -fsSL ${RAW_BASE}/install.sh | bash -s -- --upgrade"
      return 0
    fi
    sample_app_once
    if [[ -z "${APP_WATCH_REASON}" && "${APP_STATUS}" =~ ^(restarting|exited|dead)$ ]]; then
      sleep 1
      sample_app_once
    fi
    if [[ -n "${APP_WATCH_REASON}" ]]; then
      report_health_failure "${APP_WATCH_REASON}"
    fi
    phrase="$(app_status_phrase)"
    delta="${APP_WATCH_DELTA:-0}"
    if [[ "${attempt}" -eq 1 || $((attempt % 3)) -eq 0 || "${phrase}" != "${last_phrase}" ]]; then
      echo "Still waiting for HTTP 200 (attempt ${attempt}/${HEALTH_RETRIES}; ${phrase}; restarts during this wait: ${delta})."
      last_phrase="${phrase}"
    fi
    if [[ "${attempt}" -lt "${HEALTH_RETRIES}" ]]; then
      sleep 5
    fi
  done
  report_health_failure "timeout"
}

start_stack() {
  local version
  version="$(awk -F= '$1=="GRC_VERSION" { print $2 }' .env)"
  version="${version:-latest}"
  export GRC_VERSION="${version}"
  if compose_cmd pull app; then
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
  start_stack
  wait_for_health
}

main "$@"
