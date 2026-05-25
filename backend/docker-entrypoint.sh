#!/bin/sh
set -e

# Only run prisma db push for the main backend (not the worker).
# Check if the CMD is the default "npm run start" (i.e., NOT "npm run worker").
# This avoids duplicate migration runs and prevents leaking the datasource URL.
if [ "$1" = "npm" ] && [ "$2" = "run" ] && [ "$3" = "start" ]; then
  echo "Running prisma db push..."
  npx prisma db push 2>&1 | grep -v "Datasource" || echo "Warning: prisma db push failed — DB may be out of sync"
fi

# Execute the original command (npm run start / npm run worker)
exec "$@"
