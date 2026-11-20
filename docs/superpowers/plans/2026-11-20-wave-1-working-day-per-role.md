# Wave 1: Give Each Role a Working Day (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. One task is one branch and one PR.

**Goal:** Remove the daily dead ends the 2026-11-19 audit found for the five roles of a live institute (~1,200 students, cash at the front desk, teachers who own their classes): the front desk can enrol, see who owes, tally cash and see the student's fee state at the gate; teachers can see their class, enter marks (online and hall) and run classes that can actually go live; students can sit scoped exams and do not lose answers; the owner can create staff accounts, reset passwords and see the organization on one read-only page.

**Architecture:** Reuse the existing services (`enrollment`, `payment`, `attendance`, `submission`, `exam`, `class`, `user`, `notification`); add only what a task cannot do without. Every owner-tunable number is read from a typed `OrganizationSetting` registry (Task 1), never from a constant or an env var. All "which month" arithmetic uses `Organization.timezone` (Asia/Colombo). Services stay the only layer that imports Prisma. No new Redis keys, no process-memory caches (stateless API invariant).

**Tech Stack:** Next.js 16 / React 19 frontend; Express 5 / TypeScript / Prisma 7 / PostgreSQL backend; BullMQ worker; Vitest (backend and frontend); Docker Compose live stack.

**Findings closed:** F-03, F-10, F-11, F-12, F-13, F-15 (prerequisite), F-17, F-21, F-22, F-58 (bound to F-10/F-77 by D-OPS-1), F-59 (side effect of the tally guard), F-67, F-77, F-83, F-86, F-104, F-127 (read-only console; the audited view-as mode is deferred, see Deferred). Student-side half of F-69 and F-78 are closed as side effects (defect class only here; mechanics in the private companion).

**Status of this plan.** Planned, nothing implemented. Decisions of 2026-11-19/20 are cited by id (`D-...`) and are not reopened here. Security-class details (F-04, F-06, F-07, F-09, F-16, F-54, F-56, F-69 and any access leak) are described only at defect-class level in this file; the specific mechanisms, endpoints and line numbers are in the private companion `2026-11-20-wave-1-working-day-per-role.md` kept in the maintainer's audit notes (outside this repository). Tasks that depend on it say "see companion".

---

## Preconditions

### Decisions this plan relies on

| Id | Used by |
|---|---|
| D-MONEY-10 (settings registry, org-time, advisory lock, monthly job later) | Tasks 1, 5, 6, 7, 8, 9, 11, 12, 13, 14, 16 |
| D-ACCESS-1 (one clock, `isStudentCovered` in its simple form) | Tasks 1, 5, 8, 9 |
| D-ACCESS-3 (scan warns and records, never blocks the door by default; snapshot on the row) | Task 8 |
| D-ACCESS-4 (one resolver for scan codes; Wave 0 slice) | Task 8 |
| D-ACCESS-5 (single Attendance migration, all columns once) | Tasks 8, 9 |
| D-OPS-1 (who owes, cash tally, bulk-upload guard) | Tasks 5, 6, 7, 15 |
| D-OPS-2, D-IDENTITY-3 (new SMS types seeded disabled except three) | Task 5 |
| D-EXAMS-1 (teacher and owner enter marks, markers stay optional) | Task 10 |
| D-EXAMS-2 (hall marks bulk entry) | Task 11 |
| D-EXAMS-3 (server derives the exam audience) | Task 13 |
| D-EXAMS-7 (teacher roster with a three-value fee state) | Task 9 |
| D-EXAMS-11 (exam defaults live in the settings registry) | Tasks 10 to 14 |
| D-IDENTITY-5/6 step-up helper, D-IDENTITY-7 (staff creation, staff-assisted reset), D-IDENTITY-8 (slim lookup) | Tasks 2, 3, 4 |
| D-STRUCTURE-7 (null session mode means "in hall + live stream"; F-104 S fix) | Task 12 |
| D-MONEY-4 interim (409 `ALREADY_ENROLLED_OTHER_MODE`) | Task 4 |
| Decided 2026-11-19 and not reopened: Express + Next, Organization = tenant, Institute = branch, HYBRID and three payment channels (planned, not built), PHYSICAL-only students lose live and recording access unless HYBRID | whole plan |

### Task 0 baseline gate (must hold before any task branches)

`git log` on the planning branch shows **no Wave 0 work merged**. Wave 1 assumes it is on `origin/dev`: F-01 session lifetime, F-02 SSR traffic out of the per-IP limiter, recording stream/list/metadata restricted (F-04, F-06), attendance read scoping (F-09), Zoom webhook hardening (F-54), production boot check (F-55), the D-ACCESS-4 slice (single scan-code resolver `resolveStudentByCode`, collision report, write-time uniqueness for new codes) and the non-numeric slice of D-IDENTITY-5 (create-only `seed-admin.ts`, owner invariants; no step-up). If any is missing when a dependent task starts, stop and merge it first; do not re-implement it inside a Wave 1 PR. Tasks 8 and 9 name the Wave 0 items they sit on.

### Items not delivered by any existing plan

The Wave 1 Step 1 foundations (settings registry, org-time helper, `isStudentCovered` simple form) have no plan yet; they are **Task 1** here. `withAdvisoryLock` ships in Wave 0 Task 4 (`backend/src/utils/advisory-lock.ts`) and is only imported here. F-15 (per-request user lookup plus `tokenVersion`) ships inside **Task 2** because that task edits `verifyToken` anyway and a password reset only revokes properly with it.

---

## Global constraints

- Branch off fresh `origin/dev` as `type/kebab-scope`; Conventional Commit title (also the PR title); squash-merge after green `Quality Gate` and review; delete the branch after merge ([11-git-and-naming.md](../../../context/documents/11-git-and-naming.md)). No attribution lines in commits or PR bodies (project rule). Work in the main checkout; tagged stashes only.
- Routes call controllers, controllers call one service, only services import `@/config/database`'s `prisma`. Course-scoped reads and writes call `assertCourseAccess` (it passes `SUPER_ADMIN` and `ADMIN` through and throws `403 FORBIDDEN_COURSE` for a non-owning `TEACHER`).
- Every new model declares `organizationId`, the `Organization` relation (`onDelete: Restrict`) and `@@index([organizationId])`; add the back-relation on `Organization` and keep `backend/src/utils/tenant-integrity.test.ts` green. No new global unique on a user-visible value. No hand-built R2 or Redis keys. No provider credential read from env.
- Migrations are additive (expand only). Postgres cannot use an enum value added by `ALTER TYPE ... ADD VALUE` in the same transaction, so each new enum value gets its own migration file. Prove fresh deploy and upgrade on a scratch database and run `npx tsx src/scripts/check-tenant-integrity.ts`.
- Each guard ships with an actor x target Vitest matrix, not-found cases and a check-ordering case ([04-ai-workflow-rules.md](../../../context/documents/04-ai-workflow-rules.md) section 3.4), plus the live-stack pass. Mock `@/config/database`'s `prisma` (pattern: `backend/src/services/user.service.test.ts`).
- Frontend changes: read `frontend/AGENTS.md` and the installed Next.js docs under `frontend/node_modules/next/dist/docs/` first. Keep the API envelope, inline loading/empty/error states, keyboard access and phone-width layouts (many phones are low end; no horizontal scroll at 360 px).
- Responses that carry a one-time secret (a temporary password) are never cached, logged or audited with the value.
- Money rule: nothing in this wave lets a role move money it could not move before, except the tightening in Tasks 6 and 7.

## Branch and PR slicing

One PR per task, in dependency order. "Actor" is the role the PR is for. "Accounts" means user-account administration (reset and staff creation).

| Task | Branch | PR title | Actor | Closes | Effort | Depends on |
|---|---|---|---|---|---|---|
| 0 | `docs/wave-1-plan-links` | `docs: link Wave 1 from doc 17 and record the base SHA` | all | doc 17 and 06 hygiene | S | Wave 0 gate |
| 1 | `feature/org-settings-and-billing-clock` | `feat(settings): add organization settings registry and Colombo billing clock` | platform | F-18 (all call sites), D-ACCESS-1 | M | 0 |
| 2 | `feature/session-revocation-and-password-reset` | `feat(auth): revoke sessions on change and add staff-assisted password reset` | accounts | F-15, F-03 | M | 1 |
| 3 | `feature/staff-account-creation` | `feat(users): create staff accounts with a one-time password` | accounts | F-21 | S | 2 |
| 4 | `feature/staff-enroll-student` | `feat(enrollment): enrol a student from the front desk` | front desk | F-11, F-65 (interim) | M | 1 |
| 5 | `feature/who-owes-list` | `feat(payments): add who-owes list, CSV export and fee reminders` | front desk, owner | F-10, F-78 | M | 1 |
| 6 | `feature/cash-tally` | `feat(payments): add end-of-day cash tally and collection guard` | front desk, owner | F-77, F-59 | M | 1 |
| 7 | `fix/bulk-upload-guard` | `fix(payments): restrict and validate bulk payment upload` | owner | F-58 | S | 6 |
| 8 | `feature/scan-fee-context` | `feat(attendance): show enrollment and fee state at the entrance scan` | front desk | F-12 | M | 1, Wave 0 resolver |
| 9 | `feature/teacher-class-roster` | `feat(classes): add a teacher class roster with paid state` | teacher | F-83 | M | 1, 8 |
| 10 | `feature/teacher-enter-marks` | `feat(submissions): let owning teachers and owners enter marks` | teacher | F-67 | S | none |
| 11 | `feature/hall-marks-entry` | `feat(exams): add bulk entry of hall paper marks` | teacher | F-13 | M | 10 |
| 12 | `fix/timetable-live-classes` | `fix(timetable): let timetable-generated classes go live` | teacher, owner | F-104 | S | 1 |
| 13 | `fix/exam-sitting-resilience` | `fix(exams): derive the exam audience and allow upload retry` | student | F-17, F-22, F-69 (student half) | M | 1 |
| 14 | `fix/exam-answer-autosave` | `fix(exams): autosave typed answers and submit before time is up` | student | F-86 | S | 13 |
| 15 | `feature/owner-console-money` | `feat(console): add read-only owner console with money panels` | owner | F-127 (part 1) | M | 5, 6 |
| 16 | `feature/owner-console-operations` | `feat(console): add marking, attendance and setup panels to the owner console` | owner | F-127 (part 2) | M | 8, 15 |

