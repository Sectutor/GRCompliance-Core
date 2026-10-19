#!/bin/sh
set -eu

AUTH_MODE="${AUTH_MODE:-local}"
APP_URL="${APP_URL:-http://localhost:3001}"

case "$AUTH_MODE" in
  local|supabase) ;;
  *)
    echo "AUTH_MODE must be local or supabase" >&2
    exit 1
    ;;
esac

case "$APP_URL" in
  *\"*|*\'*|*\`*)
    echo "APP_URL contains unsupported characters" >&2
    exit 1
    ;;
esac

cat > /app/packages/core/dist/env-config.js <<EOF
window.__GRC_CONFIG__ = { authMode: "${AUTH_MODE}", appUrl: "${APP_URL}" };
EOF

echo "[entrypoint] Applying migrations and first-run seed"
./node_modules/.bin/tsx docker/bootstrap.ts

echo "[entrypoint] Starting GRCompliance"
exec ./node_modules/.bin/tsx server_entry.ts
