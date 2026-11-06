#!/usr/bin/env bash
# Disposable proof: local tags N -> N+1 with data intact, then a failing image rolls back.
# GHCR is not required. See docs/updates.md.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not available" >&2
  exit 1
fi

work="$(mktemp -d /tmp/grc-upgrade-proof.XXXXXX)"
postgres_password="$(openssl rand -hex 24)"
updater_secret="$(openssl rand -hex 32)"
port="${APP_PORT:-18081}"
export PROOF_DIR="$work"
export GRC_BUILD_CONTEXT="$root"
export POSTGRES_PASSWORD="$postgres_password"
export UPDATER_SECRET="$updater_secret"
export GRC_VERSION="1.0.0"
export GRC_IMAGE="grc-proof:1.0.0"
export APP_PORT="$port"

cleanup() {
  docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

manifest() {
  local version="$1" tag="$2" notes="$3"
  local digest
  digest="$(docker image inspect "grc-proof:${tag}" --format '{{.Id}}')"
  cat > "$work/manifest.json" <<EOF
{
  "edition": "core",
  "version": "${version}",
  "releasedAt": "2026-11-06T00:00:00.000Z",
  "notes": "${notes}",
  "image": { "name": "grc-proof", "tag": "${tag}", "digest": "${digest}" },
  "artifact": null,
  "minSchemaVersion": 1,
  "changelogUrl": "https://github.com/Sectutor/GRCompliance-Core/blob/main/CHANGELOG.md"
}
EOF
}

screenshot() {
  local name="$1" url="$2"
  local dest="/opt/cursor/artifacts/${name}.png"
  mkdir -p /opt/cursor/artifacts
  local browser=""
  for candidate in google-chrome chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      browser="$candidate"
      break
    fi
  done
  if [[ -z "$browser" ]]; then
    echo "No Chromium-compatible browser; skipped screenshot ${name}" >&2
    return 0
  fi
  local profile
  profile="$(mktemp -d)"
  timeout 25 "$browser" --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage \
    --user-data-dir="$profile" --virtual-time-budget=4000 \
    --window-size=1280,900 --screenshot="$dest" "$url" >/tmp/chrome-shot.log 2>&1 || true
  rm -rf "$profile"
  if [[ -f "$dest" ]]; then
    echo "Screenshot ${dest}"
  else
    echo "Screenshot ${name} was not written" >&2
  fi
}

wait_http() {
  local url="$1" expect="$2" tries="${3:-60}"
  local i body
  for i in $(seq 1 "$tries"); do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null || true)"
    if [[ "$body" == *"$expect"* ]]; then
      printf '%s\n' "$body"
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for ${expect} at ${url}" >&2
  docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" ps >&2 || true
  docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" logs --no-color --tail 80 >&2 || true
  return 1
}

docker ps -aq --filter name=grcproof | xargs -r docker rm -f >/dev/null 2>&1 || true
docker volume ls -q --filter name=grcproof | xargs -r docker volume rm >/dev/null 2>&1 || true

echo "Building local proof tags 1.0.0, 1.1.0, and failing 1.2.0"
docker build -f updater/proof/Dockerfile --build-arg PROOF_VERSION=1.0.0 --build-arg PROOF_SCHEMA=1 --build-arg PROOF_FAIL=0 -t grc-proof:1.0.0 "$root"
docker build -f updater/proof/Dockerfile --build-arg PROOF_VERSION=1.1.0 --build-arg PROOF_SCHEMA=2 --build-arg PROOF_FAIL=0 -t grc-proof:1.1.0 "$root"
docker build -f updater/proof/Dockerfile --build-arg PROOF_VERSION=1.2.0 --build-arg PROOF_SCHEMA=3 --build-arg PROOF_FAIL=1 -t grc-proof:1.2.0 "$root"

mkdir -p "$work/updater-state"
: > "$work/updater-state/release.env"
umask 077
cat > "$work/.env" <<EOF
POSTGRES_PASSWORD=${postgres_password}
UPDATER_SECRET=${updater_secret}
GRC_VERSION=1.0.0
GRC_IMAGE=grc-proof:1.0.0
PROOF_DIR=${work}
GRC_BUILD_CONTEXT=${root}
APP_PORT=${port}
EOF
cp docker-compose.proof.yml "$work/docker-compose.yml"
manifest "1.1.0" "1.1.0" "Proof upgrade to 1.1.0"

