# Wave 1b: Identity Safety, Attendance Authority, Course Lifecycle Guards and Local Drivers (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. One task is one branch and one PR.

**Goal:** Finish the rest of Wave 1 that [the Wave 1 plan](./2026-11-20-wave-1-working-day-per-role.md) deliberately left out: the identity safety rules (who may deactivate or re-role staff and what must be handed over first, staff-assisted registration, stopping NIC collection, one profile-completeness gate, role-shaped reads, lost-card handling), one authority for attendance (a single writer, the scan time window, student-centric scanning, teacher marking and voiding, front-desk scheduling limits), one meaning for an archived course, and three local stand-ins (video, PayHere, clock) so the later waves can be verified end to end on a laptop.

**Architecture:** Same as Wave 1: reuse the existing services; every owner-tunable number comes from the `OrganizationSetting` registry built in Wave 1 Task 1; all "which month/day" arithmetic uses `Organization.timezone`; services are the only layer that imports Prisma; no process-memory state, no new hand-built Redis keys. Every guard ships with an actor x target Vitest matrix.

**Tech Stack:** Next.js 16 / React 19 frontend; Express 5 / TypeScript / Prisma 7 / PostgreSQL backend; BullMQ worker; Vitest; Docker Compose live stack.

**Findings closed:** F-08, F-14 (precedence half only; live reconcile stays in Wave 2 T24), F-19, F-27, F-29, F-30, F-32, F-33, F-35, F-37, F-41, F-42, F-43, F-82, F-100, F-105, F-106, F-107, F-109, F-114, F-116, F-118, F-119 (UI half). Doc 17 section 9 items 6, 7, 11 and 12 are settled in code by these tasks. Defect class only for the security-class items; mechanisms are in the private companion `2026-11-20-wave-1b-identity-attendance-structure-and-drivers.md` kept in the maintainer's audit notes (outside this repository).

**Status of this plan.** Planned, nothing implemented. Decisions of 2026-11-19/20 are cited by id (`D-...`) and are not reopened here ([doc 19](../../../context/documents/19-owner-decisions-2026-11-20.md)). Delivery order is in [the Wave 2 plan master table](./2026-11-20-wave-2-access-coherence-and-delivery-order.md): this plan is the work listed there as W1-S2, W1-S3, the remainder of W1-S4 and the drivers D-video, D1 and D3.

---

## Preconditions

### What must already be merged

| Needed | From | Why |
|---|---|---|
| Wave 0 | [Wave 0 plan](./2026-11-20-wave-0-stop-the-bleeding.md) | F-01 session lifetime, the single scan-code resolver `resolveStudentByCode` with collision report and write-time uniqueness for new codes, recording and attendance read restrictions, `seed-admin` create-only with owner invariants, `withAdvisoryLock` |
| Wave 1 Task 1 | settings registry, Colombo clock, `isStudentCovered` | every number below is a registry key; Tasks 8 and 9 below read coverage |
| Wave 1 Task 2 | per-request user lookup, `User.tokenVersion`, `mustChangePassword`, `verifyActorPassword` step-up | deactivation, role change and card reissue are only as fast as revocation |
| Wave 1 Task 3 and Task 4 | staff creation; `GET /users/lookup`; staff enrol | Task 5 below extends the same screens; Task 8 reuses the lookup |
| Wave 1 Task 9 | the class roster | Task 12's toggles, Task 8's `TEACHER` row |
| Wave 1 Task 8 | the single `Attendance` migration (status, `markedById`, void columns, snapshots, `instituteId`, `AttendanceSource.VIDEO`) and the scan context | Tasks 9 to 12 below write to those columns; this plan adds **no further Attendance migration** |

If any row is missing when a dependent task starts, stop and merge it first; do not re-implement it inside a Wave 1b PR.

### Decisions this plan relies on

| Id | Used by |
|---|---|
| D-IDENTITY-6 (status and role matrix, hand-over guard and payload), D-STRUCTURE-9 (hand-over mechanics minus the income share row) | Task 4 |
| D-IDENTITY-12 (staff-assisted registration, registration hardening), D-IDENTITY-1 (registration part) | Task 5 |
| D-IDENTITY-1 (stop NIC, purge, setup gate), F-29 | Task 6 |
| D-IDENTITY-4 (delete `Permission`) | Task 7 |
| D-IDENTITY-8 (role-shaped reads) | Task 8 |
| D-ACCESS-4 (random code scheme, reissue, `RetiredBarcode`), D-IDENTITY-10 (lost card, staff-verified contact change) | Task 9 |
| D-ACCESS-5 (one writer, strongest source wins) | Task 10 |
| D-ACCESS-3 (scan window, warn-never-block), D-OPS-3 (student-centric auto mode) | Task 11 |
| D-EXAMS-8 (teacher marking and voiding) | Task 12 |
| D-STRUCTURE-2 (front-desk powers, branch context) | Task 13 |
| D-STRUCTURE-5 (one archive rule), F-109 guards | Task 14 |
| Doc 16 drivers (`context/documents/16-local-development.md`) | Tasks 1, 2, 3 |
| Decided 2026-11-19 and not reopened: Express + Next, Organization = tenant, Institute = branch, PHYSICAL-only students lose live and recording access unless HYBRID | whole plan |

---

## Global constraints

Everything in the Wave 1 plan's "Global constraints" applies unchanged (branch off fresh `origin/dev`, Conventional Commit PR titles, squash-merge, delete the branch, no attribution lines, main checkout, only services import Prisma, `assertCourseAccess` on course-scoped reads and writes, `organizationId` + relation + index on every new model, additive migrations with one enum value per migration file, a scratch-database proof, actor x target matrices, frontend reads `frontend/AGENTS.md` first). Added here:

- **No new Attendance migration.** If a task below needs a column that Wave 1 Task 8 did not add, stop and amend Task 8's migration before it merges; do not add a second one.
- **Public repository.** Tasks marked "Security class" are written at defect-class level here. Do not paste the mechanism, the endpoint list or a line number into a PR description, commit message or doc; put it in the private notes.
- **Temporary secrets** (reissued codes are not secrets, passwords are): never cached, logged or audited with the value.
- **Self-lockout rules** (no actor can deactivate, re-role or reset themselves; the last active `SUPER_ADMIN` cannot be removed) are already enforced by Wave 0 / Wave 1 Task 2; Task 4 extends the same helper rather than adding another.
- **Idempotency.** New high-stakes `POST`s (hand-over, reissue, void, registration) use `checkIdempotency`; endpoints that return a one-time password are exempt from response caching (same rule as Wave 1 Task 2).

## Branch and PR slicing

One PR per task, in dependency order. "Depends on" lists tasks of this plan; Wave 1 and Wave 0 prerequisites are in the table above.