Tasks 8, 10, 12 and 13 can start in parallel after Task 1. Tasks 4, 5, 6 and 7 share payment files and `CollectPayment.tsx`, so merge 5, then 6, then 7, then 4; Tasks 10 and 13 share `submission.service.ts`, so merge 10 first. Merge order otherwise follows the Depends column.

## Settings registered by this wave

All keys are added to the Task 1 registry (Zod type, default, allowed range) and edited only by `SUPER_ADMIN`, audited. A missing row means the default.

| Key | Default | Used in |
|---|---|---|
| `fees.graceDays` | 10 (0 to 31; 0 restores the hard month rule) | 1, 5, 8, 9 |
| `fees.graceRequiresPreviousMonthPaid` | true | 1 |
| `fees.arrearsReportMonths` | 3 | 5 |
| `fees.reminderFromDay` / `fees.reminderMaxPerStudentPerMonth` | 11 / 1 | 5 |
| `fees.advanceMonthsAllowed` | 1 | 7 |
| `tally.enabled` / `tally.varianceFlagAmount` | true / 0 | 6, 15 |
| `bulk.maxRows` | 300 | 7 |
| `attendance.scan.unpaidPolicy` / `attendance.scan.notEnrolledPolicy` | WARN / WARN (alt BLOCK) | 8 |
| `roster.showPaidState` / `roster.attendanceWindowSessions` / `roster.pageSize` | true / 8 / 100 | 9 |
| `exams.marking.markerMayOverrideTeacher` | false (fixed rule, listed for a future organization) | 10 |
| `exams.hallMarks.maxRowsPerBatch` / `exams.hallMarks.allowDecimal` | 500 / false | 11 |
| `timetable.generateAheadDays` | 14 (moves from `TIMETABLE_GENERATE_AHEAD_DAYS`) | 12 |
| `exams.uploadGraceSeconds` | 180 (replaces the hard-coded 60 s) | 13 |
| `exams.autoSubmitLeadSeconds` | 15 (added by this plan, not in the decision set) | 14 |
| `identity.tempPassword.length` | 10 | 2, 3 |
| `identity.reset.maxPerActorPerDay` / `identity.reset.maxPerTargetPer24h` | 40 / 3 | 2 |
| `identity.stepUp.required` | true | 2, 3 |
| `identity.stepUp.actions` | ROLE_CHANGE, STAFF_DEACTIVATE, STAFF_CREATE, STAFF_PASSWORD_RESET, ERASURE | 2, 3 |
| `identity.maxOwners` | 2 (owner creation guard; a co-owner is added only by the operator CLI) | 2 |
| `fees.autoReminderEnabled` | false (registered, unused until Wave 2 T23) | 5 |
| `console.lookbackDays` | 30 | 15, 16 |

## Migration map

| Migration (file `<timestamp>_name`) | Task | Content |
|---|---|---|
| `organization_setting` | 1 | `OrganizationSetting` table |
| `user_token_version_must_change_password` | 2 | `User.tokenVersion Int @default(0)`, `User.mustChangePassword Boolean @default(false)` |
| `notification_type_fee_due` | 5 | `NotificationType += FEE_DUE` (alone in its file) |
| `payment_collected_at_cash_tally` | 6 | `Payment.collectedAt`, `CashTally` table, two partial unique indexes, backfill |
| `attendance_status_columns` | 8 | `AttendanceStatus` and `EnrollmentScanState` enums; Attendance columns |
| `attendance_source_video` | 8 | `AttendanceSource += VIDEO` (alone in its file; used by a later wave) |
| `submission_source_graded_by` | 10 | `SubmissionSource` enum, `Submission.source`, `Submission.gradedById` |

No contract (drop) migration is part of this wave.

---

## Task 0: Baseline gate and register status column

**Files:**
- Modify: `context/documents/18-flow-audit-findings-register.md`, `context/documents/17-roles-permissions-and-flows.md`, `context/documents/06-progress-tracker.md`

**Closes:** nothing in code. The Status column was added by Wave 0 PR 0; every later PR updates it.

- [ ] **Step 1: Verify the Wave 0 gate**

```bash
git fetch origin dev
git log -1 --format='%H %s' origin/dev
git log origin/dev --oneline | grep -Ei "session|recording|attendance read|zoom webhook|boot|seed-admin|resolver" | head
```

Expected: the Wave 0 items listed in Preconditions are present. Record the base SHA in `06-progress-tracker.md`. If not present, stop and report; this plan does not start.

- [ ] **Step 2: Use the Status column added by Wave 0 PR 0**

Values are the Wave 0 set (`Open`, `Partial`, `Fixed (#<pr>, vX.Y.Z)`, `Won't fix (<decision id>)`); set each F-id named in this plan to `Partial` only once work has started. No new column. Update doc 17 section 7 to link this plan under Wave 1.

- [ ] **Step 3: Commit and PR**

```bash
git switch -c docs/flow-audit-status-column origin/dev
git commit -am 'docs: add status column to the flow audit register'
```

**Effort:** S. **Rollback:** revert the docs commit.

---

## Task 1: Organization settings registry, Colombo billing clock, advisory lock, simple `isStudentCovered`

**Closes:** F-18 (the UTC billing month), foundations of D-MONEY-10 and D-ACCESS-1. **Effort:** M (3 days).

**Files:**
- Modify: `backend/prisma/schema.prisma` (new `OrganizationSetting` model plus back-relation on `Organization`), new migration `organization_setting`
- Create (new): `backend/src/config/settings-registry.ts` (Zod type, default and range per key, domains `fees`, `tally`, `bulk`, `attendance`, `roster`, `exams`, `timetable`, `identity`, `console`), `backend/src/services/settings.service.ts`, `backend/src/schemas/settings.schema.ts`, `backend/src/controllers/settings.controller.ts`, `backend/src/routes/settings.routes.ts`, `backend/src/utils/org-time.ts`, tests `settings.service.test.ts`, `org-time.test.ts`
- Modify: `backend/src/index.ts` (mount `/api/settings`), `backend/src/utils/constants.ts` (`AUDIT_ACTION.SETTING_CHANGED`), `backend/src/services/access.service.ts` (`getCurrentPaymentMonth` becomes a thin wrapper over `org-time`; new `isStudentCovered`; `assertStudentContentAccess` calls it), `backend/src/services/payment.service.ts` (the `getCurrentPaymentMonth` import at line 24 and use at about line 740), `backend/src/controllers/payment.controller.ts` (import line 22, use at about line 78), `backend/src/services/payment.service.test.ts`
- Modify (frontend): `frontend/lib/payhere.ts` (`currentPaymentMonth` takes the organization timezone), `frontend/app/(app)/payments/page.tsx`, `frontend/app/(app)/payments/_components/CollectPayment.tsx`, `frontend/app/(app)/classes/[classId]/_components/EnrollPanel.tsx`, `frontend/lib/types.ts`
- Create (frontend, new): `frontend/app/(app)/admin/settings/page.tsx` and `_components/SettingsForm.tsx` ("Access rules and fees", grouped by domain); add a nav item for `SUPER_ADMIN` in `frontend/lib/nav.ts`
- Modify: `backend/src/services/auth.service.ts` `getMe` and `SafeUser` so `GET /auth/me` returns `organization: { id, name, timezone }` (additive)

