# Task 2 report — reusable paper revisions, audiences and frozen rosters

## Status and changed files

Implemented on `feature/exam-audiences` from `a7ab026`.

- `backend/prisma/schema.prisma` and `backend/prisma/migrations/20260907091500_exam_papers_audiences/migration.sql`
- `backend/src/index.ts`, `routes/exam.routes.ts`, and new `exam-paper`/`exam-audience` route-controller-schema-service layers
- Existing exam, submission, access schemas/services plus access tests
- New paper and audience service tests
- `context/api_endpoints/exams.endpoints.md` and this SDD tracker/report

## TDD evidence

1. Paper/audience tests first failed because their service modules did not exist.
2. Scoped-start access tests first failed because `assertStudentExamStartAccess` did not exist.
3. Exact persisted audience-ID/revision output first failed because audience replacement returned `undefined`.
4. Final focused suite passed after the minimal implementation.

## Verification

- `npm test -- exam-paper.service.test.ts exam-audience.service.test.ts access.service.test.ts exam.service.test.ts submission.service.test.ts` — 42 passed.
- `npm run lint`, `npx tsc --noEmit`, `npm run build` — passed.
- `npx prisma validate`, `npx prisma generate` — passed.
- `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` — passed (1,064-line output).
- `git diff --check` — passed.

## Compatibility and self-review

- Nullable `paperRevisionId` preserves legacy course-enrollment starts and existing content/submission fields.
- Non-null revision validates course ownership and pins immutable type/marks/assets/channels.
- Scoped starts need active enrollment plus a matching `ONLINE` participant; unlisted/tampered/physical-audience starts deny.
- Composite audience relation and unique `(examId, userId)` prevent cross-exam injection and duplicate attempts.
- Online has no institute; physical requires an active institute; online scoped audiences reject `INCLASS`.
- Marker groups remain configuration only. New consequential routes use idempotency; audience/roster changes are serializable and evidence is written transactionally to existing `AuditLog`.

## Migration blocker / concern

Docker/PostgreSQL is unavailable locally, so fresh deploy, DB drift, actual PostgreSQL constraints, and six-migration legacy-upgrade preservation were not proven. `prisma migrate diff --from-migrations` also requires a configured `shadowDatabaseUrl`. CI must run those gates. Dedicated append-only `AcademicEvent` remains deferred to Task 4 as specified; this slice writes transactional `AuditLog` evidence.
