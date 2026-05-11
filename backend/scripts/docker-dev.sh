#!/usr/bin/env sh
set -e

# Install deps once into the node_modules volume.
if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  npm install
fi

# Ensure Prisma client exists in the container.
npx prisma generate

exec npm run dev