| Task | Branch | PR title | Actor | Closes | Effort | Depends on |
|---|---|---|---|---|---|---|
| 1 | `feature/local-video-driver` | `feat(drivers): add local video driver for offline recording flows` | developer | doc 16 row | M | none |
| 2 | `feature/payhere-mock-driver` | `feat(drivers): add PayHere mock checkout and signed notify driver` | developer | doc 16 row | M | none |
| 3 | `feature/clock-driver` | `feat(drivers): add a settable clock driver for month-boundary testing` | developer | doc 16 row | S | Wave 1 Task 1 |
| 4 | `feature/staff-status-and-handover-guard` | `feat(users): restrict staff status and role changes and require class hand-over` | owner, front desk | F-32, F-82, F-107, F-119 (UI half) | M | none |
| 5 | `feature/staff-assisted-registration` | `feat(users): register walk-in students at the front desk and harden self-registration` | front desk | F-33 | M | none |
| 6 | `feature/profile-complete-gate-and-nic-removal` | `feat(auth): stop collecting NIC photos and gate student actions on profile completeness` | student, owner | F-19, F-29, F-30 | M | 5 (guardian columns) |
| 7 | `chore/remove-permission-model` | `refactor(db): remove the unused Permission model` | developer | F-27 | S | none |
| 8 | `feature/role-shaped-user-reads` | `feat(users): return role-shaped user fields and audit full-record reads` | front desk, teacher | F-42, F-118 | M | Wave 1 Task 4 |
| 9 | `feature/lost-card-and-random-codes` | `feat(users): reissue lost cards with random codes and staff-verified contact changes` | front desk, owner | F-08, F-41, F-100 and the doc 17 item 11 and 12 settlement | M | Wave 1 Task 2 (revocation), 8 |
| 10 | `refactor/record-attendance-writer` | `refactor(attendance): route every attendance write through one precedence-aware writer` | all | F-14 (precedence), F-35 (source kept) | M | Wave 1 Task 8 |
| 11 | `feature/scan-window-and-auto-session` | `feat(attendance): add scan time window and student-centric session resolution` | front desk | F-43, F-114, F-37 (API half) | M | 3, 10 |
| 12 | `feature/teacher-attendance-and-void` | `feat(attendance): let owning teachers mark and void attendance with a correction window` | teacher, front desk | F-35 | M | 10 |
| 13 | `feature/front-desk-scheduling-limits` | `feat(timetable): limit front-desk scheduling and record the scan branch` | front desk, owner | F-105, F-116, F-37 (UI half) | M | 11 |
| 14 | `feature/course-archive-rule` | `feat(classes): one archive rule for courses, subjects and institutes` | owner, teacher | F-106, F-109 | M | none |

Lanes: Tasks 1, 2 and 3 share `drivers.ts`, `drivers.test.ts`, `env.ts`, `docker-compose.local.yml`, `.env.local.example` and doc 16, so build them in the order 3, 1, 2 (each PR extends `DriverSelection` and the existing `drivers.test.ts` cases). Tasks 4, 5, 8, 6 and 9 form one `user.service.ts` chain, merged in that order (Task 6 reads the guardian columns Task 5 adds). Tasks 10, 11, 12, 13 are another chain. Task 14 touches `class.service.ts` and `timetable.service.ts` that Task 4 also edits, so merge it after Task 4. Task 7 edits only the schema and docs but is merge-order sensitive.

---

## Settings registered by this wave

All keys are added to the Wave 1 registry (Zod type, default, range) and edited only by `SUPER_ADMIN`, audited. A missing row means the default.

| Key | Default | Used in |
|---|---|---|
| `identity.staffDeactivate.requireHandover` | true | 4 |
| `identity.handoverLookaheadDays` | 14 (1 to 60) | 4 |
| `handover.defaultEffectiveMonth` | NEXT (alt CURRENT; read by Wave 2 T31, registered now so the hand-over payload is stable) | 4 |
| `identity.register.perIpPerHour` / `identity.register.perPhonePerDay` | 60 / 5 | 5 |
| `identity.register.selfRegistrationEnabled` / `identity.register.requireMobile` / `identity.register.duplicateWarning` / `identity.register.captchaEnabled` | true / true / true / false | 5 |
| `identity.minorAgeYears` | 18 (13 to 21) | 5, 6 |
| `identity.collectNicPhotos` / `identity.nicNumberRequired` / `identity.nicPhotoPurge.mode` | false / false / REPORT_ONLY | 6 |
| `identity.requireGuardianForMinors` | true | 5, 6 |
| `identity.adminCanSeeAddress` / `identity.adminCanSearchNic` / `identity.auditFullRecordReads` | false / false / true | 8 |
| `attendance.code.acceptLegacyFormat` / `attendance.code.length` | true / 10 (8 to 16) | 9 |
| `identity.cardReissueFee` / `identity.contactChange.byStaffOnly` / `identity.notifyOldPhoneOnChange` | 0 / true / true | 9 |
| `attendance.frontDeskWindowHours` / `attendance.correctionWindowHours` / `attendance.excuseWindowDays` | 24 / 72 / 14 | 10, 12 |
| `attendance.excuse.frontDeskMay` / `attendance.teacherMayMark` / `attendance.voidReasonMinLength` | false / true / 3 | 10, 12 |
| `attendance.scan.opensBeforeStartMinutes` / `attendance.scan.lateAfterStartMinutes` / `attendance.scan.closesAfterEndMinutes` | 60 / 15 / 30 | 11 |
| `attendance.scan.autoMode` | true | 11 |

`attendance.scan.unpaidPolicy` and `attendance.scan.notEnrolledPolicy` already exist (Wave 1 Task 8); mode mismatch is always a warning.

## Migration map

| Migration (file `<timestamp>_name`) | Task | Content |
|---|---|---|
| `retired_barcode` | 9 | `RetiredBarcode` table (`barcode`, `userId`, `reason`, `retiredAt`, tenant columns) |
| `user_dob_guardian_columns` | 5 | interim `User.dateOfBirth?`, `User.guardianName?`, `User.guardianMobile?`, `User.guardianConsentAt?` (replaced by the Wave 2 T21 guardian table; see Task 5) |
| `user_home_institute` | 13 | `User.homeInstituteId?` (SetNull, indexed) |
| `class_session_cancelled` | 13 | `ClassSession.cancelledAt?`, `cancelReason?`, `cancelledById?` (Wave 2 T15 adds `closedDateId` on top) |
| `drop_permission` | 7 | drops `Permission` (refuses if any row exists) |
| `user_setup_flag_backfill` | 6 | data migration: `setupCompleted=true` for existing students |

No other Attendance, Enrollment or Payment migration is part of this wave. Enum additions (none in this wave) would each be alone in their own file.

---

## Task 1: Local video driver (`VIDEO_DRIVER`)

**Closes:** doc 16 "Video" row (Planned to Done). **Effort:** M. Not security class.

**Why now:** Wave 2 T7 (recording window), T16 (end-batch, alumni access) and T25 (recording attendance) cannot be verified offline without it, and M4 later wraps the same interface instead of redoing it.

**Files:**
- Modify: `backend/src/config/env.ts` (`VIDEO_DRIVER` enum `bunny | local`, default `bunny`), `backend/src/config/drivers.ts` (`VIDEO_DRIVERS`, `findLocalDrivers` lists `VIDEO_DRIVER=local`), `backend/src/config/drivers.test.ts`
- Modify: `backend/src/utils/bunny.ts` (selection happens **inside** the existing functions `createBunnyVideo`, `generateBunnyTusUpload`, `getSignedBunnyEmbedUrl`, `resolveBunnyWebhookStatus`, `verifyBunnyWebhookSignature` so `video.service.ts` and its tests do not change); new `backend/src/utils/local-video.ts` (local TUS-compatible upload target backed by the existing local storage driver, an `embed` URL pointing at a plain `<video>` page served by the backend in non-production, and a helper that posts the same webhook body Bunny posts)
- Modify: `docker-compose.local.yml` (set `VIDEO_DRIVER=local`), `backend/.env.local.example`, `context/documents/16-local-development.md` (matrix row, "No DRM" note, how to trigger the local "processed" webhook)
- Modify (frontend only if the embed player assumes a Bunny host): the recording player component; the local embed must render in the existing iframe without a code branch on hostname.

