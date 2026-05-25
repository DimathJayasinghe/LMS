# Database Migration Guide — Safe, Zero-Data-Loss Workflow

> **Goal**: Apply Prisma schema changes to the production (Neon) database without ever losing existing data.

---

## Table of Contents

1. [Understanding the Two Approaches](#1-understanding-the-two-approaches)
2. [Recommended Workflow: `prisma migrate`](#2-recommended-workflow-prisma-migrate)
3. [Step-by-Step: Creating & Applying a Migration](#3-step-by-step-creating--applying-a-migration)
4. [Common Safe vs Destructive Changes](#4-common-safe-vs-destructive-changes)
5. [Handling Destructive Changes Safely](#5-handling-destructive-changes-safely)
6. [Docker / Production Deployment](#6-docker--production-deployment)
7. [Emergency: Rolling Back a Migration](#7-emergency-rolling-back-a-migration)
8. [Quick Reference Commands](#8-quick-reference-commands)

---

## 1. Understanding the Two Approaches

| Command | Purpose | Data Safety |
|---|---|---|
| `prisma db push` | Prototyping — syncs schema to DB directly | ⚠️ Can silently drop columns/tables if `--accept-data-loss` is used |
| `prisma migrate dev` | Production — generates versioned SQL migrations | ✅ You review the SQL **before** it touches the DB |

**Current setup**: The Docker entrypoint runs `prisma db push` on startup. This is fine for additive changes (new tables, new columns with defaults), but **dangerous for destructive changes** (renaming columns, removing fields, changing types).

> [!IMPORTANT]
> For production, always prefer `prisma migrate` over `prisma db push`. Migrations give you a reviewable SQL file and full rollback history.

---

## 2. Recommended Workflow: `prisma migrate`

```
Edit schema.prisma
        │
        ▼
prisma migrate dev --name <description>   ← generates SQL, applies to dev DB
        │
        ▼
Review the generated SQL file in prisma/migrations/
        │
        ▼
Commit the migration to git
        │
        ▼
prisma migrate deploy                     ← applies pending migrations to production
```

---

## 3. Step-by-Step: Creating & Applying a Migration

### Step 1 — Edit the Schema

Make your changes in `prisma/schema.prisma`. For example, adding a new field:

```prisma
model User {
  // ... existing fields ...
  avatarUrl String?   // ← new optional field (safe, no data loss)
}
```

### Step 2 — Generate the Migration (Local / Dev)

```bash
cd backend
npx prisma migrate dev --name add_user_avatar
```

This will:
- Compare your schema against the current DB state
- Generate a timestamped SQL file in `prisma/migrations/`
- Apply it to your **development** database
- Regenerate the Prisma client

### Step 3 — Review the Generated SQL

Open the generated file (e.g., `prisma/migrations/20260525_add_user_avatar/migration.sql`):

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
```

> [!TIP]
> Always read this file. If you see `DROP COLUMN`, `DROP TABLE`, or `ALTER COLUMN ... TYPE`, stop and handle it manually (see [Section 5](#5-handling-destructive-changes-safely)).

### Step 4 — Commit to Git

```bash
git add prisma/migrations/ prisma/schema.prisma
git commit -m "migration: add user avatar field"
```

### Step 5 — Deploy to Production

```bash
npx prisma migrate deploy
```

This applies **only pending (unapplied) migrations** to the production database. It will never generate new SQL — it only runs what's already been reviewed and committed.

---

## 4. Common Safe vs Destructive Changes

### ✅ Safe Changes (No Data Loss)

| Change | What Happens |
|---|---|
| Add a new **optional** field (`String?`) | `ALTER TABLE ADD COLUMN` — existing rows get `NULL` |
| Add a new field with a **default** (`@default(...)`) | Existing rows get the default value |
| Add a new **model/table** | `CREATE TABLE` — no existing data affected |
| Add a new **index** | `CREATE INDEX` — no data affected |
| Add a new **enum value** | `ALTER TYPE ADD VALUE` — no data affected |

### ⚠️ Destructive Changes (Require Manual Handling)

| Change | Risk |
|---|---|
| **Remove** a field/column | Data in that column is permanently deleted |
| **Rename** a field/column | Prisma sees it as drop + add → data lost |
| **Change** a field type (e.g., `String` → `Int`) | Column may be dropped and recreated |
| **Remove** a model/table | Entire table and all rows deleted |
| **Make** an optional field required (`String?` → `String`) | Fails if existing rows have `NULL` |
| **Remove** an enum value | Fails if rows reference that value |

---

## 5. Handling Destructive Changes Safely

### Renaming a Column

Prisma cannot detect renames — it treats them as a drop + create. Instead:

1. **Generate the migration** but do **NOT** apply it:
   ```bash
   npx prisma migrate dev --name rename_field --create-only
   ```

2. **Edit the generated SQL** — replace the drop/add with a rename:
   ```sql
   -- Prisma generated (WRONG — loses data):
   -- ALTER TABLE "User" DROP COLUMN "name";
   -- ALTER TABLE "User" ADD COLUMN "fullName" TEXT;

   -- Replace with (CORRECT — preserves data):
   ALTER TABLE "User" RENAME COLUMN "name" TO "fullName";
   ```

3. **Apply the edited migration**:
   ```bash
   npx prisma migrate dev
   ```

### Making a Field Required (Optional → Required)

1. First, backfill `NULL` values:
   ```sql
   UPDATE "User" SET "phone" = 'unknown' WHERE "phone" IS NULL;
   ```

2. Then generate the migration:
   ```bash
   npx prisma migrate dev --name make_phone_required --create-only
   ```

3. Verify the SQL includes `SET NOT NULL` (not a column recreation):
   ```sql
   ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL;
   ```

4. Apply:
   ```bash
   npx prisma migrate dev
   ```

### Changing a Column Type

1. Generate with `--create-only`
2. Edit the SQL to use `ALTER COLUMN ... TYPE ... USING`:
   ```sql
   ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2);
   ```
3. Apply the migration

### Removing a Column or Table

1. **Before removing**: Verify the data is no longer needed or has been migrated elsewhere
2. **Consider a soft-delete approach**: Add `deletedAt DateTime?` instead of dropping
3. If you must drop, generate with `--create-only`, review, then apply

---

## 6. Docker / Production Deployment

### Current Entrypoint (`docker-entrypoint.sh`)

The entrypoint currently runs `prisma db push` on startup. For a migration-based workflow, switch to `prisma migrate deploy`:

```sh
#!/bin/sh
set -e

if [ "$1" = "npm" ] && [ "$2" = "run" ] && [ "$3" = "start" ]; then
  echo "Applying pending migrations..."
  npx prisma migrate deploy 2>&1 | grep -v "Datasource" || {
    echo "ERROR: prisma migrate deploy failed — container will NOT start"
    exit 1
  }
fi

exec "$@"
```

> [!WARNING]
> Unlike `db push`, `migrate deploy` will **fail and stop the container** if there's a conflict — this is intentional. You should fix the migration before deploying rather than silently corrupting data.

### Deployment Checklist

1. ☐ Edit `schema.prisma` locally
2. ☐ Run `npx prisma migrate dev --name <description>` locally
3. ☐ Review the generated SQL in `prisma/migrations/`
4. ☐ Test locally with a copy of production data (or a staging DB)
5. ☐ Commit the migration files + schema to git
6. ☐ Deploy — the Docker entrypoint will run `prisma migrate deploy` automatically
7. ☐ Verify the deployment logs show "All migrations applied"

---

## 7. Emergency: Rolling Back a Migration

Prisma does **not** have a built-in rollback command. If a migration goes wrong:

### Option A — Fix Forward (Recommended)

Create a new migration that undoes the change:

```bash
# 1. Revert your schema.prisma to the previous state
# 2. Generate a new migration
npx prisma migrate dev --name revert_bad_change
# 3. Review and deploy
```

### Option B — Manual SQL Rollback

Connect to the DB and manually undo the change:

```bash
# Connect to Neon via psql or any SQL client
psql "$DATABASE_URL"

# Undo the change manually
ALTER TABLE "User" DROP COLUMN "avatarUrl";

# Remove the migration record so Prisma doesn't think it's applied
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260525_add_user_avatar';
```

Then delete the migration folder locally and regenerate:

```bash
rm -rf prisma/migrations/20260525_add_user_avatar
npx prisma migrate dev
```

### Option C — Neon Branch Restore

Since you're using Neon, you can restore from a branch/point-in-time:

1. Go to the [Neon Dashboard](https://console.neon.tech)
2. Navigate to your project → **Branches**
3. Create a new branch from a point-in-time **before** the bad migration
4. Point your `DATABASE_URL` to the new branch

---

## 8. Quick Reference Commands

```bash
# Generate + apply migration to dev DB
npx prisma migrate dev --name <description>

# Generate migration SQL WITHOUT applying (for review/editing)
npx prisma migrate dev --name <description> --create-only

# Apply pending migrations to production (no new SQL generated)
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# View current DB vs schema diff (dry-run, no changes)
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma

# Reset dev DB (DESTROYS ALL DATA — dev only!)
npx prisma migrate reset

# Generate Prisma client (no DB changes)
npx prisma generate
```

> [!CAUTION]
> **Never** run `prisma migrate reset` against a production database. It drops the entire database and re-creates it from scratch.

---

## Summary

| Scenario | Command | Safe? |
|---|---|---|
| Prototyping (dev only) | `prisma db push` | ⚠️ Sometimes |
| Production deployment | `prisma migrate deploy` | ✅ Always |
| Creating a new migration | `prisma migrate dev --name x` | ✅ Review SQL |
| Destructive change | `prisma migrate dev --create-only` → edit SQL → apply | ✅ Manual review |
