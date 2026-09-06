# Task 1 — Reusable Marker Groups with Immutable Membership History

**Status: DONE_WITH_CONCERNS** — source, unit, static, and schema-from-empty
verification passed; database-applied migration, datasource drift, and trigger
proof are blocked by unavailable local PostgreSQL/Docker infrastructure.

## Implementation summary

Implemented E1 reusable marker groups without changing exam authorization:

- Added `COURSE`, `SUBJECT`, and `INSTITUTE` scoped groups with a database
  constraint requiring exactly one matching target.
- Kept `MarkerAssignment` as the only source of marker access to an exam;
  group membership is configuration only.
- Added active membership rows, append-only membership events, immutable-event
  trigger, required replacement reasons, marker validation, and group revision
  increments in the same replacement transaction.
- Enforced SUPER_ADMIN global access and TEACHER access only to owned
  course-scoped groups. ADMIN, MARKER, and STUDENT cannot configure or read
  these group APIs.
- Added authenticated APIs at `/api/marker-groups`; every mutation validates a
  Zod request body, uses idempotency middleware, runs its domain mutation in a
  transaction, and persists its AuditLog record with `await` rather than
  fire-and-forget logging.

## Files

- Modified: `backend/prisma/schema.prisma`
- Added: `backend/prisma/migrations/20260906224500_marker_groups/migration.sql`
- Added: `backend/src/schemas/marker-group.schema.ts`
- Added: `backend/src/services/marker-group.service.ts`
- Added: `backend/src/services/marker-group.service.test.ts`
- Added: `backend/src/controllers/marker-group.controller.ts`
- Added: `backend/src/routes/marker-group.routes.ts`
- Modified: `backend/src/index.ts`, `backend/src/services/access.service.ts`,
  `backend/src/services/audit.service.ts`, `backend/src/utils/constants.ts`
- Modified: `context/api_endpoints/exams.endpoints.md`,
  `context/documents/06-progress-tracker.md`

## TDD evidence

### RED

Command:

```bash
cd backend && npm test -- marker-group.service.test.ts
```

Result before the service existed: failed as expected with
`Cannot find module '/src/services/marker-group.service'`; zero tests were
collected because the module under test did not exist.

### GREEN

The same focused command passed after the service implementation:

```text
Test Files  1 passed (1)
Tests  14 passed (14)
```

The cases cover SUPER_ADMIN/TEACHER/ADMIN/MARKER/STUDENT authorization,
cross-course denial, subject/institute denial for TEACHER, marker-ID
deduplication and validity filtering, missing group behavior, required reason,
transaction rollback before member/event/revision writes, exact replacement
replay, history scoping, and revision increment.

## Verification summary

- `npm test -- marker-group.service.test.ts`: 1 file, 14 tests passed.
- `npm test`: 38 files, 309 tests passed.
- `npm run lint`: passed (ESLint exit 0).
- `npx tsc --noEmit`: passed (exit 0).
- `npx prisma generate`: passed after schema validation.
- `npx prisma validate`: schema valid.
- `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`:
  passed and produced the schema script.
- `git diff --check`: passed.

## Migration verification limitation

The exact required commands could not reach the configured local PostgreSQL:

```bash
npx prisma migrate deploy
# P1001: Can't reach database server at postgres:5432

npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
# not run after deploy was blocked; it requires the same unavailable datasource
```

An attempted disposable PostgreSQL container also failed before creation because
the local Docker daemon returned HTTP 500 for the Desktop socket. Therefore the
database-applied migration, zero-drift command, and direct event UPDATE/DELETE
trigger attempt remain environment-blocked rather than asserted as passed.

## Self-review

- The service is the only new Prisma consumer; controller and route layers only
  parse, authorize, invoke services, and shape responses.
- `replaceMarkerGroupMembers` validates all requested marker IDs before any
  membership or event write, then appends each event with `await` in its
  transaction. It increments `MarkerGroup.revision` only when active membership
  actually changes.
- Re-added historical members reactivate their retained membership row; the
  unique `(groupId, markerId)` constraint is preserved and an `ADDED` event is
  still appended.
- The SQL trigger rejects direct UPDATE and DELETE on membership events. Group
  membership does not appear in `assertMarkerAssignedToExam`, preserving exact
  exam-scoped access.
- No changes were made to the ignored `backend/node_modules` setup symlink.

## Concerns

- The local PostgreSQL and Docker engine are unavailable, so applied-migration,
  schema-drift, and database-trigger evidence must be rerun in a working
  disposable PostgreSQL environment before merge.