**Behaviour:** with `VIDEO_DRIVER=local` an upload creates a row `UPLOADING`, the browser uploads to the local target, and a developer-only script `npm run dev:finish-video <videoId>` posts the signed webhook so the row flips to `READY`, the same path production uses (completion is confirmed by the webhook, never by the client). The local embed URL carries a short-lived signed token that the backend verifies, so the **content gate is still exercised**: a student without coverage gets the same `402` as in production. There is **no DRM and no watermark enforcement**; the doc says so.

**Production refusal:** `env.ts` throws at boot when `NODE_ENV=production` and `VIDEO_DRIVER=local` (through `findLocalDrivers`, same message shape as storage and SMS).

**Vitest:** driver selection per function; refusal in production; local token verifies and expires; tampered token refused; webhook helper produces a body the existing verifier accepts; the default (`bunny`) path is byte-for-byte unchanged (snapshot of the URL builder).

**Live stack:** `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`, upload a recording as a teacher, run the finish script, watch it as an enrolled paid student, then as an unpaid student (402). **Rollback:** unset the variable; no schema change.

---

## Task 2: PayHere mock driver (`PAYHERE_DRIVER`)

**Closes:** doc 16 "Payments" row. **Effort:** M. Not security class, but it handles signing: the mock must be unusable in production.

**Why now:** Wave 2 T4 (per-mode amounts), T5 (duplicate and reversal notify) and T19 (bank slip beside the online channel) need a signed notify they can post at will; today only the PayHere sandbox with a public tunnel works.

**Files:**
- Modify: `backend/src/config/env.ts` (`PAYHERE_DRIVER` `payhere | mock`, default `payhere`), `backend/src/config/drivers.ts` and its test, `docker-compose.local.yml`, `backend/.env.local.example`, `context/documents/16-local-development.md`
- Modify: `backend/src/services/payment.service.ts` (the `baseUrl` block, lines ~170-206: with `PAYHERE_DRIVER=mock` use `<backend public origin>/api/dev/payhere` as the base so the existing `PAYHERE_CHECKOUT_PATH` suffix yields `/api/dev/payhere/pay/checkout`); `backend/src/utils/payhere.ts` is unchanged (its signing helpers are reused)
- New: `backend/src/routes/dev-payhere.routes.ts` (+ controller) mounted in `backend/src/index.ts` inside `bootstrap()` next to the other `app.use('/api/...')` lines (before `errorHandler`), guarded by `env.PAYHERE_DRIVER === 'mock' && env.NODE_ENV !== 'production'`; the page renders the order summary with plain HTML `<form method=post>` buttons (no inline script, because `helmet()` default CSP is on) for three outcomes (Succeed, Fail, Chargeback) that post the exact notify body PayHere would send (`status_code` 2, -2, -3) to the real `POST /api/payments/payhere/notify`, signed with the local merchant secret through the existing `generatePayhereSignature`
- New: `npm run dev:payhere-notify -- <orderId> <statusCode>` script for non-browser tests
- Modify: `backend/src/scripts/test-payments.ts` header comment

**Behaviour:** the notify handler is **not** changed and not given a mock branch; the mock only produces valid input for it. That is the point: it proves the real handler's signature check, amount check and idempotency on a laptop.

**Production refusal:** boot error when `NODE_ENV=production` and `PAYHERE_DRIVER=mock`; the dev router is also not mounted unless `NODE_ENV!==production` (two independent guards).

**Vitest:** refusal in production; dev router absent by default; mock notify is accepted by the real verifier; a notify with a wrong amount or tampered signature is refused; a replayed success is idempotent (one `Payment`); the three buttons map to the right status codes.

**Live stack:** start a PayHere checkout as a student, press Succeed, see the month paid and a recording unlock; press Succeed again (no second row); press Chargeback (today a no-op beyond logging; Wave 2 T5 gives it meaning, so record the current behaviour in the PR). **Rollback:** unset the variable.

---

## Task 3: Settable clock driver (`CLOCK_DRIVER`)

**Closes:** doc 16 new row. **Effort:** S. Not security class.

**Why now:** the grace-day rule, the Colombo month boundary, trial expiry, the end-of-batch window, the 1st-of-month fee roll and the notification quiet hours (Wave 2) cannot be tested by waiting.

**Files:**
- Modify: Wave 1 Task 1's org-time helper (`backend/src/utils/org-time.ts`): every "now" in billing, coverage, scan window and scheduling code goes through `getNow()`; a repo-wide search for `new Date()` in `backend/src/services` and `backend/src/worker.ts` is part of the PR, converting only those that decide a business outcome (audit timestamps and `createdAt` stay real time)
- Modify: `backend/src/config/env.ts` (`CLOCK_DRIVER` `system | offset`, default `system`), `backend/src/config/drivers.ts` and test, `docker-compose.local.yml`, doc 16
- New: `backend/src/scripts/dev-set-clock.ts` (`npm run dev:set-clock -- 2026-12-10T08:00:00+05:30` or `--reset`)

**Where the offset lives:** one Postgres row in a dev-only table is a schema change for a developer tool, so the offset is stored as an `OrganizationSetting` row (key `dev.clockOffsetMs`, writable only by `dev-set-clock.ts` and ignored when `CLOCK_DRIVER=system`), read through the settings service per request or job. The table exists after Wave 1 Task 1, so there is no schema change and **no Redis key**; the API and the worker always agree because both read the same row.

**Production refusal:** boot error when `NODE_ENV=production` and `CLOCK_DRIVER=offset`.

**Vitest:** `getNow()` equals system time by default; with an offset it moves; both the API and a worker-style call read the same offset; refusal in production; a Colombo month boundary case across the 10th and the 1st using the offset.

**Live stack:** set the clock to the 11th, scan an unpaid student (red, outside grace), set it back to the 9th (amber). **Rollback:** unset the variable.

---

## Task 4: Staff status and role matrix, and the class hand-over guard

**Closes:** F-32, F-82, F-107, F-119 (UI half). **Effort:** M. Security class: this is an actor-versus-target rule of the kind CLAUDE.md warns about; the actor x target matrix is mandatory. See companion for the original incident class.

