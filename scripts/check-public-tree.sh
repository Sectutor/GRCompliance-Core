#!/usr/bin/env bash
# Fail if tracked files are internal docs or contain internal-doc markers.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  mapfile -t files < <(git ls-files)
else
  mapfile -t files < <(find . -type f -not -path './.git/*' -printf '%P\n')
fi

failed=0
for path in "${files[@]}"; do
  case "$path" in
    .cursor/*|.claude/*|plans/*|notes/*|internal/*|uploads/*|packages/core/tmp_build/*)
      echo "internal path: $path"
      failed=1
      ;;
    *.chat.md|sendgrid.env|p1.json|p2.json|sales-forecast.md|.env.scalability)
      echo "internal path: $path"
      failed=1
      ;;
  esac
done

# These strings identify operator material that must not return.
# The patterns live in this script, so the search skips this file.
marker_re='INTERNAL_DOC|<!-- internal-only -->|intellfence|pooler\.supabase\.com'
if command -v rg >/dev/null 2>&1; then
  if rg -n -e "$marker_re" -g '!scripts/check-public-tree.sh' -g '!.git/**' -g '!node_modules/**' . ; then
    echo "internal marker found"
    failed=1
  fi
elif grep -R -n -E -e "$marker_re" --exclude=check-public-tree.sh --exclude-dir=.git --exclude-dir=node_modules . ; then
  echo "internal marker found"
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "public-tree check failed"
  exit 1
fi

echo "public-tree check ok"
