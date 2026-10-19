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

  HEALTH_RETRIES How many /health attempts before failure (default: 90)
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

wait_for_health() {
  local port attempt code
  port="$(app_port_from_env)"
  echo "Waiting for GRCompliance to return HTTP 200 on port ${port} (${HEALTH_RETRIES} attempts)..."
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
    if [[ "${attempt}" -lt "${HEALTH_RETRIES}" ]]; then
      sleep 5
    fi
  done
  cat <<EOF >&2
GRCompliance did not return HTTP 200 from /health after ${HEALTH_RETRIES} attempts.
Inspect the stack from ${INSTALL_DIR}:
  docker compose logs
  docker compose logs app
EOF
  exit 1
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