**Behaviour:**
- `OrganizationSetting(organizationId, key, value Json, updatedById, updatedAt)`, unique on `(organizationId, key)`, tenant rules apply. Read per request with a request-scoped memo only (no process or Redis cache). Unknown keys are rejected (400), out-of-range values rejected, a changed value writes an audit row and applies to future decisions only.
- `org-time.ts`: `billingMonthOf(date, tz)`, `colomboDayOf(date, tz)`, `dayRangeInTz(day, tz)`, `dayOfMonthInTz(date, tz)`, all driven by `Organization.timezone`. The 23:59 and 00:01 Colombo boundaries on the 1st of a month must differ from UTC.
- `withAdvisoryLock` (created in Wave 0 Task 4) is reused as-is; it wraps `pg_advisory_xact_lock(hashtextextended(...))` with one hashing convention (the existing inline locks in `submission.service.ts`, `exam-audience.service.ts` and others keep working and are migrated opportunistically, not in this PR).
- `isStudentCovered({ userId, courseId, enrollmentId?, now })` returns `{ covered, reason: 'PAID' | 'GRACE' | 'UNPAID', month, graceUntil }`. Rule: a SUCCESS payment for the current Colombo month, else covered during grace when `Colombo day of month <= fees.graceDays` and the previous month has a SUCCESS payment (`fees.graceRequiresPreviousMonthPaid`). With `enrollmentId` the check is for that single enrollment (used by Task 8); without it the check spans the student's enrollments of the course (today's gate). `assertStudentContentAccess` with `requirePaid` now calls it, so live and recording access gain the Colombo month and the grace (this is the D-ACCESS-1 behaviour change, announced in the PR description). D-MONEY-1's fuller rule (exceptions, trial, mode) later extends the same function without touching callers.

**Vitest:** unknown key, range, default fallback, audit row, non-owner 403 (actors `STUDENT`, `TEACHER`, `ADMIN`, `MARKER`, `SUPER_ADMIN`), request memo does not leak across requests; org-time at 23:59 and 00:01 on 31 Jan to 1 Feb and across a month with 28 days; `isStudentCovered` matrix (paid, grace day 10 vs 11, previous month unpaid, new joiner, grace 0, single enrollment vs course-wide); existing `payment.service.test.ts` month cases updated.

**Live stack:** `docker compose build backend && docker compose up -d`; log in as the seeded owner (see `backend/src/scripts/seed-demo.ts`), `PATCH` a setting, read it back, confirm the audit row in `GET /api/audit-logs`; set the clock-sensitive case by seeding a payment for last month and checking a content token on day <= grace and day > grace; open the settings page at 360 px width.

**Migration:** `organization_setting` (expand only; no backfill, the registry supplies defaults). **Rollback:** the table is additive; revert the PR and the table is unused. `fees.graceDays = 0` restores today's strict month rule at once without a revert.

---

## Task 2: Session revocation (F-15) and staff-assisted password reset (F-03)

**Closes:** F-15, F-03. **Effort:** M. Security class: mechanics in the companion.

**Files:**
- Modify: `backend/prisma/schema.prisma` (`User.tokenVersion`, `User.mustChangePassword`), new migration `user_token_version_must_change_password`
- Modify: `backend/src/types/auth.types.ts`, `backend/src/middleware/auth.middleware.ts` (`verifyToken` reads the user row per request), `backend/src/services/auth.service.ts` (`issueTokenPair`, `refreshTokens`, `login`, `toSafeUser`/`getMe`, new export `verifyActorPassword(actorId, password)`: bcrypt compare, no cooldown, value never logged), `backend/src/services/profile.service.ts` (`changePassword`), `backend/src/services/user.service.ts` (`updateRole`, `updateStatus`, new `resetPassword`), `backend/src/schemas/user.schema.ts`, `backend/src/controllers/user.controller.ts`, `backend/src/routes/user.routes.ts`, `backend/src/middleware/idempotency.middleware.ts` (a redacted-body variant), `backend/src/middleware/request-logger.middleware.ts`, `backend/src/utils/constants.ts` (`AUDIT_ACTION.PASSWORD_RESET_BY_STAFF`)
- Create (new): `backend/src/utils/temp-password.ts` (CSPRNG, unambiguous alphabet, length from `identity.tempPassword.length`), tests `auth.middleware.test.ts`, `user.service.reset-password.test.ts`
- Modify (frontend): `frontend/app/(app)/admin/users/_components/UsersTable.tsx` (Reset password action, shown only where the backend would accept it), `frontend/app/auth/login/page.tsx` (copy: "Forgot your password? Ask the front desk."), `frontend/app/(app)/profile/_components/CredentialForms.tsx`, `frontend/lib/types.ts`
- Create (frontend, new): `frontend/app/auth/change-password/page.tsx`; modify `frontend/app/(app)/layout.tsx` to send a user with `mustChangePassword` there

**Behaviour:**
- `verifyToken` becomes async: read `role`, `deletedAt`, `tokenVersion`, `mustChangePassword` for the token's user (primary-key lookup), reject a deactivated user or a mismatched `tokenVersion` with 401, and take the role from the database so a role change applies at once. `tokenVersion` is bumped on password change or reset, role change and deactivation, together with `revokeAllRefreshTokens`; refresh rejects a token whose version is stale.
- A user with `mustChangePassword` may call only `GET /auth/me`, `POST /auth/logout`, `POST /auth/refresh` and `PATCH /users/me/password`; every other route returns `403 PASSWORD_CHANGE_REQUIRED`.
- `POST /users/:id/reset-password` (route roles `SUPER_ADMIN`, `ADMIN`): generates a one-time temporary password, sets `mustChangePassword = true`, keeps the forced change exempt from the weekly password-change cooldown, revokes the target's sessions, returns the secret once with `Cache-Control: no-store`. Target matrix: `ADMIN` may reset `STUDENT` targets only; `SUPER_ADMIN` may reset any non-self target except another `SUPER_ADMIN` (owner recovery stays an operator CLI, D-IDENTITY-5). Body carries `identityCheck` (`IN_PERSON_CARD`, `GUARDIAN_PHONE`, `OWNER_KNOWS`) recorded in the audit row; staff targets also require the actor's current password (step-up through `verifyActorPassword`, created in this task). Rate limits come from `identity.reset.maxPerActorPerDay` and `identity.reset.maxPerTargetPer24h`, counted from the audit rows (no new Redis keys).
- `changePassword` skips the cooldown when `mustChangePassword` is set, clears the flag and bumps `tokenVersion`.
- The temporary password is shown once and never stored, logged, audited or replayed (mechanics in the companion). Not sent by SMS or email.

**Vitest:** actor x target reset matrix (`ADMIN` to `STUDENT` ok; `ADMIN` to `TEACHER`, `MARKER`, `ADMIN`, `SUPER_ADMIN` 403; `SUPER_ADMIN` to self 403, to peer `SUPER_ADMIN` 403, to `TEACHER` ok; `TEACHER`, `MARKER`, `STUDENT` 403 at the route); target not found 404 versus 403 ordering (the role check must not leak existence beyond what `getUserById` already shows); deactivated target; rate-limit edges; `verifyToken` cases (deactivated, stale `tokenVersion`, role changed in the database, `mustChangePassword` allow-list); forced change not blocked by the cooldown; no secret in audit or log output; idempotent replay returns no secret.

**Live stack:** as the owner reset a seeded student, log in as that student with the temporary password, confirm only the allowed routes respond, change the password, confirm the old session and refresh token are dead. Deactivate a user and confirm the next request is rejected. Steps with `curl` are in the companion.

**Migration:** `user_token_version_must_change_password` (defaults make existing rows valid). **Rollback:** revert the PR; the two columns stay unused.

---

## Task 3: Staff account creation (F-21)

**Closes:** F-21. **Effort:** S.

**Files:**
- Modify: `backend/src/schemas/user.schema.ts`, `backend/src/services/user.service.ts` (new `createStaff`), `backend/src/controllers/user.controller.ts`, `backend/src/routes/user.routes.ts`, `backend/src/utils/constants.ts` (`AUDIT_ACTION.STAFF_ACCOUNT_CREATED`), `backend/src/services/user.service.test.ts`
- Create (frontend, new): `frontend/app/(app)/admin/users/_components/CreateStaffDialog.tsx`; modify `UsersTable.tsx`

**Behaviour:** `POST /users/staff` (route role `SUPER_ADMIN` only) creates a `TEACHER`, `ADMIN` or `MARKER` (never `SUPER_ADMIN`; the Zod enum excludes it) with name, unique email, optional phone, a temporary password from Task 2's helper (step-up via Task 2's `verifyActorPassword`), `mustChangePassword = true` and `setupCompleted = true`. Step-up with the owner's current password. The password is shown once on screen (with a print slip), never sent. Same redacted idempotency variant as Task 2. A duplicate email returns `409 EMAIL_ALREADY_EXISTS`. The old "register as student then promote" path keeps working and is deprecated in the docs (D-IDENTITY-6 restricts it later).

**Vitest:** roles `SUPER_ADMIN` ok; `ADMIN`, `TEACHER`, `MARKER`, `STUDENT` 403; requesting `SUPER_ADMIN` role 400; duplicate email; wrong step-up password; created user can log in only to the forced change flow; audit row without the secret.

**Live stack:** create a teacher, log in, change the password, confirm the teacher can create a class. **Migration:** none. **Rollback:** revert; accounts already created remain valid.

---

## Task 4: Front-desk enrol of an existing student (F-11)

**Closes:** F-11, interim half of F-65. **Effort:** M. Out of scope: creating a brand-new walk-in account (staff-assisted registration, D-IDENTITY-12, is Wave 1 identity work that has its own plan).

