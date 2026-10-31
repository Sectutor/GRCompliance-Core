#!/usr/bin/env bash
# MCP is a Premium feature. The community core must not carry the server,
# its routes, or the v2 flag. Framework catalogue JSON is excluded because
# OWASP AISVS describes "MCP servers" as a control, not as this product.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

content=$(git grep -n -I -E \
  -e '@modelcontextprotocol' \
  -e 'packages/mcp' \
  -e 'routers/mcp' \
  -e 'MCP_V2_' \
  -- . \
  ':!packages/core/src/data/frameworks/*.catalog.json' \
  ':!scripts/check-no-mcp.sh' \
  || true)

paths=$(git ls-files | grep -E '(^|/)packages/mcp|(^|/)routers/mcp($|/)' || true)

if [ -n "$content" ] || [ -n "$paths" ]; then
  echo "MCP is a Premium feature and must not be added to the community core."
  if [ -n "$paths" ]; then
    echo "$paths"
  fi
  if [ -n "$content" ]; then
    echo "$content"
  fi
  exit 1
fi
