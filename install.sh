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

usage() {
  cat <<'EOF'
Usage: install.sh [--upgrade] [--dir PATH]

  --dir PATH   Install directory (default: ~/grcompliance or $GRC_HOME)
  --upgrade    Pull the current image, or rebuild from source, without touching .env
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --upgrade)
      UPGRADE=1
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
}

write_env() {
  local postgres_password redis_password jwt_secret encryption_key admin_password
  local app_port admin_email postgres_user postgres_db grc_version
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
  echo "Created ${INSTALL_DIR}/.env with mode 600."
  echo "Admin email: ${admin_email}"
  echo "Admin password (shown once): ${admin_password}"
  echo "Store this password now. It will not be printed again."
}

download_compose() {
  local tmp
  tmp="$(mktemp)"
  curl -fsSL "${RAW_BASE}/docker-compose.yml" -o "${tmp}"
  mv "${tmp}" docker-compose.yml
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
  local port ready
  port="$(app_port_from_env)"
  ready=0
  echo "Waiting for GRCompliance to become healthy on port ${port}..."
  for _ in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 5
  done
  if [[ "${ready}" -ne 1 ]]; then
    echo "GRCompliance did not become healthy. Inspect logs with: docker compose logs app" >&2
    exit 1
  fi
  echo "GRCompliance is up: http://127.0.0.1:${port}"
  echo "Sign in with the administrator email in .env."
  echo "The first start loads the Latore LTD demo workspace."
  if [[ "${UPGRADE}" -eq 1 ]]; then
    echo "Upgrade finished. The existing .env was left unchanged."
  fi
}

start_stack() {
  local version
  version="$(awk -F= '$1=="GRC_VERSION" { print $2 }' .env)"
  version="${version:-latest}"
  export GRC_VERSION="${version}"
  if docker compose pull app; then
    docker compose up -d --no-build --remove-orphans
  else
    echo "Published image ${IMAGE}:${version} is not available. Building from source."
    ensure_source
    GRC_BUILD_CONTEXT="${INSTALL_DIR}/src" docker compose up -d --build --remove-orphans
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