**Files:**
- Modify (backend): `backend/src/services/enrollment.service.ts` (`createEnrollment`: interim `409 ALREADY_ENROLLED_OTHER_MODE` when the student already holds an active enrollment of the same course in the other mode, also on the reactivation branch), `backend/src/services/user.service.ts` (new `lookupStudents`), `backend/src/schemas/user.schema.ts`, `backend/src/controllers/user.controller.ts`, `backend/src/routes/user.routes.ts` (`GET /users/lookup`, registered before `/:id`, roles `SUPER_ADMIN`, `ADMIN`), tests in `backend/src/services/enrollment.learning.service.test.ts` or a new `enrollment.service.test.ts`
- Modify (frontend): `frontend/app/(app)/payments/_components/CollectPayment.tsx` (student search uses the slim lookup; after selecting a student an "Enrol in a class" step), `frontend/app/(app)/classes/[classId]/_components/EnrollPanel.tsx` (staff mode: "Enrol a student" opens the same dialog), `frontend/app/(app)/classes/[classId]/page.tsx`, `frontend/lib/types.ts`
- Create (frontend, new): `frontend/app/(app)/payments/_components/StaffEnrollDialog.tsx` (class picker from `GET /classes`, mode picker, shows monthly fee and branch, confirm)

**Behaviour:** the existing `POST /enrollments` already accepts `ADMIN` and `SUPER_ADMIN` with `userId` (routes and `resolveTargetUserId` verified), so the work is the missing screen. `GET /users/lookup?q=` returns only `id`, `name`, `indexNumber`, `profileImage`, `isMinor` for active students (minimum 2 characters, limit 8; matches name, index number or phone; the phone is searched but never returned). After enrolling, the collect screen selects the new enrollment so the desk can take the first fee in the same visit. The interim guard stops a desk click creating the F-65 duplicate (online and physical dues for one course); existing duplicates are untouched.

**Vitest:** actor x target (`ADMIN`/`SUPER_ADMIN` enrol a student; `TEACHER`, `MARKER` 403 at route; `STUDENT` self-enrol still works and ignores `userId`); target is a teacher (`NOT_A_STUDENT`); target missing (`USER_NOT_FOUND`); inactive course; already enrolled same mode (`ALREADY_ENROLLED`) versus other mode (`ALREADY_ENROLLED_OTHER_MODE`) ordering; reactivation of a cancelled row in the other mode; lookup excludes staff and deactivated users, never returns phone, NIC or address; frontend dialog error and busy states.

**Live stack:** as the seeded front desk account, search a seeded student by index, enrol into a class, collect the first fee, confirm the student sees the class and receipt. See companion for the user-search exposure this replaces.

**Migration:** none. **Rollback:** revert the PR; enrollments created stay valid.

---

## Task 5: Who-owes list, CSV export and manual fee reminders (F-10, F-78)

**Closes:** F-10, F-78 (the outstanding figure counted deactivated students and was right only for the current month). **Effort:** M.

**Files:**
- Modify: `backend/prisma/schema.prisma` (`NotificationType += FEE_DUE`), migration `notification_type_fee_due` (alone in its file), `backend/src/utils/constants.ts` (`NOTIFICATION_TEMPLATES.FEE_DUE`, `AUDIT_ACTION.FEE_REMINDER_SENT`, `AUDIT_ACTION.OUTSTANDING_EXPORTED`, a `NOTIFICATION_SMS_DEFAULTS` map), `backend/src/services/notification-setting.service.ts` (`ensureDefaultSettings` seeds each new `(type, channel)` from the map instead of always `enabled: true`), `backend/src/services/payment.service.ts` (new `listOutstanding`, `exportOutstandingCsv`, `sendFeeReminders`, a small `getMonthFeeForEnrollment` stub; the raw-SQL `outstandingRows` block in `getFinancialReport` is replaced by the same TypeScript core), `backend/src/schemas/payment.schema.ts`, `backend/src/controllers/payment.controller.ts`, `backend/src/routes/payment.routes.ts` (the three routes registered before `/:id`), tests `payment.outstanding.service.test.ts` (new) and `notification-setting.service.test.ts`
- Create (frontend, new): `frontend/app/(app)/payments/owing/page.tsx`, `frontend/app/(app)/payments/_components/OutstandingTable.tsx`; modify `frontend/app/(app)/payments/_components/AdminPayments.tsx` (link), `frontend/lib/types.ts`

**Behaviour:**
- `GET /payments/outstanding?month=&courseId=&page=&limit=` (roles `SUPER_ADMIN`, `ADMIN`). Computed in TypeScript (the M6 raw-SQL ban) over active enrollments (`isActive`, user not deactivated, `Course.isActive`) with no SUCCESS payment for the month and whose first billable month (the month of `Enrollment.createdAt`, since `activatedAt` does not exist yet) is not after the requested month. Each row: student name, index number, the student's own mobile, course, mode, `monthsOwed` (up to `fees.arrearsReportMonths` months inside the active period), the amount from `getMonthFeeForEnrollment` (today `Course.monthlyFee`; D-MONEY-2 swaps this one call to `computeMonthFee`), and `inGrace` plus `graceUntil` from `isStudentCovered` so staff do not chase honest payers before the grace day. The branch filter in D-OPS-1 waits for `Course.instituteId` (D-STRUCTURE-1, Wave 2); a guardian phone appears when D-IDENTITY-2 lands, until then the student's mobile is shown.
- `GET /payments/outstanding/export` (`SUPER_ADMIN` only) streams CSV and writes an audit row; `ADMIN` gets 403.
- `POST /payments/outstanding/reminders` (`SUPER_ADMIN`, `ADMIN`; `Idempotency-Key`) with `{ month, courseId?, enrollmentIds[] }` sends `FEE_DUE` through `NotificationService.dispatch` only from day `fees.reminderFromDay`, at most `fees.reminderMaxPerStudentPerMonth` per student per Colombo month (counted from durable `Notification` rows; in-app is always created, D-OPS-2, and the SMS channel follows the per-type NotificationSetting, seeded disabled), never for a covered or in-grace student. `FEE_DUE` SMS is seeded **disabled** (D-OPS-2, D-IDENTITY-3); the existing `ensureDefaultSettings` would otherwise seed it enabled, so the seeding default for the three existing types stays true and every other new type defaults from the map. Automatic reminders are not built (`fees.autoReminderEnabled` is registered, false and unused).

**Vitest:** excludes trials (none exist yet), deactivated students, archived courses, enrollments created after the month, paid months; the amount comes from the single stub; arrears window; actor matrix (`ADMIN`/`SUPER_ADMIN` list, `ADMIN` export 403, `TEACHER`, `MARKER`, `STUDENT` 403); reminder before the day, over the cap, covered student, bad enrollment id (not in the course) 404; seeding map (new types disabled, three existing enabled, existing rows untouched); `getFinancialReport` outstanding equals the list's count.

**Live stack:** seed students unpaid for the current and previous month, open the list as the front desk, send one reminder and confirm the in-app notification and (with the channel on) an `SmsLog` row; confirm a second reminder in the same month is refused; export as the owner and confirm `ADMIN` cannot.

**Migration:** `notification_type_fee_due`. **Rollback:** revert the PR; the enum value stays, unused, and no SMS can be sent because the setting is seeded disabled.

---

## Task 6: End-of-day cash tally and collection guard (F-77, F-59)

