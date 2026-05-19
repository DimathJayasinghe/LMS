#!/usr/bin/env sh
set -e

STAMP_FILE="node_modules/.deps-stamp"

calc_deps_hash() {
  if [ -f package-lock.json ]; then
    sha256sum package.json package-lock.json | sha256sum | awk '{print $1}'
  else
    sha256sum package.json | awk '{print $1}'
  fi
}

# Install deps when node_modules is missing, empty, or stale.
CURRENT_HASH="$(calc_deps_hash)"
if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ] \
  || [ ! -f "$STAMP_FILE" ] || [ "$(cat "$STAMP_FILE")" != "$CURRENT_HASH" ]; then
  npm install
  echo "$CURRENT_HASH" > "$STAMP_FILE"
fi

# Ensure Prisma client exists in the container.
npx prisma generate

exec npm run dev
