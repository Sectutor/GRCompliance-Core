#!/bin/sh
set -eu

AUTH_MODE="${AUTH_MODE:-local}"
APP_URL="${APP_URL:-}"

case "$AUTH_MODE" in
  local|supabase) ;;
  *)
    echo "AUTH_MODE must be local or supabase" >&2
    exit 1
    ;;
esac

case "$APP_URL" in
  http://*|https://*) ;;
  *)
    echo "APP_URL must be an absolute http(s) URL for this instance" >&2
    exit 1
    ;;
esac

case "$APP_URL" in
  *\"*|*\'*|*\`*)
    echo "APP_URL contains unsupported characters" >&2
    exit 1
    ;;
esac

case "$APP_URL" in
  *://grcompliance.com|*://grcompliance.com/*|*://grcompliance.com:*|\
  *://*.grcompliance.com|*://*.grcompliance.com/*|*://*.grcompliance.com:*)
    echo "APP_URL must be this instance's own address" >&2
    exit 1
    ;;
esac

COOKIE_CONSENT="false"
case "${GRC_COOKIE_CONSENT:-}" in
  1|true|TRUE|yes|YES) COOKIE_CONSENT="true" ;;
esac

cat > /app/packages/core/dist/env-config.js <<EOF
window.__GRC_CONFIG__ = { authMode: "${AUTH_MODE}", appUrl: "${APP_URL}", cookieConsent: ${COOKIE_CONSENT} };
EOF

echo "[entrypoint] Applying migrations and first-run seed"
./node_modules/.bin/tsx docker/bootstrap.ts

echo "[entrypoint] Starting GRCompliance"
exec ./node_modules/.bin/tsx server_entry.ts