**Files:**
- Modify: `backend/src/services/user.service.ts` (`updateStatus`, `updateRole`; new `listHandoverDependencies(userId)` shared with Wave 1 Task 16's `/console/setup` orphaned-classes panel (Task 16 calls it rather than re-implementing it); new `applyHandover(tx, ...)`), `backend/src/services/class.service.ts` (new `reassignCourseTeacher(tx, courseId, toTeacherId)` helper that also re-validates `subjectTeacher` links; this is the F-82 deadlock fix), `backend/src/services/timetable.service.ts` (conflict check helper; generation skips slots of deactivated teachers), `backend/src/routes/user.routes.ts`, `backend/src/schemas/user.schema.ts`, controllers
- Modify (frontend): `frontend/app/(app)/admin/users/_components/UsersTable.tsx` (role change asks for a reason and a confirmation, shows only the actions the viewer may use, SUPER_ADMIN is not a casual option; deactivate dialog lists the hand-over items), their tests

**Matrix (decision D-IDENTITY-6):**

| Actor | May change status of | May change role of |
|---|---|---|
| `ADMIN` | `STUDENT` only | nobody |
| `SUPER_ADMIN` | `TEACHER`, `MARKER`, `ADMIN`, `STUDENT`; another `SUPER_ADMIN` only through the Wave 0 owner-safety rules | `TEACHER`, `ADMIN`, `MARKER` among themselves, with a mandatory reason |
| anyone | nobody promotes a `STUDENT` to staff or demotes staff to `STUDENT` (create a staff account and deactivate the old one) | |

**Behaviour:** deactivating or re-roling a `TEACHER` who owns active or ended courses, sessions within `identity.handoverLookaheadDays`, open exams or marking assignments returns `409 TEACHER_HAS_CLASSES` with the structured list, unless the request carries `handover: [{courseId, toTeacherId}]` or `handoverAllTo: teacherId`. The hand-over runs **in the same transaction** as the status change: `Course.teacherId` changes at once (so `assertCourseAccess`, exams and marking follow), the new teacher's timetable is checked for slot conflicts (a `409` listing them), targets are validated as active `TEACHER`s of the same organization. A `MARKER` with open allocations on unpublished or unfinalised exams is refused with the list. Every deactivation writes an `AuditLog` row with the reason and revokes refresh tokens (`tokenVersion`), so the account is rejected at the next request. `handover.defaultEffectiveMonth` is accepted and stored in the audit metadata only; the income share row belongs to Wave 2 T31.

**Orphaned classes:** teachers deactivated before this PR who still own active courses are listed by `GET /users/orphaned-classes` (`SUPER_ADMIN`) with a one-click hand-over, and the generator skips their slots. Feeds the owner console panel of Wave 1 Task 16.

**Vitest:** actor x target x has-courses matrix (every cell); `ADMIN` -> `TEACHER` deactivate refused before the hand-over check (ordering); `ADMIN` -> `SUPER_ADMIN` refused; student promoted to staff refused; handover target inactive or a student refused; slot conflict reported and nothing changed (transaction); marker open allocation refused; double submit idempotent; not-found target 404; self-deactivation refused.

**Live stack:** as the front desk try to deactivate a teacher (refused, no buttons shown), as the owner deactivate one with a class (409 list), repeat with a hand-over and see the class, its sessions and the exam follow; confirm the old teacher's session is rejected on the next request. **Rollback:** revert; no migration.

---

## Task 5: Staff-assisted student registration and self-registration hardening

**Closes:** F-33 (and the registration half of D-IDENTITY-12). **Effort:** M. Security class (registration abuse and what the response reveals): defect-class only; see companion.

**Files:**
- Migration `user_dob_guardian_columns`: interim `User.dateOfBirth?`, `guardianName?`, `guardianMobile?`, `guardianConsentAt?`. **Scope call:** the full guardian record (several guardians, consent kinds, language) is Wave 2 T21; this task stores the single guardian the registration slip captures so that minors can be registered correctly today, and T21 migrates these four columns into the guardian table and drops them (the migration must copy before it drops).
- Modify: `backend/src/schemas/auth.schema.ts` (registration requires `dateOfBirth` and a mobile of the student or guardian in strict Sri Lankan form normalised to `+94`; a minor requires guardian name, guardian mobile and the consent tick; **no NIC field is accepted**), `backend/src/services/auth.service.ts` (`register` shares one `createStudentAccount` function with the new staff path; the response returns the minimal user shape), `backend/src/config/rate-limiter.ts` and `backend/src/routes/auth.routes.ts` (registration gets its own limiter bucket, separate from login, keyed per IP with a generous cap (`identity.register.perIpPerHour`) and per phone (`identity.register.perPhonePerDay`) so a class registering from one institute connection is not blocked while one phone cannot spawn many accounts)
- New: `POST /users/students` (`ADMIN`, `SUPER_ADMIN`; `backend/src/routes/user.routes.ts`, controller, `user.service.ts` `createStudentAsStaff`): name, date of birth, mobile or guardian mobile, optional email and school; issues the index number, the QR card code (random scheme from Task 9 once merged; until then the existing generator) and a temporary password shown once with a printable registration slip, `mustChangePassword=true`; a minor's guardian consent is recorded as `FRONT_DESK`; returns a "possible duplicate" warning (same phone and a similar name, `identity.register.duplicateWarning`) that the clerk can override with a reason; no automatic merge
- Modify (frontend): staff "Register student" screen with the print slip and card; public registration form (date of birth, mobile, guardian block for minors, no NIC); tests

**Behaviour:** two paths, one function. The staff path is the default at a cash institute (a walk-in is registered in under a minute and handed a card); public self-registration stays on while `identity.register.selfRegistrationEnabled` is true. Registration responses stay minimal. CAPTCHA is optional and off.

**Vitest:** age boundary (17 vs 18 years, with `identity.minorAgeYears` changed); minor without guardian refused; mobile normalisation (`07x`, `+947x`, spaces); NIC field rejected; duplicate warning and override; per-phone cap (siblings: 5 accounts then refused) vs per-IP cap; the one-time password is not in the response of a repeat call (`no-store`, exempt from idempotency caching, redacted in logs); actor matrix for the staff route (`TEACHER`, `MARKER`, `STUDENT` refused).

**Live stack:** register a minor at the front desk, print the slip, log in with the temporary password and be forced to change it (Wave 1 Task 2), then register a duplicate-phone sibling. **Rollback:** revert the PR; nullable columns stay unused.

---

## Task 6: Stop collecting NIC photos and make setup completeness a real, narrow gate

**Closes:** F-29, F-30. **Effort:** M. Security class (the account-setup gate is enforced only in the browser today): defect class only.

**Files:**
- Modify: `backend/src/services/auth.service.ts` (drop NIC fields from the register payload and from the `me` response; `nicFrontUploaded`/`nicBackUploaded` removed), `backend/src/services/user.service.ts` (`generateNicUploadUrl`, `confirmNicUpload` removed or gated by `identity.collectNicPhotos`, default false; when true they apply to adults only and require the reviewer view in the same PR)
- New: `backend/src/middleware/setup-completed.middleware.ts` (`requireSetupCompleted`), applied to **student** enrol, live-class token issue, recording token issue and exam sitting; **never on payment initiation** (a parent must always be able to pay) and never on read-only list routes
- New: `backend/src/scripts/purge-nic-photos.ts` (`REPORT_ONLY` by default: counts and a dry-run list of R2 keys, writes nothing; `--enforce` deletes the objects, nulls `nicFrontUrl` and `nicBackUrl`, and refuses to run unless a backup exists (the script checks the newest backup marker from `docker/backup`, see runbook 12) and the R2 delete permission has been confirmed with a harmless probe)
- Migration `user_setup_flag_backfill` (data only): `setupCompleted=true` for every existing student so nobody is locked out at launch; students without a date of birth are treated as minors for privacy and SMS and appear on a front-desk "missing details" filter
- Modify (frontend): remove the NIC steps of the account-setup wizard; the layout redirect stays as a convenience, no longer as the control; "Complete your profile" copy; tests

**Behaviour:** `setupCompleted` is a **profile-completeness flag computed on write**: true when the student has a mobile of their own or a guardian mobile and, for a minor, a guardian with consent (Task 5 columns now, the T21 guardian table later). The guard is narrow by design. The NIC number is optional, never requested from a minor, and only `SUPER_ADMIN` may record it.

**Vitest:** guard on each protected route for a complete and an incomplete student (`403 PROFILE_INCOMPLETE`); the payment route is explicitly tested as **not** gated; backfill marks existing rows; completeness recomputed when a mobile is added and when a minor gets a guardian; the purge script defaults to report-only and refuses `--enforce` without the backup marker.

**Live stack:** incomplete student: enrol blocked with a clear message, payment still works; complete the profile and retry; run the purge in report-only and read the count. **Rollback:** the guard is one middleware (remove from the routes); the purge is irreversible by design once enforced, so the PR description states the report-only count and that the enforce run is a separate, owner-approved action.

---

## Task 7: Remove the unused `Permission` model

**Closes:** F-27. **Effort:** S. Not security class.

**Files:** `backend/prisma/schema.prisma` (drop `model Permission` plus the `Organization.permissions` and `User.permission` back-relations), migration `drop_permission` with a guard that **refuses to run if any `Permission` row exists** (a `DO $$ ... RAISE EXCEPTION` block; historical migrations stay untouched). Nothing in `backend/src`, `frontend`, `tenant-integrity.ts` or `seed-demo.ts` references the model. Docs: `01-project-overview.md` (glossary), `02-architecture.md`, `08-database-design.md` (ER, section 4.2, access matrix), `14-multi-tenancy-readiness.md` (tenant-owned list), `15-requirements-traceability.md` R-USR-08, `17` section 9 item 10, `18` F-27, `README.md`.

**Behaviour:** authorization is the role plus resource and target guards (`assertCourseAccess`, `assertCanManagePrivilegedTarget`, and `assertSessionAccess` once Wave 2 T17 adds it) plus owner-set caps held in their own tables later (`TeacherMoneyLimit`, Wave 2 T30). If a real exception need appears, build a typed capability enum with one enforcement helper and a Vitest matrix at that time, not a free-form JSON column.

**Vitest:** tenant-integrity registry test green without the model; a test that the migration SQL contains the refusal guard.

**Live stack:** fresh deploy and upgrade on a scratch database; `npx tsx src/scripts/check-tenant-integrity.ts`. **Rollback:** re-adding is one migration; no data existed.

---

## Task 8: Role-shaped user reads and audited full-record reads

**Closes:** F-42, F-118 (and the field-level half of F-30). **Effort:** M. Security class (front-desk read scope broader than the daily job needs): defect class only.

**Files:**
- Modify: `backend/src/services/user.service.ts` (`selectForRole(role)` replaces the single `userSelect`; `listUsers` and `getUserById` take the caller's role; search by name, index number or phone for staff (email and barcode search stop being available to `ADMIN`); **NIC search only for `SUPER_ADMIN`** unless `identity.adminCanSearchNic`), `backend/src/controllers/user.controller.ts`, route wiring, `backend/src/services/audit.service.ts` (event `USER_RECORD_VIEWED` written for a `SUPER_ADMIN` full-record read and for any export when `identity.auditFullRecordReads`)
- Modify (frontend): the scanner's "Mark by name" and the cash desk's picker switch to `GET /users/lookup` (created in Wave 1 Task 4); the Users table renders only fields the API returns; tests

**Field matrix (decision D-IDENTITY-8), enforced in the service, not hidden in the UI:**

| Role | Sees |
|---|---|
| `SUPER_ADMIN` | the full record |
| `ADMIN` (front desk) | name, index number, profile photo, own mobile, guardian name and mobile, enrolled classes, fee status, an "is a minor" flag; **not** NIC, home address (unless `identity.adminCanSeeAddress`), date of birth, NIC photos, concession reasons |
| `TEACHER` | the class roster of Wave 1 Task 9 only (no phone, NIC, address, amounts) |
| `MARKER` | index number on scripts only |
| `STUDENT` | their own data |

No role other than `SUPER_ADMIN` reads guardian data beyond name and mobile.

**Vitest:** field-by-role matrix as a table test (every role x every field); `ADMIN` list/search/get never contain NIC or address (and do with the settings on); NIC search refused for `ADMIN`; `TEACHER` cannot call the user list at all; audit row written once per full-record read and not for list rows; not-found 404 unchanged.

**Live stack:** as the front desk search by name and by phone and confirm the response bodies contain none of the hidden fields (read the network tab); as the owner open a full record and see the audit row. **Rollback:** revert; select shapes are code only.

---

## Task 9: Lost card or phone, random scan codes, and staff-verified contact changes

**Closes:** F-08, F-41, F-100 and the code half of D-ACCESS-4. **Effort:** M. Security class (scan-code identity and re-issue): defect class only; the code mechanics are in the companion.

**Files:**
- Migration `retired_barcode`: `RetiredBarcode` (`barcode`, `userId`, `reason`, `retiredAt`, `organizationId`, relation, `@@unique([organizationId, barcode])`, `@@index([organizationId])`); a retired code is looked up by the resolver and is **never** reusable
- Modify: `backend/src/services/user.service.ts` (`reportLost(actor, studentId, reason)` and `generateMissingCodes()`; both use the existing uniqueness helper from Wave 0 under `withAdvisoryLock`), `backend/src/services/auth.service.ts` (the LMS code generator becomes a CSPRNG Crockford base32 string of `attendance.code.length` characters with no prefix; the index number stays printed beside the QR; the legacy sequential format is still accepted while `attendance.code.acceptLegacyFormat` is true and replaced lazily when a card is reissued, not by a forced reprint of every card), the Wave 0 `resolveStudentByCode` (checks `RetiredBarcode` after the live codes and returns a distinct `CARD_REPORTED_LOST` to staff only; nothing about other holders is ever revealed)
- New endpoints: `POST /users/:id/report-lost` (`ADMIN`, `SUPER_ADMIN`, `checkIdempotency`) with reason `LOST_CARD | LOST_PHONE | STOLEN | OTHER` and how identity was confirmed (as in Wave 1 Task 2's staff reset), which revokes the student's refresh tokens (`tokenVersion`), issues a new code, retires the old one, writes the audit row; `POST /users/generate-missing-codes` (`SUPER_ADMIN`, idempotent) with a printable A6 sheet; `PATCH /users/:id/contact` for staff phone changes: validated (Sri Lankan mobile regex, normalised to `+94`), audited, and an SMS notice goes to the **old** number (`identity.notifyOldPhoneOnChange`)
- Modify: `backend/src/services/profile.service.ts` and `backend/src/schemas/profile.schema.ts` (students can no longer self-edit a phone number while `identity.contactChange.byStaffOnly`; email changes stay self-service with password re-entry and the existing cooldown)
- Modify: the existing `PATCH /users/:id/barcode` (`assignBarcode`, open to `SUPER_ADMIN` and `ADMIN`, with an inline editor in `UsersTable`) would bypass retiring the old code, revoking sessions and auditing, so `assignBarcode` retires the previous code into `RetiredBarcode` (covering `User.barcode` and `StudentBarcode.barcode`) and revokes sessions, or the route is removed in favour of `report-lost`.
- Modify (frontend): "Report lost card or phone" dialog on student rows; scanner and cash desk show a staff-only red "Card reported lost, ask for ID" for a retired code instead of "not found"; replacement card print; profile page removes the phone field with an explanation

**Behaviour:** a card or phone is lost every month at this size, and a static code is a proxy-attendance and fee-fraud risk, so a reissue must kill the old code and the old sessions at once. The reissue fee is a counter matter (`identity.cardReissueFee = 0`, no ledger entry in v1). No device limit.

**Vitest:** reissue revokes tokens (the next request with the old access token fails), retired code returns the lost-card state to staff and `404` shape to everyone else, generated codes are unique, base32 alphabet only, correct length, legacy accepted and then refused when the setting is false, concurrent reissue and concurrent generate (simulated two writers; one wins, no duplicate), phone regex and normalisation, old-number SMS sent through the log driver, student self-edit of phone refused, `TEACHER` and `MARKER` refused on every endpoint.

**Live stack:** scan a student's card, report it lost, scan again (red lost-card state), scan the new card (accepted), watch the old browser session end. **Rollback:** revert the PR; `RetiredBarcode` rows stay (additive); legacy codes keep working throughout.

---

## Task 10: One attendance writer with source precedence

**Closes:** F-14 (precedence half), F-35 (source kept). **Effort:** M. Not security class by itself; it removes an overwrite that corrupts evidence.

**Files:**
- New: `backend/src/services/attendance-writer.service.ts` exporting `recordAttendance(tx, input)`; modify `backend/src/services/attendance.service.ts` (`scanBarcode`, `markManualAttendance`, `handleZoomWebhook`, `markVideoAttendance` all call it), `backend/src/services/attendance-reconciliation.service.ts` (its writes go through it), unit tests

**Rule (decision D-ACCESS-5):** exactly one row per student per session (the existing unique). Precedence among automatic writers is fixed in code: entrance scan (`QR`/`BARCODE`) beats live join (`ZOOM_WEBHOOK`) beats recording watch (`VIDEO`); a lower writer never replaces a higher one and only refreshes `lastSeenAt`. A row touched by staff carries `markedById` and is locked against automatic writers. A staff edit changes status and `markedById` but **never the original source** (the audit row holds the history). `PRESENT` and `LATE` count as attended; `PARTIAL` and `EXCUSED` count as neither attended nor unexplained absence until staff act. The helper applies the snapshot columns of Wave 1 Task 8 and writes one `AuditLog` row; voided rows are ignored by every read, count and reconcile.

**Also in this task:** `markManualAttendance(input, actor)` and its controller and route pass `req.user` and set `markedById`; `markVideoAttendance` keeps writing `ZOOM_WEBHOOK` through the helper (no behaviour change; switching it to `VIDEO` is Wave 2 T25); the reconciliation bulk insert (`createMany`) becomes a loop over `recordAttendance` inside one transaction; an automatic write onto a voided row only refreshes `lastSeenAt` and never reinstates (only a staff mark reinstates, Task 12); `scannedAt` on `MANUAL` rows is the time of the first write, not a door scan.

**Who may write what** (enforced here and re-checked at the service entry points): owning `TEACHER` and `SUPER_ADMIN` any status; front desk only `PRESENT`/`LATE` within `attendance.frontDeskWindowHours` after the scan window closes (and `EXCUSED` only when `attendance.excuse.frontDeskMay`); a session substitute for that session only (Wave 2 T17).

**Vitest:** precedence matrix (3 automatic sources x existing row source x staff lock); staff edit keeps the source; repeat scan keeps the snapshot and only refreshes `lastSeenAt`; recording watch does not count for a non-online enrollment (the mode rule is finished in Wave 2 T25, here only the helper's input is tested); concurrent writes to the same key (unique race resolved by upsert); voided row is invisible to reads; audit row per write.

**Live stack:** scan a student, post a Zoom join for the same student (row unchanged except `lastSeenAt`), mark them `EXCUSED` as the owner and scan again (locked). **Rollback:** revert; no schema change.

---

## Task 11: Scan time window and student-centric session resolution

**Closes:** F-43, F-114, F-37 (API half). **Effort:** M. Not security class.

**Files:**
- Modify: `backend/src/services/attendance.service.ts` (`classSessionId` becomes optional in `scanBarcodeSchema` (`attendance.schema.ts`, required today); `instituteId` is already required and already checked against the slot's institute), `backend/src/schemas/attendance.schema.ts`, `backend/src/controllers/attendance.controller.ts`, `backend/src/services/class-session.service.ts` (sessions expose their institute through the slot until Wave 2 T12 puts it on the session), tests
- Modify (frontend): `StaffScanner.tsx` (branch selector defaulting to the last-used branch (`localStorage`, wrapped in try/catch; Task 13 switches the default to `User.homeInstituteId`), auto/manual toggle, a short picker limited to the student's own sessions, today's sessions at the selected branch including online sessions of courses homed there), `frontend/lib/attendance.ts`, tests

**Behaviour (D-ACCESS-3, D-OPS-3):**
- Window: opens `attendance.scan.opensBeforeStartMinutes` before start, `LATE` after `attendance.scan.lateAfterStartMinutes`, closes `attendance.scan.closesAfterEndMinutes` after the end. Outside it the scan is refused (nothing written) with `409 SCAN_WINDOW_CLOSED`; only `SUPER_ADMIN` may override, with a mandatory reason that is audited. A forgotten scan is otherwise fixed by a manual mark (Task 12).
- Auto mode (`attendance.scan.autoMode`, default true): resolve the **student** first (Wave 0 resolver), then find the student's active enrollments whose sessions at the selected branch have an open window today. Exactly one open session is credited automatically; more than one (two classes at the same hour) returns `409 SESSION_CHOICE_REQUIRED` with the student's own candidates; none returns `404 NO_OPEN_SESSION_HERE` with the Enrol link and writes nothing. Manual session pick stays as a toggle; a student not enrolled in the picked session is recorded with `NOT_ENROLLED` as in Wave 1 Task 8.
- Warn-and-record rules, snapshots and the structural refusals are unchanged from Wave 1 Task 8; check ordering is **structural refusal, then window, then session resolution, then warnings**. All "now" reads use the clock driver (Task 3) so the window is testable.

**Vitest:** window edges (exactly at open, at `LATE`, at close, one minute after, Colombo midnight), override by owner with and without a reason, override by front desk refused; one, two and zero matching sessions; manual override; other branch's session not offered; online session of a course homed at the branch is offered; ordering (ambiguous code refused before the window is evaluated).

**Live stack:** with the clock driver at 14:50, 15:20 and 17:40 scan a student for a 15:00 to 16:00 class; run two parallel classes at 15:00 and confirm the picker shows only the scanned student's own. **Rollback:** revert; the settings are inert.

---

## Task 12: Teacher attendance marking, void, and the correction window

**Closes:** F-35. **Effort:** M. Security class (a new teacher write): the actor x target matrix is mandatory; see companion.

**Files:**
- Modify: `backend/src/services/attendance.service.ts` (`markManualAttendance` gains the actor, `assertCourseAccess` on `session.courseId`, an enrollment check for a `STUDENT` target, no source overwrite via Task 10; new `voidAttendance`), `backend/src/routes/attendance.routes.ts` (`POST /attendance/manual` adds `TEACHER`; new `POST /attendance/:id/void` with `checkIdempotency`), `backend/src/schemas/attendance.schema.ts`, every attendance read adds `voidedAt: null`, tests
- Modify (frontend): the roster of Wave 1 Task 9 gets Present, Late, Excused and Undo toggles; `StaffScanner` gets Undo for `ADMIN` within `attendance.frontDeskWindowHours`; tests

**Behaviour (D-EXAMS-8, D-ACCESS-5):** the owning `TEACHER` and `SUPER_ADMIN` may mark a student present on a session of their course; a `TEACHER` target must hold an active enrollment. Rows are never deleted: void sets `voidedAt`, `voidedById`, `voidReason` (minimum `attendance.voidReasonMinLength` characters). Void is allowed for the owning teacher within `attendance.correctionWindowHours` of the session start, for the front desk within `attendance.frontDeskWindowHours`, for `SUPER_ADMIN` any time. A manual mark on a voided row **reinstates** it with an audit row; on an existing non-voided row it changes the status but not the source. `EXCUSED` is allowed for the teacher within `attendance.excuseWindowDays`. `attendance.teacherMayMark=false` returns `403` for teachers (the owner's switch back to today's rule).

**Vitest:** actor x target matrix (owning teacher, other teacher, owner, front desk, marker, student; own course vs other course); window edges per role; non-enrolled student target refused; source preserved; voided excluded from reads, counts and absence; reinstatement; double void idempotent; not-found session or row 404; reason too short 422; ordering (course access before the window check, so a foreign teacher learns nothing about timing).

**Live stack:** as the teacher mark a late student, void a wrong scan, reinstate it, try another teacher's class (403), try after the window as the teacher (refused) and as the owner (allowed). **Rollback:** revert; `attendance.teacherMayMark=false` restores the old behaviour without a revert.

---

## Task 13: Front-desk scheduling limits, home branch, and the branch recorded at the door

**Closes:** F-105, F-116, F-37 (UI half). **Effort:** M. Security class (a role list narrowing and a branch check): defect class only.

**Files:**
- Migrations `user_home_institute` and `class_session_cancelled`
- Modify: `backend/src/routes/timetable.routes.ts` (the five `requireRole(SUPER_ADMIN, TEACHER, ADMIN)` routes in `timetable.routes.ts` (slot create, update, delete, generate preview and generate) and the three class-session routes in `class-session.routes.ts` (`POST /`, `PATCH /:sessionId`, `DELETE /:sessionId`) lose `ADMIN`; `ADMIN` keeps reads and gets the reasoned cancel and restore only. A cancelled session stays visible and flagged; delete remains owner and owning teacher only), `backend/src/services/class-session.service.ts` and `backend/src/routes/class-session.routes.ts` (new `cancelClassSession` and `restoreClassSession` for `ADMIN`, `SUPER_ADMIN` and the owning `TEACHER`, a mandatory reason, org-wide, audit-logged, an in-app notice to the owning teacher through the existing notification service with an **existing** notification type; if none fits, the notice waits for Wave 2 T15's `SESSION_CANCELLED`), `backend/src/services/attendance.service.ts` (the scan and manual paths share one branch assertion; both record `Attendance.instituteId`; the check **keeps reading the slot's institute** until Wave 2 T12 puts the institute on the session), `backend/src/services/user.service.ts` (`homeInstituteId` set by `SUPER_ADMIN` only)
- Modify (frontend): `TimetableManager.tsx` hides edit actions from the front desk; `StaffScanner.tsx` and the cash desk default the branch to the user's home branch; Cancel and Restore buttons with a reason prompt; tests

**Behaviour (D-STRUCTURE-2):** scheduling is a teacher and owner job; a front-desk clerk still cannot create a class. The one scheduling power they keep is cancelling or restoring a single session (mandatory reason). Front desk is **not** hard-scoped to a branch in this phase: `homeInstituteId` is only a default (scanner branch, collection branch, session filter), never a security boundary. The future `staff.branchScoping` setting is the revisit trigger and is not built. Wave 2 T15 later adds closed dates and `closedDateId` on top of the three cancellation columns added here, and T15's text is amended accordingly.

**Vitest:** actor x action matrix (each of the five routes x each role, plus cancel and restore per role and per ownership); manual attendance with a wrong-branch session refused like the scan; both record the branch; cancelled session excluded from the scan and from absence; restoring requires the same actors; mandatory reason; not-found 404.

**Live stack:** as the front desk try to edit a timetable slot (403 and no button), cancel a session with a reason and see the teacher's notice, scan at the wrong branch (refused), scan at the right one and read `instituteId` in `psql`. **Rollback:** the route narrowing is one line per route; the nullable columns are unused by old code.

---

## Task 14: One archive rule for courses, subjects and institutes

**Closes:** F-106, F-109. **Effort:** M. Not security class (but it stops live content being served for an archived course; the gate matrix is the proof).

**Files:**
- Modify: `backend/src/services/access.service.ts` (`findActiveEnrollment` and every enrollment select gain `course: { isActive: true }`), `backend/src/services/timetable.service.ts` (`generateSessions`, `previewGeneration`, `sessionScope`, `slotScope`), `backend/src/services/enrollment.service.ts`, `backend/src/services/live-class.service.ts`, `backend/src/services/video.service.ts`, `backend/src/services/exam.service.ts` (no sittings for an archived course), `backend/src/services/payment.service.ts` (due and outstanding queries ignore archived courses; the `c.isActive` join condition is missing today), `backend/src/services/class.service.ts` (list `includeInactive` for `SUPER_ADMIN` and the owning `TEACHER`; archive guard), `backend/src/services/subject.service.ts` (deactivation refused while active courses exist: `409` with the count) and `institute.service.ts` (refused while active timetable slots or exam audiences reference it: `409` with counts; courses are not linked to institutes until Wave 2 D-STRUCTURE-1), routes, schemas, tests
- New: `backend/src/scripts/report-archived-with-enrollments.ts` (one-time report of inactive courses that still have active enrollments, run before the PR is merged and quoted in the PR description)
- Modify (frontend): archived badge, "Show archived" toggle, an Undo for the teacher's own archive action; tests

**Behaviour (D-STRUCTURE-5):** a course has three states from two fields: `ACTIVE` (`isActive` true, `endedOn` null), `ENDED` (`isActive` true, `endedOn` set, Wave 2 T16) and `ARCHIVED` (`isActive` false). **Archived means gone from the student world**: hidden from every student list and detail, no sessions generated, excluded from every unpaid or due query, no live tokens, no recording streams, no new enrolments, no exam sittings. Enrollments and payments are untouched, so un-archiving restores everything. Archive is allowed for `SUPER_ADMIN` and the owning `TEACHER` only when the course has no active enrollments or is `ENDED`; otherwise `409 COURSE_HAS_ACTIVE_ENROLLMENTS` with the count (the fix is to end the batch first; until Wave 2 T16 ships "end the batch" the owner cancels the enrollments through the existing screens). Un-archive by `SUPER_ADMIN` and the owning `TEACHER`.

**Vitest:** one test per gate path for a student, the owning teacher and the owner (access, generator, live token, recording stream, enrol, sitting, due and outstanding); archive refused with enrollments, allowed without; un-archive restores access; subject and institute guards with counts; `includeInactive` refused for a student.

**Live stack:** archive a class with no students, see it disappear from the student list and the due totals, un-archive and see it return; try to archive one with students (409 and the count). **Rollback:** revert; no schema change.

---

## Deferred (decided, not in this wave)

- Live attendance reconcile and recording attendance (`VIDEO` writes, Wave 2 T24 and T25), absence SMS and quiet hours (T23), guardian records and consent beyond the interim columns (T21), closed dates (T15), branch and rooms on the session (T12, T13 residual), end-batch (T16), substitutes (T17), the random-QR **switch-off** of the legacy format (an owner action once cards are reissued; target end of the next academic year).
- Self-service SMS password reset for students (`identity.selfServiceReset.enabled`): stays off until phone changes are verified; its `OneTimeCode` table belongs to the identity part of Wave 2.
- Rotating in-app QR codes: rejected for now (needs working data on weak phones).

## Definition of Done

For each task:
- [ ] Branch is off fresh `origin/dev`, one cohesive PR, Conventional Commit title, no attribution lines, squash-merged, branch deleted.
- [ ] Backend `npm run test`, `npm run lint`, `npm run build` green; frontend `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` green; `npx tsx src/scripts/check-tenant-integrity.ts` green.
- [ ] Actor x target matrix, not-found cases and a check-ordering case exist for every new guard.
- [ ] Live-stack pass on the local overlay (`docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`) with `docker compose logs backend --tail 200` free of new errors; phone width checked for every new screen.
- [ ] Migrations proven fresh and upgrade on a scratch database, expand only, rollback written in the PR; **no Attendance migration** beyond Wave 1 Task 8.
- [ ] Every numeric default is a registry setting with a range; every local driver is refused when `NODE_ENV=production` and listed in `drivers.test.ts`.
- [ ] No response, log line, audit row or SMS contains a one-time secret; the role matrix in the PR description states that no role can reach data or actions it could not before except as listed.
- [ ] Docs below updated **in the same PR**.

For the wave: all 14 PRs merged; doc 18 shows each closed F-id as `Fixed (#<pr>, vX.Y.Z)`; a live-stack walk-through (front desk registers a walk-in, scans at the right and wrong branch and window, reissues a lost card; teacher marks and voids; owner hands over a leaving teacher's class; owner archives a class) is recorded in the progress tracker with the SHA and image tag.

## Docs to update (same PR as the code)

| Doc | Update | Task |
|---|---|---|
| `context/documents/16-local-development.md` | video, PayHere and clock rows to Done; "No DRM" note; how to trigger the local webhook, notify and clock | 1, 2, 3 |
| `context/documents/18-flow-audit-findings-register.md` | status column for each closed F-id | all |
| `context/documents/17-roles-permissions-and-flows.md` | section 7 Wave 1 status; sections 5 and 9 where the rule is now code (status matrix, field matrix, scan window, front-desk scheduling) | 4, 8, 11, 12, 13 |
| `context/documents/15-requirements-traceability.md` | attendance, user-management and registration rows | 4, 5, 6, 8, 9, 10 to 14 |
| `context/documents/06-progress-tracker.md` | base SHA and per-PR evidence | all |
| `context/documents/08-database-design.md` | `RetiredBarcode`, `User.homeInstituteId`, interim guardian columns, `ClassSession.cancelled*`, `Permission` removed | 5, 7, 9, 13 |
| `context/documents/01-project-overview.md` | glossary: "Permission" removed; setup completeness definition | 6, 7 |
| `context/documents/14-multi-tenancy-readiness.md` | tenant-owned table list (`RetiredBarcode`) | 9 |
| `context/documents/10-maintenance-guide.md` | NIC purge runbook, card reissue, hand-over | 4, 6, 9 |
| `context/api_endpoints/users.endpoints.md` | `POST /users/students`, `report-lost`, `generate-missing-codes`, `PATCH /users/:id/contact`, `orphaned-classes`, hand-over payload, `TEACHER_HAS_CLASSES`, role-shaped fields | 4, 5, 8, 9 |
| `context/api_endpoints/auth.endpoints.md` | registration fields, no NIC, rate-limit bucket, `PROFILE_INCOMPLETE` | 5, 6 |
| `context/api_endpoints/attendance.endpoints.md` | window, auto mode, `SESSION_CHOICE_REQUIRED`, `NO_OPEN_SESSION_HERE`, void, manual for teachers, precedence | 10, 11, 12 |
| `context/api_endpoints/timetable.endpoints.md`, `class-session` section of `classes.endpoints.md` | role lists, cancel and restore | 13 |
| `context/api_endpoints/classes.endpoints.md`, `subjects`, `institutes` docs | archive rule, `includeInactive`, `409` counts | 14 |
| `context/api_endpoints/video.endpoints.md`, `payments.endpoints.md` | local drivers note | 1, 2 |
| `docs/superpowers/plans/2026-11-20-wave-2-access-coherence-and-delivery-order.md` | T15 files: `cancelledAt`, `cancelReason`, `cancelledById` already exist (Task 13), T21 migrates the interim guardian columns (Task 5), T12 inherits the branch check (Task 13) | 5, 13 |
| `CLAUDE.md` | one line: attendance has one writer with source precedence; front desk cannot edit timetables; `ARCHIVED` means gone from the student world; local drivers include video, PayHere and clock | 1, 10, 13, 14 |

## Plan Self-Review

- **Coverage:** every item the sequencing assigns to W1-S2 (D-IDENTITY-6, -12, -1, -4, -8, -10, F-29), W1-S3 (the writer, scan policy, student-centric mode, teacher marking and voiding, front-desk limits) and the remaining W1-S4 items (D-STRUCTURE-5, F-106, F-107, F-109, D-STRUCTURE-9 mechanics) and the drivers D-video, D1 and D3 maps to a task above. D-IDENTITY-5 and -7 are in Wave 0 and Wave 1 Tasks 2 and 3. The Attendance migration and the entrance-scan context are Wave 1 Task 8.
- **Safety:** no task widens what a role can read or move except through an explicit guard and matrix; the two that add a write for a role (teacher attendance, front-desk cancel) are bounded by `assertCourseAccess`, enrollment checks, correction windows and a setting that switches them off; security-class mechanics stay in the private companion.
- **Conflicts found while planning** (resolved above): the front desk is told to keep a cancel power (D-STRUCTURE-2) while the cancellation model belongs to Wave 2 T15 (Task 13 adds the three columns and T15 builds on them); registration needs a guardian before the guardian table exists (Task 5 stores one guardian in interim columns that T21 migrates and drops); the clock driver needs shared state but the API must stay stateless (Task 3 stores the offset in an `OrganizationSetting` row, no Redis key); the Attendance migration must be single (Task 8 owns it, no task here adds a column); Task 6 reads the guardian columns that Task 5 adds, so 5 merges first (Task 5 already removes the NIC field from registration, Task 6 removes the rest).
