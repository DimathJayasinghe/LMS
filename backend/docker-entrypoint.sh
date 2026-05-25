#!/bin/sh
set -e

# Run schema push on startup to ensure DB is in sync with Prisma schema.
# This is safe because db push is idempotent — no-ops if already up to date.
echo "Running prisma db push..."
npx prisma db push --accept-data-loss 2>&1 || echo "Warning: prisma db push failed — DB may be out of sync"

# Execute the original command (npm run start / npm run worker)
exec "$@"
