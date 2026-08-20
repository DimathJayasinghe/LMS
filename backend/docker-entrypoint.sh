#!/bin/sh
set -e

# Only apply migrations from the main backend (not the worker).
# Check if the CMD is the default "npm run start" (i.e., NOT "npm run worker").
# Migration failure is fatal: serving code against an unknown schema is unsafe.
if [ "$1" = "npm" ] && [ "$2" = "run" ] && [ "$3" = "start" ]; then
  echo "Applying pending Prisma migrations..."
  npx --no-install prisma migrate deploy

  if [ -n "$LMS_ADMIN_EMAIL" ] && [ -n "$LMS_ADMIN_PASSWORD" ]; then
    echo "Seeding super admin account from LMS_ADMIN_EMAIL / LMS_ADMIN_PASSWORD..."
    node dist/scripts/seed-admin.js || echo "Warning: admin seed failed — continuing startup"
  else
    echo "Skipping admin seed: LMS_ADMIN_EMAIL / LMS_ADMIN_PASSWORD not set"
  fi
fi

# Execute the original command (npm run start / npm run worker)
exec "$@"