**Closes:** F-77, F-59 (the guard is D-MONEY-2's any-SUCCESS rule pulled forward because the tally does not add up without it). **Effort:** M.

**Why `collectedAt`:** `Payment` has no collected-at time. `createdAt` is wrong when a PENDING row is converted at the desk and `updatedAt` moves on a refund or override. Also `collectEntrancePayment` currently overwrites the collector and amount of an existing non-online SUCCESS row, so a day's cash can change silently.

**Files:**
- Modify: `backend/prisma/schema.prisma` (`Payment.collectedAt DateTime?`; new `CashTally` model), migration `payment_collected_at_cash_tally`, `backend/src/services/payment.service.ts` (`collectEntrancePayment`: set `collectedAt`, refuse any existing SUCCESS row with `409 ALREADY_PAID` except through the owner override, keep `PAYMENT_REFUNDED_IMMUTABLE`; new `listCashByCollector`, `closeCashDay`, `listCashTallies`, `reconcileCashTally`), `backend/src/schemas/payment.schema.ts`, `backend/src/controllers/payment.controller.ts`, `backend/src/routes/payment.routes.ts` (`GET /payments/cash`, `POST /payments/cash-tally`, `GET /payments/cash-tally`, `PATCH /payments/cash-tally/:id/reconcile`, all before `/:id`), `backend/src/utils/constants.ts` audit actions, `backend/src/services/payment.service.test.ts`, new `payment.cash-tally.service.test.ts`
- Create (frontend, new): `frontend/app/(app)/payments/cash/page.tsx`, `frontend/app/(app)/payments/_components/CashTally.tsx`; modify `CollectPayment.tsx` (remembered collection branch select, "Today's cash" strip), `AdminPayments.tsx`, `frontend/lib/types.ts`

**`CashTally` model:** `organizationId` (+ relation and index), `collectorId`, `instituteId?`, `day` (Colombo day as `YYYY-MM-DD`), `countedAmount`, `systemAmount`, `variance`, `paymentCount`, `note?`, `reconciledAt?`, `reconciledById?`, timestamps. Uniqueness is enforced by the service upsert under `withAdvisoryLock`; two partial unique indexes (`(collectorId, day, instituteId) WHERE instituteId IS NOT NULL` and `(collectorId, day) WHERE instituteId IS NULL`) are added in the migration SQL only if `prisma migrate diff --exit-code` stays clean on the scratch database, otherwise dropped (the lock is the guard). `systemAmount` matches branch through the existing `Payment.collectedAtInstituteId`.

**Behaviour:** the "cash" of D-OPS-1 is `PaymentMethod.ENTRANCE`. `systemAmount` is the sum of `amount` of that collector's `ENTRANCE` payments (status SUCCESS or REFUNDED, a refund does not un-collect the cash) with `collectedAt` inside the Colombo day and matching branch. A close records the clerk's typed `countedAmount` and the computed `variance`; a non-zero variance beyond `tally.varianceFlagAmount` is flagged. The tally is a record, not a lock: a later payment changes the live `currentSystemAmount` and the row shows `staleSinceClose`. `ADMIN` closes and reads only their own days; `SUPER_ADMIN` reads all collectors, filters by collector, branch and date range, and marks a day reconciled. `GET /payments/cash` is the group-by (collector, day, branch) with totals; ADMIN is forced to their own `collectorId`. Setting `tally.enabled = false` hides the UI and rejects closes.

**Migration (expand, backfill):** add the nullable column and table; backfill `collectedAt = updatedAt` for `method = ENTRANCE AND status IN ('SUCCESS','REFUNDED')` in one `UPDATE`. Roll forward only; the column is nullable so old code keeps working.

**Vitest:** collector matrix (`ADMIN` own day, `ADMIN` other collector's day 403, `SUPER_ADMIN` any, `TEACHER`, `MARKER`, `STUDENT` 403); re-collect of an existing SUCCESS row 409 for cash, bulk and manual rows; PENDING/FAILED conversion allowed and stamps `collectedAt`; Colombo midnight (a 00:10 payment belongs to the new day); close twice for the same day updates rather than duplicates; variance flag at the setting boundary; payment collected after close shows stale; reconcile requires `SUPER_ADMIN`, double reconcile idempotent; not-found tally 404.

**Live stack:** collect three cash fees as the front desk, close the day with a counted amount one rupee short, see the flag as the owner, reconcile, then collect a fourth fee and confirm the stale marker.

**Rollback:** revert the PR; leave the column and table. The guard is code only, so the old overwrite behaviour returns on revert.

---

## Task 7: Bulk payment upload guard (F-58)

**Closes:** F-58, per D-OPS-1 ("restricted to `SUPER_ADMIN`; migration and recovery tool"). **Effort:** S.

**Files:** modify `backend/src/routes/payment.routes.ts` (`/bulk-upload` roles `SUPER_ADMIN` only), `backend/src/controllers/payment.controller.ts` (pass the actor), `backend/src/services/payment.service.ts` `bulkUploadPayments` (the hard-coded 5,000-row cap at about line 940 becomes `bulk.maxRows`), `backend/src/services/payment.service.test.ts`; `frontend/app/(app)/payments/_components/AdminPayments.tsx` and its test (upload visible to the owner only, dry-run step); `context/api_endpoints/payments.endpoints.md`.

**Behaviour:** each row must resolve to an **active** enrollment of an active course, with a month not later than the current Colombo month plus `fees.advanceMonthsAllowed`, and an amount equal to `Course.monthlyFee` (the single fee stub of Task 5; an amount column that differs is a row error, not a silent override). A row on a month that already has any SUCCESS payment is an error (no overwrite). Each created payment is stamped with the actor as `collectedById`, the whole file runs in one transaction with a `?dryRun=true` preview that writes nothing, and each applied row writes an audit row. The `ADMIN` role is removed from this route; front desk collects one by one.

**Vitest:** actors (`SUPER_ADMIN` ok; `ADMIN`, `TEACHER`, `MARKER`, `STUDENT` 403); inactive enrollment, deactivated student, future month beyond the allowance, existing SUCCESS month, amount mismatch, over `bulk.maxRows`, dry run writes nothing, mid-file failure rolls back everything; refunded row stays immutable.

**Live stack:** dry-run then apply a small workbook as the owner; the same call as the front desk returns 403. **Migration:** none. **Rollback:** revert the PR (restores the old open route; announce before reverting).

---

## Task 8: Enrollment and fee state at the entrance scan (F-12) and the single Attendance migration

**Closes:** F-12. **Effort:** M. Security class: sits on the Wave 0 resolver; see companion for the identity-resolution defect it must not regress.

**Not in this task:** the scan time window (F-43), student-centric auto mode (D-OPS-3), teacher marking and voiding (D-EXAMS-8), live reconcile (D-ACCESS-6). The migration adds their columns now because D-ACCESS-5 requires one Attendance migration; this task only writes the snapshot columns.

**Files:**
- Modify: `backend/prisma/schema.prisma` (`AttendanceStatus` { `PRESENT`, `LATE`, `PARTIAL`, `EXCUSED` }, `EnrollmentScanState` { `ENROLLED`, `NOT_ENROLLED`, `MODE_MISMATCH` }; `Attendance`: `status` default `PRESENT`, `markedById?`, `voidedAt?`, `voidedById?`, `voidReason?`, `enrollmentStateAtScan?`, `paidAtScan?`, `durationSeconds?`, `instituteId?`, with relations to `User` and `Institute` using `SetNull` and indexes), migrations `attendance_status_columns` and `attendance_source_video`
- Modify: `backend/src/services/attendance.service.ts` (`scanBarcode` loads the session's course, resolves the student through the Wave 0 `resolveStudentByCode`, finds the student's active enrollments for `session.courseId`, derives the state, calls `isStudentCovered` with the chosen enrollment, applies `attendance.scan.*Policy`, writes the snapshot on create and only `lastSeenAt` on a repeat scan; `markManualAttendance` writes the same snapshot with no block), `backend/src/controllers/attendance.controller.ts` (response adds `context`), `backend/src/services/attendance.service.test.ts`
- Modify (frontend): `frontend/app/(app)/attendance/_components/StaffScanner.tsx` and its test, `frontend/lib/attendance.ts`, `frontend/lib/types.ts`

**Behaviour:** the response keeps today's `data` (the attendance record) and adds `data.context = { enrollmentState, paidThisMonth, covered: 'PAID' | 'GRACE' | 'UNPAID', graceUntil, warnings[], student: { name, indexNumber, profileImage } }`. The enrollment for the check is the student's active PHYSICAL enrollment of the course; only ONLINE enrollments give `MODE_MISMATCH`; none gives `NOT_ENROLLED`. With both policies at `WARN` (default) the row is always written and the scanner shows amber (inside grace) or red (outside grace) with a "Collect payment" link and a "Not enrolled" banner with an "Enrol" link to Task 4; the profile photo is shown large (a missing photo shows "No photo on file"). With a policy at `BLOCK` the scan is refused with `403 SCAN_BLOCKED_NOT_ENROLLED` or `402 SCAN_BLOCKED_UNPAID` and nothing is written. Structural failures (unknown or ambiguous code, deactivated or non-student user, institute mismatch) keep refusing as today.

**Vitest:** enrollment state x coverage x policy matrix (9 states x WARN/BLOCK), repeat scan keeps the snapshot, ONLINE-only student, two enrollments, student paid in another course only, grace edge day (`fees.graceDays` and the day after), deactivated user, non-student, wrong institute, ambiguous code stays refused (ordering: structural refusal before warnings), manual mark writes a snapshot, session not found 404.

**Live stack:** scan a paid, a graced, an unpaid and a not-enrolled seeded student at the front desk; confirm four banners, four rows, and that the snapshot columns are filled (`psql`). **Migration:** both files above, expand only, applied to a copy first. **Rollback:** revert the PR; columns stay nullable or defaulted, old code ignores them.

---

## Task 9: Teacher class roster with a three-value fee state (F-83)

**Closes:** F-83. **Effort:** M. Security class: field whitelist and scoping; see companion (it must not reuse the existing per-student attendance read).

**Files:**
- Create (new): `backend/src/services/roster.service.ts`, `backend/src/services/roster.service.test.ts`
- Modify: `backend/src/schemas/class.schema.ts`, `backend/src/controllers/class.controller.ts`, `backend/src/routes/class.routes.ts` (`GET /classes/:classId/roster`, roles `SUPER_ADMIN`, `ADMIN`, `TEACHER`)
- Create (frontend, new): `frontend/app/(app)/classes/[classId]/_components/ClassRoster.tsx` and test; modify `frontend/app/(app)/classes/[classId]/page.tsx` (a "Students" section for the owning teacher, `ADMIN` and `SUPER_ADMIN`), `frontend/lib/types.ts`

**Behaviour:** per active enrollment (`deletedAt` of the user null, course any state the viewer may open) return exactly `{ studentId, name, indexNumber, classType, enrolledAt, feeState: 'PAID' | 'NOT_PAID', attendedLastN: { attended, sessions } }` and nothing else: no phone, NIC, address, email, amount, method, collector or concession. `PAID` means a SUCCESS row for the current Colombo month; it is deliberately not grace-aware (the teacher sees who actually paid) and may differ from the content gate. `TRIAL` and the "Repeater" badge arrive with their data (Wave 2). `attendedLastN` counts non-voided rows with `status` in (`PRESENT`, `LATE`); `EXCUSED` and `PARTIAL` are excluded over the last `roster.attendanceWindowSessions` held sessions in one grouped query. Pagination by `roster.pageSize`, sorted by name. `roster.showPaidState = false` omits `feeState`. No CSV export for teachers. The teacher cannot message students from it.

**Vitest:** actor x target (`TEACHER` own course ok, other teacher's course 403 `FORBIDDEN_COURSE`, `ADMIN` and `SUPER_ADMIN` ok, `MARKER`, `STUDENT` 403); unknown course 404 before role-specific logic; a Vitest key test asserts the exact key set of a row; dropped (inactive) enrollment absent; deactivated student absent; Colombo midnight on the 1st; voided attendance excluded; setting off removes `feeState`; no N+1 (assert the mocked query count).

**Live stack:** as the owning seeded teacher open the class page, confirm the table; open a colleague's class by direct URL and API call and confirm 403. **Migration:** none (reads the Task 8 `voidedAt` column). **Rollback:** revert the PR.

---

## Task 10: Teacher and owner enter marks (F-67)

**Closes:** F-67. **Effort:** S. Also creates the shared Submission migration (hall marks, Task 11, reuses it).

**Files:**
- Modify: `backend/prisma/schema.prisma` (`SubmissionSource` { `ONLINE`, `HALL` }, `Submission.source` default `ONLINE`, `Submission.gradedById?` with relation `SubmissionGrader` (`onDelete: Restrict`) and an index), migration `submission_source_graded_by`
- Modify: `backend/src/routes/submission.routes.ts` (`PATCH /:id/marks` roles `SUPER_ADMIN`, `TEACHER`, `MARKER`), `backend/src/controllers/submission.controller.ts` (`authorizeMarks` and `submitMarks` take the actor), `backend/src/services/submission.service.ts` (new `assertMayGradeSubmission(submissionId, actor)` dispatching by role; `assertMarkerMayGradeSubmission` stays for markers; `submitMarks(submissionId, input, actor)` writes `gradedById`; `correctPublishedResult` also writes `gradedById`), `backend/src/services/submission.service.test.ts`
- Modify (frontend): `frontend/app/(app)/submissions/[examId]/_components/GradeSubmissionRow.tsx` and its test (teacher and owner get the marks entry before publish), `frontend/app/(app)/submissions/[examId]/page.tsx`

**Behaviour:** widening the role list is not enough because `authorizeMarks` calls the marker-only assertion; the teacher path has its own authorizer (existing submission, then `assertCourseAccess(exam.courseId)` for a teacher, owner passes). A write by a `TEACHER` or `SUPER_ADMIN` sets `gradedById`. A `MARKER` write over marks whose grader is a `TEACHER` or `SUPER_ADMIN` fails `409 MARKS_SET_BY_TEACHER` (the grader's role is derived from the `gradedBy` relation, not stored; null `gradedById`, legacy or auto-graded rows, stays overwritable by a marker as today). A teacher write over a marker's marks is allowed. After publish nothing changes: markers stay locked out and changes use the existing correction path (the first-marking-after-publish exception is Wave 2, D-EXAMS-4). The route keeps the actor-scoped idempotency middleware so answer-bearing responses do not replay across actors.

**Vitest (actor x target x state):** actors `SUPER_ADMIN`, owning `TEACHER`, other `TEACHER`, assigned `MARKER`, unassigned `MARKER`, `ADMIN`, `STUDENT`; targets own-course submission, other-course submission, scoped-exam submission (marker with and without the audience grant), published exam, `UPLOADING` submission, marks above total, unknown submission id; overwrite matrix (existing marks set by null, marker, teacher) x (marker writes, teacher writes); ordering (existence, then ownership or assignment, then published, then status, then range, then overwrite rule); `gradedById` set on correction.

**Live stack:** as the owning teacher grade a seeded submission, confirm `gradedById`, then as the assigned marker try to overwrite and expect 409; as the other teacher expect 403. **Migration:** `submission_source_graded_by`. **Rollback:** revert the PR; the columns stay unused.

---

## Task 11: Hall marks entry (F-13)

**Closes:** F-13 (paper exams sat in the hall had no entry path). **Effort:** M. D-EXAMS-2 supersedes the shape designed for "Task 4" of the 2026-09-06 plan (`SubmissionOrigin`, `AcademicEvent`, expected-version); see Docs to update.

**Files:**
- Create (new): `backend/src/services/hall-marks.service.ts`, `backend/src/schemas/hall-marks.schema.ts`, `backend/src/controllers/hall-marks.controller.ts`, `backend/src/services/hall-marks.service.test.ts`
- Modify: `backend/src/routes/exam.routes.ts` (`PUT /exams/:examId/hall-marks`, roles `SUPER_ADMIN`, `TEACHER`, `MARKER`, `Idempotency-Key`), `backend/src/services/access.service.ts` (a non-throwing marker-audience check extracted from `assertMarkerAssignedToExamAudience` for per-row results), `backend/src/services/audit.service.ts` (new `logInTransaction(tx, input)`, because `log` is fire-and-forget and the batch must roll back with its audit row), `backend/src/utils/constants.ts` (`AUDIT_ACTION.HALL_MARKS_ENTERED`)
- Create (frontend, new): `frontend/app/(app)/submissions/[examId]/_components/HallMarksEntry.tsx` and test; modify `frontend/app/(app)/submissions/[examId]/page.tsx`, `frontend/app/(app)/exams/[examId]/page.tsx` (the INCLASS branch says "Absent" once results are published and the student has no row), `frontend/lib/types.ts`

**Behaviour:** body `{ rows: [{ indexNumber, marks }], dryRun }`, at most `exams.hallMarks.maxRowsPerBatch` rows, integer marks unless `exams.hallMarks.allowDecimal`. Eligible exams: `INCLASS` (any active enrollment in the course) or a scoped exam where the student's audience is `PHYSICAL`; any other exam is refused. Authorized actors: owning teacher (`assertCourseAccess`), `SUPER_ADMIN`, and a `MARKER` assigned to the exam (legacy) or holding the grant for the student's audience (scoped, checked per row); never `ADMIN` or `STUDENT`. Index numbers are resolved through the exam's course roster, not a global search. `dryRun: true` writes nothing and returns per row `OK`, `WILL_CHANGE` (before and after), `UNKNOWN_INDEX`, `NOT_ELIGIBLE`, `NOT_ASSIGNED`, `DUPLICATE_IN_BATCH`, `OUT_OF_RANGE`, `ONLINE_SUBMISSION_EXISTS`; student names only for `TEACHER` and `SUPER_ADMIN` (a marker sees index numbers and statuses). `dryRun: false` applies all rows or none in one Serializable transaction under `withAdvisoryLock`, creating or updating one `COMPLETED` submission per row with `source = HALL`, no answers, `marks` and `gradedById` set, and writes one in-transaction audit row (counts plus `{ indexNumber, before, after }` for changed rows, no names). Absent students are omitted: no row, never a fake zero. Not allowed after publish (the existing correction path applies).

**Vitest:** actor x target (all roles above x eligible/ineligible exam types x published); unknown index; student not enrolled; scoped exam with online audience row; duplicate index in a batch; mark above total; over row cap; marker assigned and unassigned, per-row audience grant; names hidden from markers; dry run writes nothing; rerun with the same data is idempotent; a forced audit failure rolls back every row; existing `ONLINE` submission refuses its row; exam not found 404 before role checks.

**Live stack:** create an `INCLASS` exam in a seeded class, paste a dry-run list with one wrong index, fix, apply, publish, and view as a student (marks) and an unlisted student (Absent). **Migration:** reuses Task 10's. **Rollback:** revert the PR; `HALL` rows remain valid submissions.

---

## Task 12: Timetable classes that can go live (F-104)

**Closes:** F-104, per D-STRUCTURE-7 (a null session mode means "in hall + live stream"). **Effort:** S. The Zoom concurrency check (D-OPS-4, Wave 2) is not added, so with more classes able to go live the single licence is the owner's to watch; see companion.

**Files:**
- Modify (backend): `backend/src/services/live-class.service.ts` (`scheduleLiveClass` rejects only `PHYSICAL`; null and `ONLINE` pass; message updated), `backend/src/services/class-session.service.ts` (`updateClassSession`: changing a session that already has a Zoom meeting to `PHYSICAL` returns `409 SESSION_HAS_LIVE_CLASS`), `backend/src/worker.ts` and `backend/src/utils/constants.ts` (`TIMETABLE_GENERATE_AHEAD_DAYS` replaced by `timetable.generateAheadDays`), tests `live-class.service.test.ts`, `class-session.service.test.ts`
- Modify (frontend): `frontend/app/(app)/timetable/_components/TimetableManager.tsx` (no empty default; the mode is required: "In hall", "Online only", "In hall + live stream"; the null value is stored for the last), `frontend/app/(app)/classes/[classId]/page.tsx` (the session list shows `LiveClassAction` for any session that is not `PHYSICAL` and labels null "In hall + live stream"), `frontend/app/(app)/classes/[classId]/_components/LiveClassAction.tsx`, `frontend/lib/types.ts`
- Create (frontend, new): `frontend/app/(app)/classes/[classId]/_components/SessionEditDialog.tsx` (mode, date, duration; calls the existing `PATCH /classes/:classId/sessions/:sessionId`); warns that a rescheduled date does not move an already created Zoom meeting

**Behaviour:** one slot and one session per lesson; same-course and same-teacher overlap rules stay strict (ONLINE vs PHYSICAL overlaps are not exempted). Access follows the enrollment mode and is unchanged here (the PHYSICAL-only rule is Wave 2). A simulcast session with no Zoom link is a hall class until the teacher schedules the stream.

**Vitest:** schedule for `ONLINE`, null and `PHYSICAL`; already scheduled; non-owning teacher 403; `ADMIN` 403 at route; session change to `PHYSICAL` with a meeting 409; not found 404; worker reads the setting; overlap still rejected; frontend required-mode form.

**Live stack:** create a slot with the new "In hall + live stream" mode, generate sessions, schedule a live class on one, and join as an enrolled paid student. **Migration:** none. **Rollback:** revert the PR; existing null-mode sessions are unchanged.

---

## Task 13: Scoped-exam sitting without an audience pick, and upload retry (F-17, F-22)

**Closes:** F-17, F-22, student-side half of F-69 (defect class: scoped-exam visibility needs audience checks). **Effort:** M. See companion for the exposure details.

**Files:**
- Modify: `backend/src/services/access.service.ts` (`assertStudentExamStartAccess`; new `resolveStudentExamAudience(db, examId, userId)`), `backend/src/services/submission.service.ts` (`startSubmission`: the pre-transaction duplicate check and the in-transaction duplicate check both gain the resume rule; the in-transaction audience check reuses the helper; `completeSubmission` reads `exams.uploadGraceSeconds` instead of the hard-coded 60 s), `backend/src/services/exam.service.ts` (`listExams` and `getExamById` for students: scoped exams need a participant row; `myAudience` on both), `backend/src/schemas/submission.schema.ts` (`audienceId` stays optional), `backend/src/services/submission.service.test.ts`, `backend/src/services/exam.service.test.ts`
- Modify (frontend): `frontend/app/(app)/exams/[examId]/page.tsx` (three states from `myAudience`; resume state for an unfinished upload), `frontend/app/(app)/exams/[examId]/_components/ExamSit.tsx` (resume mode; no audience sent), `frontend/app/(app)/exams/[examId]/_components/ExamResult.tsx` ("Your answer file was not received" when `UPLOADING` after the window), `frontend/app/(app)/exams/_components/ExamCard.tsx`, `frontend/lib/types.ts`

**Behaviour:**
- The client never sends an audience. The server derives it from the participant row (`ExamParticipant` is unique on `(examId, userId)`). `ONLINE` starts; `PHYSICAL` returns `409 EXAM_PHYSICAL_AUDIENCE` ("Your paper is sat in the hall"); no row is `403 EXAM_PARTICIPANT_NOT_FOUND` on start and the exam is hidden (404) from the student's list and detail ("You are not on the list, ask your teacher"). A body `audienceId` is optional and must match, otherwise `400 EXAM_AUDIENCE_MISMATCH`. Legacy exams are unchanged. `GET /exams` and `GET /exams/:id` for a student add `myAudience { label, deliveryMode, instituteName? }`.
- Upload retry: a submission that is `UPLOADING` with no stored PDF is an unfinished attempt. While the window is open, a new start request by the same student reuses that row (resuming with a fresh presigned URL, or switching to typed answers) instead of `409 ALREADY_SUBMITTED`. A `COMPLETED` row, or an `UPLOADING` row that already has a stored file, still returns `ALREADY_SUBMITTED`. After `endTime` nothing is accepted for start; only `completeSubmission` within `exams.uploadGraceSeconds` (default 180) still finalises an upload that began in time. This is a behaviour change from 60 to 180 seconds, announced in the PR.
- Check ordering: exam exists and is not deleted, enrollment (`NOT_ENROLLED`), participant and audience, published, time window, duplicate or resume.

**Vitest:** audience matrix (ONLINE participant with and without a sent `audienceId`, wrong `audienceId`, PHYSICAL participant, non-participant, legacy exam, staff roles unaffected); list and detail visibility for student/teacher/owner/marker; resume cases (UPLOADING without PDF resumes; with PDF, COMPLETED, published, after end all refuse; typed switch; two concurrent resumes serialize under the existing exam lock); grace boundary at 179/181 s; not-found exam; `NOT_ENROLLED` before participant check.

**Live stack:** with a seeded scoped exam, sit as an online participant (no picker), see the hall message as a physical participant and the 404 as a non-participant; start a PDF submission, kill the upload, reload, retry and complete. **Migration:** none. **Rollback:** revert the PR (a row resumed in the meantime is a normal `UPLOADING` row).

---

## Task 14: Autosave typed answers and submit before time is up (F-86)

**Closes:** F-86. **Effort:** S.

**Files:** modify `frontend/app/(app)/exams/[examId]/_components/ExamSit.tsx`, `CountdownTimer.tsx`, `WrittenAnswerPanel.tsx` and tests; `frontend/lib/exam.ts`; `frontend/lib/types.ts`; backend `backend/src/services/exam.service.ts` (student `getExamById` returns `sitting: { autoSubmitLeadSeconds }` from `exams.autoSubmitLeadSeconds`, additive).

**Behaviour:** typed answer parts and the chosen channel are saved to `localStorage` on change (wrapped in try/catch, the page works without storage) and restored on load, together with the existing MCQ autosave. A `beforeunload` warning is shown while unsent content exists. The server rejects any start after `endTime` (`startSubmission`), so an auto-submit at 0:00 would race the server and lose on any clock skew. The client therefore fires the submit `exams.autoSubmitLeadSeconds` before the end, using a server clock offset taken from `data.timestamp` in the body of `GET /api/health` (round-trip compensated, refreshed every five minutes; fall back to the client clock if unreachable), shows "Submitted automatically", and does nothing when nothing is typed or chosen. A PDF is auto-submitted only if a file was already selected. The Submit button stays enabled until the early submit fires, and the countdown gets an accessible label (`role="timer"`).

**Vitest (frontend):** restore after reload, corrupt storage, storage unavailable, auto-submit fires at end minus lead (fake timers, with a skewed server offset in both directions), nothing typed means no request, double submit prevented, `beforeunload` registered and removed, PDF without a file does not submit.

**Live stack:** with a short exam (end in 2 minutes) type an answer, set the device clock 30 s fast, confirm the auto-submit lands and the server records it; reload mid-exam and confirm the draft returns. **Migration:** none. **Rollback:** revert the PR.

---

## Task 15: Read-only owner console, money panels (F-127 part 1)

**Closes:** F-127 (part 1). **Effort:** M.

**Files:**
- Create (new): `backend/src/services/console.service.ts` (composes `payment.service` functions from Tasks 5 and 6 and nothing else), `backend/src/controllers/console.controller.ts`, `backend/src/routes/console.routes.ts`, `backend/src/services/console.service.test.ts`
- Modify: `backend/src/index.ts` (mount `/api/console`, every route `SUPER_ADMIN` only and `GET` only)
- Create (frontend, new): `frontend/app/(app)/admin/console/page.tsx`, `loading.tsx`, `_components/CashPanel.tsx`, `_components/OwingPanel.tsx`; modify `frontend/lib/nav.ts` ("Console", `SUPER_ADMIN`, first item in Administration), `frontend/lib/types.ts`

**Behaviour:** `GET /console/cash?date=` returns today's tallies by collector and branch, flagged variances, unreconciled days older than today and the collected total by method; `GET /console/owing?month=` returns the who-owes totals (students, amount) and the top courses by amount owed, linking to Task 5's list. Panels load independently with their own loading and error states so one slow panel does not blank the page. The console is read-only: no mutation endpoint exists under `/console`.

**Vitest:** `SUPER_ADMIN` ok; `ADMIN`, `TEACHER`, `MARKER`, `STUDENT` 403; no non-GET method registered (route table assertion); each panel's numbers equal the underlying service output; empty database returns zeros.

**Live stack:** after Tasks 5 and 6 data exist, open the console as the owner at phone width and desktop. **Migration:** none. **Rollback:** revert the PR.

---

## Task 16: Owner console, operations panels (F-127 part 2)

**Closes:** F-127 (part 2). **Effort:** M. Includes only panels backed by Wave 1 data.

**Files:**
- Modify: `backend/src/services/console.service.ts`, `console.controller.ts`, `console.routes.ts`, `console.service.test.ts`
- Create (frontend, new): `frontend/app/(app)/admin/console/_components/MarkingPanel.tsx`, `AttendancePanel.tsx`, `SetupPanel.tsx`, `SmsPanel.tsx`; modify the console page

**Behaviour:**
- `GET /console/marking`: exams that ended within `console.lookbackDays` and are not published, with submitted, graded, ungraded and incomplete counts and hall-entry state.
- `GET /console/attendance-today`: today's (Colombo) sessions with course, time, branch, scanned count and enrolled count, plus the number of scans in the lookback window flagged "attended without enrollment" or "attended unpaid" from the Task 8 snapshot columns (the F-12 report for the owner).
- `GET /console/setup`: active courses whose teacher account is deactivated (the orphaned-classes list that precedes the Wave 2 hand-over flow), active courses whose `year` is before the current Colombo year ("batches to end"), and active students with no phone.
- `GET /console/sms`: counts of `SmsLog` rows by status for the last 7 days and the month, and the most recent failures (message body omitted, phone masked); this supports the owner's SMS trial week.
- Deliberately not built here: security-event audit panel (F-121 is unfixed, so the data does not exist), teacher statements (Wave 2), request queue and open reversals (Wave 2 data), and the audited view-as mode (Deferred).

**Vitest:** role matrix as Task 15; each panel against fixtures including a deactivated teacher with an active class, a year-old class, an exam with ungraded rows, a scan without enrollment; SMS panel masks phones and omits message bodies.

**Live stack:** deactivate a seeded teacher with a class, scan an unenrolled student, leave an exam ungraded, and confirm each appears on the console. **Migration:** none. **Rollback:** revert the PR.

---

## Deferred (decided, not in this wave)

- **Audited read-only view-as** (F-127 remainder): it is an access-control feature (a claim that makes every route read-only and writes audit rows). Mechanics and the proposed route-by-route enforcement are in the companion; it gets its own plan before any code.
- **Planned in the companion plan [Wave 1b](./2026-11-20-wave-1b-identity-attendance-structure-and-drivers.md):** scan window F-43, student-centric auto mode (D-OPS-3), the single attendance writer, teacher mark and void (D-EXAMS-8), staff-assisted registration of a new walk-in (D-IDENTITY-12), F-32/F-107 deactivation and hand-over guards, F-29 server gate, role-shaped reads (F-42, F-118; Task 4's lookup replaces the `CollectPayment` picker; Wave 1b Task 8 switches the `StaffScanner` "Mark by name" and narrows `GET /users`), lost-card reissue, front-desk scheduling limits, the course archive rule (F-106, F-109), and the local video, PayHere and clock drivers.
- **Later waves:** absence SMS and quiet hours, `computeMonthFee`, concessions, HYBRID, the content-gate rewrite (D-MONEY-1), guardian records (Wave 2 T21; Wave 1b stores one interim guardian per student).
- Dashboard widgets (F-20): the console is a separate owner page; role dashboards are unchanged.

## Definition of Done

For each task:
- [ ] Branch is off fresh `origin/dev`, one cohesive PR, Conventional Commit title, no attribution lines, squash-merged, branch deleted.
- [ ] Backend `npm run test`, `npm run lint`, `npm run build` green; frontend `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` green; `npx tsx src/scripts/check-tenant-integrity.ts` green.
- [ ] The actor x target matrix, not-found cases and check-ordering case for every new guard exist and pass.
- [ ] Live-stack verification done with `docker compose build backend && docker compose up -d` and the seeded demo accounts, with `docker compose logs backend --tail 200` free of new errors; mobile width checked for new screens.
- [ ] Migration proven on a scratch database (fresh and upgrade), expand only, with the rollback written in the PR.
- [ ] Every numeric default is a registry setting with a range, not a constant.
- [ ] No response, log line, audit row or SMS contains a one-time secret; no new role can reach data it could not before (the role matrix in the PR description says so).
- [ ] Docs below updated **in the same PR**.

For the wave: all 17 PRs merged; doc 18 shows every closed F-id as `Fixed (#<pr>, vX.Y.Z)`; a live-stack walk-through of one working day per role (front desk: enrol, collect, scan, close the day; teacher: roster, marks, hall marks, go live; student: sit a scoped exam with a retry; accounts: reset and create; owner: console) is recorded in the progress tracker with the SHA and image tag.

## Docs to update (same PR as the code)

| Doc | Update | Task |
|---|---|---|
| `context/documents/18-flow-audit-findings-register.md` | Status column (added in Task 0), then each closed row | all |
| `context/documents/17-roles-permissions-and-flows.md` | section 7 Wave 1 status; section 5 and 9 notes where decided (grace, teacher marking, roster) | all |
| `context/documents/15-requirements-traceability.md` | R-PAY-05 (bulk), R-PAY-07, R-PAY-09, R-EXM-06 (Task 10), R-EXM-07 (Task 11), R-EXM-10 and R-EXM-03 (Tasks 13, 14), R-USR-03, R-USR-05 and R-USR-06 (staff accounts: add a staff-creation note), R-ATT rows | 1, 2, 3, 4, 5, 8, 10, 11, 13 |
| `context/documents/06-progress-tracker.md` | base SHA, per-PR evidence | all |
| `context/documents/13-product-roadmap.md` | Wave 1 items moved to done | 15, 16 |
| `context/documents/08-database-design.md` | `OrganizationSetting`, `CashTally`, `Payment.collectedAt`, Attendance columns, `Submission.source` and `gradedById`, `User.tokenVersion` and `mustChangePassword` | 1, 2, 6, 8, 10 |
| `context/documents/02-architecture.md` | settings registry, Colombo billing clock, auth per-request lookup | 1, 2 |
| `context/documents/14-multi-tenancy-readiness.md` | registry list and tenant-owned table list | 1, 6 |
| `context/documents/10-maintenance-guide.md` | temporary-password runbook, settings screen | 2, 3 |
| `context/api_endpoints/payments.endpoints.md` | outstanding, reminders, cash tally, collect guard, bulk guard | 5, 6, 7 |
| `context/api_endpoints/attendance.endpoints.md` | scan `context`, policies, snapshot columns | 8 |
| `context/api_endpoints/enrollments.endpoints.md` | `ALREADY_ENROLLED_OTHER_MODE`, staff enrol flow | 4 |
| `context/api_endpoints/users.endpoints.md` | `GET /users/lookup`, `POST /users/staff`, `POST /users/:id/reset-password` | 2, 3, 4 |
| `context/api_endpoints/auth.endpoints.md` | `mustChangePassword`, `tokenVersion`, `GET /auth/me` organization | 2, 1 |
| `context/api_endpoints/classes.endpoints.md` | `GET /classes/:classId/roster`; session edit | 9, 12 |
| `context/api_endpoints/submissions.endpoints.md` | teacher and owner marks, `MARKS_SET_BY_TEACHER`, `source`, `gradedById` | 10, 11, 13 |
| `context/api_endpoints/exams.endpoints.md` | `PUT /exams/:examId/hall-marks`, `myAudience`, resume rule, `sitting` | 11, 13, 14 |
| `context/api_endpoints/timetable.endpoints.md`, `live-class.endpoints.md` | null session mode, scheduling rule, setting | 12 |
| `context/api_endpoints/notifications.endpoints.md` | `FEE_DUE`, per-type seeding defaults | 5 |
| `context/api_endpoints/settings.endpoints.md` (new), `console.endpoints.md` (new) | new endpoint docs | 1, 15, 16 |
| `docs/superpowers/plans/2026-09-06-shared-exam-scoped-marking-implementation.md` | add a status line that its Task 4 shape is superseded by D-EXAMS-2 (hall marks, `SubmissionSource`, in-transaction audit row, no `AcademicEvent`) | 11 |
| `CLAUDE.md` | one line: owner-tunable policy lives in organization settings; content gate uses the org timezone and grace; teachers and owners may enter marks | 1, 10 |

## Plan Self-Review

- **Coverage:** every finding named in the request maps to a task: F-11 (4), F-10 (5), F-77 (6), F-12 (8), F-83 (9), F-67 (10), F-13 (11), F-17 (13), F-22 (13), F-86 (14), F-03 (2), F-21 (3), F-104 (12), F-127 (15, 16). F-15, F-58, F-59 and F-78 are pulled in because the named work cannot be correct without them.
- **Safety:** no task widens what a role can read or move except by an explicit guard and matrix; security-class mechanics are kept out of this public file.
- **Decision conflicts found while planning** (resolved in the tasks above): the password-change cooldown versus the forced change (Task 2); the new-SMS-types-disabled rule versus the notification seeder that enables every new type (Task 5); the exam auto-submit versus the strict server end time (Task 14); the marker-only marks route (Task 10); the 2026-09-06 plan's Task 4 versus D-EXAMS-2 (Task 11); the lack of a collected-at time for the tally (Task 6); D-OPS-1's "by branch" filter versus `Course` having no branch yet (Task 5).
