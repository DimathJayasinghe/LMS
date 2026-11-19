#!/bin/sh
set -e

# Only apply migrations from the main backend (not the worker).
# Check if the CMD is the default "npm run start" (i.e., NOT "npm run worker").
# Migration failure is fatal: serving code against an unknown schema is unsafe.
if [ "$1" = "npm" ] && [ "$2" = "run" ] && [ "$3" = "start" ]; then
  echo "Applying pending Prisma migrations..."
  if ! migration_output="$(npx --no-install prisma migrate deploy 2>&1)"; then
    printf '%s\n' "$migration_output"
    case "$migration_output" in
      *P3005*)
        echo "Migration adoption required: this non-empty database has no Prisma migration history."
        echo "Do not delete the database volume or run prisma db push."
        echo "Follow 'One-time adoption for a database previously managed by db push' in the database migration guide."
        ;;
    esac
    exit 1
  fi
  printf '%s\n' "$migration_output"

  if [ -n "$LMS_ADMIN_EMAIL" ] && [ -n "$LMS_ADMIN_PASSWORD" ]; then
    echo "Seeding super admin account from LMS_ADMIN_EMAIL / LMS_ADMIN_PASSWORD..."
    node dist/scripts/seed-admin.js || echo "Warning: admin seed failed — continuing startup"
  else
    echo "Skipping admin seed: LMS_ADMIN_EMAIL / LMS_ADMIN_PASSWORD not set"
  fi
fi

# Execute the original command (npm run start / npm run worker)
exec "$@"