docker pull docker.io/pgvector/pgvector:pg16
docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" up -d --build --pull never
wait_http "http://127.0.0.1:${port}/health" '"version":"1.0.0"' >/dev/null

docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" exec -T \
  -e "PGPASSWORD=${postgres_password}" app \
  psql -h db -U grc -d grcompliance -c "UPDATE proof_marker SET note = 'latore-marker-kept' WHERE id = 1" >/dev/null
docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" exec -T app \
  sh -c 'printf custom-upload > /app/uploads/custom.txt'

app_id="$(docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" ps -q app)"
updater_id="$(docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" ps -q updater)"
app_mounts="$(docker inspect "$app_id" --format '{{json .Mounts}}')"
updater_mounts="$(docker inspect "$updater_id" --format '{{json .Mounts}}')"
if [[ "$app_mounts" == *"docker.sock"* ]]; then
  echo "App container has the Docker socket" >&2
  exit 1
fi
if [[ "$updater_mounts" != *"docker.sock"* ]]; then
  echo "Updater container is missing the Docker socket" >&2
  exit 1
fi

page="$(wait_http "http://127.0.0.1:${port}/" "Update available → Upgrade now")"
if [[ "$page" != *"latore-marker-kept"* ]]; then
  echo "Marker was not visible before upgrade" >&2
  exit 1
fi
screenshot "upgrade-available" "http://127.0.0.1:${port}/"

echo "Upgrading 1.0.0 -> 1.1.0"
curl -fsS -X POST "http://127.0.0.1:${port}/api/updates/upgrade" >/dev/null
status="$(wait_http "http://127.0.0.1:${port}/api/updates/status" '"state":"succeeded"' 60)"
if [[ "$status" != *'"currentVersion":"1.1.0"'* ]]; then
  echo "Success status did not report 1.1.0: $status" >&2
  exit 1
fi
proof="$(curl -fsS "http://127.0.0.1:${port}/api/proof")"
if [[ "$proof" != *'"note":"latore-marker-kept"'* || "$proof" != *'"uploadsMarker":"uploads-marker"'* || "$proof" != *'"version":"1.1.0"'* || "$proof" != *'"schemaVersion":2'* ]]; then
  echo "Data did not survive the upgrade: $proof" >&2
  exit 1
fi
custom="$(docker compose -f "$work/docker-compose.yml" --env-file "$work/.env" exec -T app cat /app/uploads/custom.txt)"
if [[ "$custom" != custom-upload* ]]; then
  echo "Custom upload did not survive: $custom" >&2
  exit 1
fi
screenshot "upgrade-n-plus-1" "http://127.0.0.1:${port}/"

echo "Forcing failure 1.1.0 -> 1.2.0"
manifest "1.2.0" "1.2.0" "Proof failure"
curl -fsS -X POST "http://127.0.0.1:${port}/api/updates/check" >/dev/null
curl -fsS -X POST "http://127.0.0.1:${port}/api/updates/upgrade" >/dev/null
failed="$(wait_http "http://127.0.0.1:${port}/api/updates/status" '"rolledBack":true' 60)"
if [[ "$failed" != *'"currentVersion":"1.1.0"'* ]]; then
  echo "Rollback did not return to 1.1.0: $failed" >&2
  exit 1
fi
proof="$(curl -fsS "http://127.0.0.1:${port}/api/proof")"
if [[ "$proof" != *'"note":"latore-marker-kept"'* || "$proof" != *'"version":"1.1.0"'* || "$proof" != *'"schemaVersion":2'* ]]; then
  echo "Rollback did not keep data: $proof" >&2
  exit 1
fi
health="$(curl -fsS "http://127.0.0.1:${port}/health")"
if [[ "$health" != *'"version":"1.1.0"'* ]]; then
  echo "Health is not the rolled-back version: $health" >&2
  exit 1
fi
screenshot "upgrade-rolled-back" "http://127.0.0.1:${port}/?hold=1"
echo "Proof passed"
echo "$proof"
