# Wave 2: Access Coherence and the Master Delivery Order

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Read the task you are on, not the whole file. Frontend work: read `frontend/AGENTS.md` and the installed Next.js docs first.

**Goal:** Put every piece of work decided on 2026-11-19/20 in one order that a single small team can ship against a live institute (~1,200 students), and specify Wave 2 in enough detail to start: one content gate that knows mode and payment, a branch dimension, a money ledger with explicit fee, concession, chargeback and enrollment-lifecycle rules, guardian contact for minors, and bounded teacher authority over money and late work. Waves 0-1 and M2-M7 are sequenced here but specified in their own plans; Wave 3 is an outline.

**Status 2026-11-20.** Planned, nothing implemented. Written against `dev` at M1 (`Organization` and nullable `organizationId` exist; scoped client, JWT context and `NOT NULL` do not). Names below were verified by grep on this date; items that the decision set calls by another name are listed in the "Name corrections" table.

**Companion file.** Security-class and access-leak mechanisms (exact endpoints, lines, reproduction-level detail) are deliberately not in this public repository. They are in a private copy of this plan with the same file name, kept in the `plans/` directory of the private audit folder next to the audit notes (the private copy holds the exploit-level detail for every **[PRIVATE-DETAIL]** section; the public text stays at defect-class level). Tasks here mark such work **[PRIVATE-DETAIL]** and describe it only at the defect-class level used in `context/documents/18-flow-audit-findings-register.md`.

## Preconditions

Decisions this plan relies on (ids are the owner-decision ids of 2026-11-19/20; the decision text is not restated here, read it before the task that cites it). Not to be reopened: Express + Next, Organization = tenant and Institute = branch, HYBRID enrollment, three payment channels, PHYSICAL-only students lose live and recording access unless HYBRID or `onlineForPhysical`.

| Group | Decisions |
|---|---|
| Money | D-MONEY-1 to D-MONEY-10 |
| Access and attendance | D-ACCESS-1 to D-ACCESS-9 |
| Exams | D-EXAMS-1 to D-EXAMS-11 (Wave 2 uses 4, 5, 6, 10; 11 is the settings home of the exam cluster) |
| Identity | D-IDENTITY-1 to D-IDENTITY-13 (Wave 2 uses 2, 3, 9, 11; 5-8, 10, 12 are Wave 1; 13 gates M4-M7) |
| Structure | D-STRUCTURE-1 to D-STRUCTURE-10 |
| Operations | D-OPS-1 to D-OPS-4 |

Technical preconditions, each checked before a task starts:

1. **M3 merged** for every Wave 2 task: `organizationId` is `NOT NULL`, services use the scoped client, per-organization uniques are in place. Every new model therefore declares `organizationId String` (required), `organization Organization @relation(... onDelete: Restrict)` and `@@index([organizationId])`, the back-relation array on `Organization`, and any composite unique starts with `organizationId` (single-column keys such as `activeKey`, `reversalKey` and `approvedReferenceKey` are globally unique by construction: UUID-derived or prefixed with the organization id, and `activeKey` is built as `organizationId:userId:courseId` rather than the spec's `userId:courseId`). Do not copy the nullable-with-default M1 pattern. `backend/src/utils/tenant-integrity.test.ts` and `backend/src/scripts/check-tenant-integrity.ts` must stay green.
2. **Wave 1 step 1 merged** (needed by almost every task here): `OrganizationSetting` and its typed registry (D-MONEY-10), the organization-timezone helper replacing `getCurrentPaymentMonth` (`backend/src/services/access.service.ts`), `withAdvisoryLock`, the simple `isStudentCovered` (D-ACCESS-1), per-request user lookup with `tokenVersion` (F-15).
3. **Wave 1 step 3 merged** for the attendance tasks: the single Attendance migration (status, markedById, void columns, snapshots, `instituteId`, `AttendanceSource.VIDEO`) and `recordAttendance`.
4. Doc 16 drivers: storage and SMS are Done; the video, PayHere and clock drivers (D-video, D1, D3) land in Wave 1 as Tasks 1 to 3 of [Wave 1b](./2026-11-20-wave-1b-identity-attendance-structure-and-drivers.md); **the Zoom driver (D2) is still Planned** and is scheduled in W2c because T17, T18 and T24 cannot be verified end to end without it.

## Master delivery order

Read top to bottom. A row may start when everything in its "Blocked by" column is merged. "Drivers" is the local-stand-in state (`context/documents/16-local-development.md`); "Frontend" is the alignment that ships in the same PR as the backend change (separate frontend PR only where noted).

| Step | Contents (decision ids) | Blocked by | Drivers | Frontend alignment |
|---|---|---|---|---|
| **W0** | F-01 session lifetime; D-ACCESS-8 recording stream, metadata and list restricted (F-04, F-06); F-09 attendance read scoping; F-54 Zoom webhook hardening; F-55 production boot check; F-02 SSR traffic out of the per-IP limiter; D-ACCESS-4 slice (single resolver, collision report, write-time uniqueness; no new QR scheme); D-IDENTITY-5 `seed-admin` create-only and owner invariants (defect class: see doc 18 rows F-04, F-06, F-09, F-16, F-54). **Proposed additions (not placed by the sequencing):** F-16 stream audience filtering (S); F-69 scoped-exam visibility moves to W1 step 4 beside D-EXAMS-3. **[PRIVATE-DETAIL]** | none | storage, SMS done | proxy/refresh single-flight in `frontend/lib/api.ts` (F-01) |
| **W1-S1** Foundations (D-video is Wave 1b Task 1) | `OrganizationSetting` + registry, org-time helper, simple `isStudentCovered` (`withAdvisoryLock` ships in Wave 0 Task 4) (D-MONEY-10, D-ACCESS-1, F-18); F-15 revocation; local video driver | W0 | **D-video** (`VIDEO_DRIVER`, refused in production) | replace UTC month in `frontend/lib/payhere.ts:12` and the month default in the payments pages with the server-derived month; Access rules settings page |
| **W1-S2** Identity safety ([Wave 1b](./2026-11-20-wave-1b-identity-attendance-structure-and-drivers.md) Tasks 4 to 9) | D-IDENTITY-6 guard + handover mechanics (D-STRUCTURE-9, minus the share row), -7 staff creation and reset (Wave 1 Tasks 2 and 3), -12 staff registration, -1 stop NIC (purge REPORT_ONLY), F-29 gate (never on payment), -4 delete `Permission`, -8 field reads, -10 lost card with D-ACCESS-4 random codes | W1-S1 | - | `UsersTable.tsx` confirmations, staff creation form, register-student screen, lost-card dialog |
| **W1-S3** Attendance ([Wave 1b](./2026-11-20-wave-1b-identity-attendance-structure-and-drivers.md) Tasks 10 to 13; the Attendance migration and scan context are Wave 1 Task 8) | single Attendance migration, D-ACCESS-5 writer, D-ACCESS-3 scan policy + D-OPS-3, D-EXAMS-8, D-STRUCTURE-2 (role removal, front-desk cancel, `homeInstituteId`, branch recorded; **branch check still reads the slot institute**) | W1-S2 | - | `StaffScanner.tsx` banners and photo, roster Present/Undo |
| **W1-S4** Teacher and money visibility (D-STRUCTURE-5, F-106 and F-109 are Wave 1b Task 14; the rest is the Wave 1 plan) | D-EXAMS-1, -2, -3 (+F-69, F-22), -7; D-OPS-1 who-owes, cash tally, bulk guard (F-10, F-77, F-58); D-STRUCTURE-7 (F-104), -5 and F-109 guards; F-127 owner console grows panel by panel | W1-S1 (Tasks 9 and 16 of Wave 1 also need Wave 1 Task 8) | **D1 PayHere mock driver** (`PAYHERE_DRIVER`, signed notify; Wave 1b Task 2) and **D3 clock driver** (`CLOCK_DRIVER`, Wave 1b Task 3) | `CollectPayment.tsx`, `AdminPayments.tsx`, `TimetableManager.tsx`, exams pages |
| **M2 + M3** (freeze, 1-2 weeks) | scoped Prisma client, JWT/`AuthenticatedUser` `organizationId`, registry test, `NOT NULL`, uniques swapped (doc 14 §11). Only hotfixes merge; no feature adds tables | Wave 0 and Wave 1 done, at least F-11, F-10, F-83, F-67 | - | none |
| **W2a** One enrollment migration | T1 interim guard (can pull forward), T2 HYBRID enum + expand columns, T3 merge, contract and eligibility helper | M3 | - | `EnrollPanel.tsx` shows three modes, `lib/types.ts` ClassType |
| **W2b** Money core and the single gate | T4 `computeMonthFee`/`CourseFee`; T5 REVERSAL and duplicate PayHere; T6 coverage function + `AccessException` + mode rule; T7 recording window, exams flag, locked-recording reasons; T8 proration, reactivation, mode change, `fee-month-roll`; T9 trials and advance month; T10 concessions | W2a (T3) for T6+; T4 needs D1 | D1 | payment pages show list fee, concession, grace; class page paid state (F-84, F-85, F-88); `CollectPayment.tsx:128` switches from `createdAt` to `activatedAt` |
| **W2c** Structure | **D2 Zoom mock driver** (`ZOOM_DRIVER`; added); T11 course attributes and capacity; T12 branch and rooms; T13 branch residual (scanner, sessions); T14 enrollment lifecycle; T15 calendar and cancellation; T16 end-batch and rollover (needs T7); T17 substitutes; T18 Zoom concurrency | W2b (T6, T7 for T16); T12 before T13; D2 before T17, T18 | D2 | class form fields, location display, Calendar page, leaving-requests list |
| **W2d** Bank slip | T19 `PaymentSlip` channel (D-MONEY-6) | T4, T5, T6, and W1-S4 cash visibility | D1 | student upload form, staff "Pending slips" queue |
| **W2e** Identity and communication | T20 remove `sendResultsSms`; T21 guardian, date of birth, consent; T22 SMS recipients, languages, budget; T23 event catalogue and schedulers; T24 live reconcile; T25 recording attendance; T26 exam publish, unpublish and late work; T27 ranks and progress; T28 retention and erasure; T29 teacher exit checklist | T2/T3 (mode eligibility), W1-S3 (T24, T25), T21 before T22, T22 before T23 (enum values land in T22), T26 after T22 | D2 (T24) | guardian panel, results copy, reconcile panel minutes + Accept |
| **W2f** Teacher money | T30 `PaymentRequest` + caps; T31 shares and statements | T4, T10, T14 (T30); T30 and T14 (T31) | - | teacher "Request" screens, owner approval queue, statements |
| **M4-M7** | provider credentials, key spaces, isolation suite, host routing (doc 14 §11) | a second organization is contracted; gated by D-IDENTITY-13 (tenant export and restore) and a combined-capacity load test | local drivers stay process-wide | none |
| **W3** | outline at the end of this file | W2 mostly done | - | - |

Irreversible points, each behind a refuse-to-run check: the **HYBRID merge** (T3: stops on any same-month double billing) and the **M3 `NOT NULL`** (refuses when any row has a null organization). The other irreversible steps have their own gates: the deferred drop of `Course.monthlyFee` (T4; refuses to run if any `Course.monthlyFee` differs from its latest `CourseFee` row) and the anonymisation in T28 (REPORT_ONLY first). Everything else is additive.

### Why this order (one line each)

- Blast radius first (W0), then daily dead ends (W1), because the institute is live and has no second customer.
- M2/M3 before W2 because Wave 2 adds most new tables and uniques; writing them once on the scoped client is cheaper than retrofitting.
- HYBRID and the lifecycle share one migration (T2-T3) because both rewrite enrollment uniqueness.
- `computeMonthFee` (T4) before concessions, proration, slips and per-mode PayHere amounts, which all call it.
- The gate (T6-T7) is one function; mode, payment, recording window, alumni and role rules ship together so students see one behaviour change, announced once.
- The slip channel waits for reconciliation views (W1-S4) and the any-SUCCESS guard (T4).
- `PaymentRequest` (T30) needs the fee function and concessions; shares (T31) are also the dated income record that the hand-over writes (D-STRUCTURE-9).

### Name corrections (decision wording versus code, verified 2026-11-20)

| Decision text | Code reality | Use in tasks |
|---|---|---|
| `deleteSession` (D-STRUCTURE-8) | `deleteClassSession` in `class-session.service.ts` and controller | `deleteClassSession` |
| outstanding SQL "about 578" in `payment.service.ts` | inside `getFinancialReport`; joins `Course` without `c."isActive"`; filters enrollments but not `deletedAt` users (F-78) | `getFinancialReport` |
| `assertCanManagePrivilegedTarget(actor, target)` pattern | module-private `(actorRole, targetRole)` in `user.service.ts`, not exported | export it or move to `access.service.ts` in W1-S2 |
| "`PaymentAdjustment` written by the webhook" (D-MONEY-5) | `PaymentAdjustment.createdById` is required (`NOT NULL`, FK to `User`) | T5 makes it nullable (system actor) |
| "`getCurrentPaymentMonth` at `payment.service.ts` about 740" | `collectEntrancePayment` line 740, `payment.controller.ts` line 78, `access.service.ts` line 48 | all three replaced in W1-S1 |
| "doc 16 drivers already in place" (sequencing) | only storage and SMS are Done; PayHere, Zoom, video are Planned | rows D-video, D1 and D3 added as Wave 1b Tasks 1 to 3, D2 added in W2c; the clock driver is new |
| Role handling in the content gate | Not uniform across roles (defect class, doc 18 F-04 and F-05); details in the private copy | made explicit per D-ACCESS-8 in T6/T7 |

## Findings coverage (every finding in the Wave 2 brief)

| Finding | Closed by | Note |
|---|---|---|
| F-05, F-23 | T6, T7 | F-05 per D-MONEY-1 and D-ACCESS-9; F-23 per D-ACCESS-2 |
| F-37 | W1-S3 (branch recorded), **T13** (session filter, `ClassSession.instituteId`) | residual here |
| F-52, F-53 | T12 | |
| F-105 | W1-S3 (D-STRUCTURE-2) | residual in T13: scan and manual branch checks read `ClassSession.instituteId` |
| F-58 | W1-S4 (D-OPS-1 guards) | residual: bulk amount equals `computeMonthFee` in T4 |
| F-59, F-62 | T4 | any-SUCCESS guard; initiate checks active enrollment, active course, month window (not named by any decision) |
| F-60, F-61 | T5 | F-60 attached to T5 via spec §3.3 rule 5 (not named by any decision) |
| F-63 | T4 (price), T10 (concessions) | |
| F-64 | T8 | |
| F-65 | T1 (interim), T3, T6, T14 | |
| F-91 | T31 | |
| F-93 | T2, T14 | |
| F-94 | T9 | |
| F-25, F-98 | T21 (capture), T22 (fan-out) | |
| F-76 | T23 | with F-72, F-51 |
| F-125 | T30 | |
| F-126 | T26 | with F-71 |
| Related, in scope of the same tasks | F-66, F-110 (T4, T30); F-18, F-78 (W1-S1, T4); F-88 (T7); F-97 (T16); F-92 (T11); F-50, F-45 (T15); F-96 (T17); F-56 concurrency (T18; the credential-scope part is **unplaced**, see private file); F-14, F-40, F-111 (T24); F-24 (T25); F-73, F-102 (T27); F-99 (T28); F-101 (T29); F-109 (T12); F-116 (T13); F-122 (T22); F-75 (T20); F-79 (T31) | |

## Branch and PR slicing

- One PR per task, or per labelled sub-PR (`T2a`, `T2b`). Branch off fresh `origin/dev` as `type/kebab-scope`; never commit to `dev` or `main`; delete the branch after merge; follow-up work gets a new branch ([11-git-and-naming.md](../../../context/documents/11-git-and-naming.md)).
- Conventional Commit title on commit and PR, squash-merge with a green `Quality Gate` plus review. No attribution lines in commits or PR bodies.
- Each PR carries its tests, its docs update (Definition of Done) and, for UI changes, the frontend slice. A migration PR contains no behaviour change beyond what its task states.
- Money and gate PRs (T4-T10, T19, T30, T31) are merged to `dev` freely but **released to `main` as a group per step** (W2b, W2d, W2f) so the institute sees one announced change. Settings default to the pre-change behaviour wherever a default exists.

| Task | Branch | PR title |
|---|---|---|
| T1 | `fix/interim-duplicate-mode-block` | `fix(enrollment): block a second active mode for the same course` |
| T2a | `chore/hybrid-enum` | `chore(db): add HYBRID class type` |
| T2b | `feature/enrollment-lifecycle-columns` | `feat(enrollment): add lifecycle columns and events (expand)` |
| T3 | `feature/hybrid-enrollment-merge` | `feat(enrollment): one enrollment per student and course, HYBRID eligibility` |
| T4 | `feature/month-fee-function` | `feat(payments): compute one effective month fee for every channel` |
| T5 | `feature/payhere-reversal` | `feat(payments): reverse chargebacks and record duplicate PayHere payments` |
| T6 | `feature/covered-student-gate` | `feat(access): one covered-student gate with grace, exceptions and delivery mode` |
| T7 | `feature/recording-window-and-exam-gate` | `feat(access): recording window, locked reasons and optional exam payment gate` |
| T8 | `feature/joiner-proration-and-mode-change` | `feat(enrollment): joiner proration, reactivation clock and mode change` |
| T9 | `feature/trials-and-advance-month` | `feat(enrollment): free trials and one month paid in advance` |
| T10 | `feature/enrollment-concessions` | `feat(payments): explicit concessions with zero-amount ledger rows` |
| T11 | `feature/course-attributes-capacity` | `feat(classes): medium, kind and capacity` |
| T12 | `feature/branch-rooms` | `feat(classes): course branch, session branch and optional rooms` |
| T13 | `fix/session-branch-checks` | `fix(attendance): read the session branch in scan and manual marking` |
| T14 | `feature/enrollment-lifecycle` | `feat(enrollment): leave requests, staff end, transfer and rejoin` |
| T15 | `feature/closed-dates-and-cancellation` | `feat(timetable): closed dates and visible session cancellation` |
| T16 | `feature/end-batch-rollover` | `feat(classes): end a batch, roll over next year, alumni recordings` |
| T17 | `feature/session-substitute` | `feat(classes): session-scoped substitute teacher` |
| T18 | `feature/zoom-concurrency` | `feat(live): refuse overlapping live classes beyond the licence cap` |
| T19 | `feature/bank-slip-channel` | `feat(payments): staff-approved bank slip channel` |
| T20 | `fix/remove-duplicate-results-sms` | `fix(notifications): send results SMS through the notification service only` |
| T21 | `feature/guardian-and-consent` | `feat(identity): guardian record, date of birth and consent` |
| T22 | `feature/sms-recipients-languages` | `feat(notifications): guardian recipients, languages, quiet hours, budget` |
| T23 | `feature/notification-events` | `feat(notifications): absence, fee, cancellation and exam events with schedulers` |
| T24 | `feature/live-attendance-reconcile` | `feat(attendance): automatic live attendance by connected time` |
| T25 | `feature/recording-attendance` | `feat(attendance): verified recording-watch attendance` |
| T26 | `feature/results-publish-and-late-work` | `feat(exams): publish checks, unpublish and per-student extensions` |
| T27 | `feature/results-ranks-progress` | `feat(exams): class results sheet, own rank setting and progress` |
| T28 | `feature/retention-erasure` | `feat(privacy): retention job, anonymisation and erasure requests` |
| T29 | `feature/teacher-exit-checklist` | `feat(users): teacher exit checklist` |
| T30 | `feature/teacher-payment-requests` | `feat(payments): capped teacher requests for concessions and refunds` |
| T31 | `feature/teacher-statements` | `feat(payments): teacher shares and month-end statements` |

## Rules that apply to every task (stated once)

- **Layering.** Routes wire, controllers shape, services own Prisma. Grep `import.*prisma` outside `services/` before finishing.
- **Tenancy.** New model: `organizationId`, relation (`Restrict`), index, org-leading composite uniques, registry test. After M2 services use the scoped client, so no `where: { organizationId }` is hand-written and a Vitest row proves an actor from organization B gets 404 on organization A's id (`04-ai-workflow-rules.md` §3.3). No hand-built R2 or Redis keys; no provider-credential reads from `env`.
- **Migrations.** Expand, backfill, contract; each stage its own PR or migration directory. Adding an enum value (`HYBRID`, `REVERSAL`, `VIDEO`, new `NotificationType` values) is its **own** migration, before any migration that uses the value. Never backfill a trigger-protected table (`PaymentAdjustment`, the evidence tables) with `UPDATE`; use `ADD COLUMN ... DEFAULT`. Each migration PR proves fresh deploy, upgrade from the previous head, and zero drift (`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`). Stop the backend and worker before `prisma migrate deploy`.
- **Settings.** Every number is a registry key (D-MONEY-10), read per request, defaulting to the value decided in doc 19; each task names the value that restores today's behaviour where one exists. Keys are named in each task.
- **Idempotency.** High-stakes POSTs take `Idempotency-Key` (`checkIdempotency`); responses that carry a secret are exempt from response replay.
- **Vitest (§3.4).** Every guard ships the actor x target matrix, not-found, self-referential and check-ordering cases, and an organization case after M2. Mock `@/config/database`'s `prisma`; colocate `*.test.ts`. A task lists only the cases that are specific to it; the matrix itself is implied.
- **Live stack.** Roles are named, never credentials. Bring up with `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`; read `docker compose logs backend --tail 200` for the asserted behaviour. Roles: owner (SUPER_ADMIN), front desk (ADMIN), teacher, marker, student, guardian (SMS only).
- **Public repo.** Security-class tasks stay at defect-class level here.
- **Docs in the same PR.** See Definition of Done.

---

# Wave 2a: One enrollment migration

## T1: Interim guard, one active mode per student and course

- **Closes:** F-65 (interim half). **Blocked by:** none. The `409` guard ships in Wave 1 Task 4; this task now adds only the read-only report script.
- **Files:** new `backend/src/scripts/report-duplicate-enrollments.ts` (read-only; prints student index, course, modes, payment months; output is never committed).
- **Behaviour:** a second active enrollment of the same course in another mode is refused `409 ALREADY_ENROLLED_OTHER_MODE`. Same-mode active still returns `ALREADY_ENROLLED` (that check runs first). Existing duplicates are untouched and listed by the report for T3.
- **Settings:** none.
- **Vitest:** student with active ONLINE enrolling PHYSICAL (409); inactive other mode (allowed, reactivates or creates); same mode active (existing error wins, ordering); staff enrolling a student; staff enrolling a non-student target (400); course missing or inactive (404 before the mode check); concurrent double POST (second loses on the unique).
- **Live stack:** as front desk enroll one student ONLINE then PHYSICAL in the same course; as student repeat via the class page. Run the report script and confirm it matches `SELECT` of users with two active rows.
- **Migration:** none. **Effort:** S. **Rollback:** revert the PR.

## T2: Enum and lifecycle columns (expand)

Two sub-PRs. Do not merge T2b before T2a is deployed, because T2b's migration may not use the new enum value in the same transaction.

### T2a: `HYBRID` enum value

- **Closes:** prerequisite for F-65, F-93. **Blocked by:** M3.
- **Files:** modify `backend/prisma/schema.prisma` (`enum ClassType` add `HYBRID`); new migration `backend/prisma/migrations/<timestamp>_hybrid_class_type/`; modify every `z.nativeEnum(ClassType)` (eight sites, grep-verified): `backend/src/schemas/class-session.schema.ts` lines 8 and 25, `enrollment.schema.ts` lines 13, 24 and 39, `timetable.schema.ts` lines 20 and 35, `payment.schema.ts` line 101 (the bulk row), replacing each with an explicit `z.enum(['ONLINE', 'PHYSICAL'])` so the API does **not** accept `HYBRID` until T3 enables it (today `nativeEnum` would start accepting it the moment the enum value exists); `frontend/lib/types.ts` (`ClassType`, `EnrollmentMode`) keeps the two-value types until T3.
- **Behaviour:** none visible.
- **Vitest:** all eight schema sites reject `HYBRID` (enrollment create and both enrollment queries, slot create and update, session create and update, bulk payment row).
- **Live stack:** `prisma migrate deploy` on the dev database, create an enrollment with `HYBRID` and see 400.
- **Migration:** enum value only, own directory. **Effort:** S. **Rollback:** the value cannot be dropped cheaply; leave it unused. Revert the schema narrowing only together with T3.

### T2b: lifecycle columns and `EnrollmentEvent`

- **Closes:** F-93 (schema half), F-94 (column), F-64 (clock column). **Blocked by:** T2a.
- **Files:** modify `backend/prisma/schema.prisma`: `Enrollment` gains `activeKey String? @unique`, `activatedAt DateTime`, `nextClassType ClassType?`, `trialUntil DateTime?`, `endedOn DateTime?`, `endReason EnrollmentEndReason?`, `dropRequestedAt DateTime?`, `recordingAccessUntil DateTime?` (D-STRUCTURE-6; added here so Enrollment is migrated once, which the decision set did not list); new `enum EnrollmentEndReason { DROPPED TRANSFERRED BATCH_ENDED NON_PAYMENT STAFF_REMOVED }`; new tenant-owned `EnrollmentEvent` (`organizationId`, `enrollmentId`, `type`, `at`, `actorId?`, `reason?`, `detail Json?`, indexes on `enrollmentId` and `organizationId`); `ClassSession.onlineForPhysical Boolean @default(false)`; new migration directory; update `backend/src/utils/tenant-integrity.test.ts` expectations if the model list is asserted.
- **Behaviour:** none visible. `activatedAt` is backfilled to `createdAt` in the migration, then `NOT NULL DEFAULT now()`. `activeKey` stays null until T3.
- **Settings:** none.
- **Vitest:** registry test passes for `EnrollmentEvent`; a Prisma-level test that two active rows with the same non-null `activeKey` collide.
- **Live stack:** deploy on a copy of the live data volume; confirm row counts and that `activatedAt = createdAt` for every enrollment.
- **Migration:** expand only (additive, nullable except `activatedAt` backfilled in the same migration). Zero drift gate. **Effort:** M. **Rollback:** columns are unused; revert code, leave columns.

## T3: Merge, contract and eligibility helper

- **Closes:** F-65. **Blocked by:** T2b, T1 report reviewed by front desk.
- **Files:** new `backend/src/scripts/merge-hybrid-enrollments.ts` (dry-run by default); modify `backend/src/services/enrollment.service.ts` (`createEnrollment` reactivation by `(userId, courseId)` latest row, sets `activeKey`, `activatedAt`, writes an `EnrollmentEvent`; `cancelEnrollment` clears `activeKey`), `backend/src/schemas/enrollment.schema.ts` (accept `HYBRID`), `backend/src/scripts/seed-demo.ts` (the `userId_courseId_classType` lookup at line 273), `backend/src/services/access.service.ts` (new pure `modeAllows(classType, channel)` with `channel` `PHYSICAL | ONLINE`: `ONLINE` and `HYBRID` allow online, `PHYSICAL` and `HYBRID` allow physical); frontend `frontend/lib/types.ts`, `app/(app)/classes/[classId]/_components/EnrollPanel.tsx`, `app/(app)/classes/_components/ClassCard.tsx`, `app/(app)/timetable/_components/TimetableManager.tsx` (three modes with plain-language explanation, per D-STRUCTURE-3 copy).
- **Behaviour:** one enrollment row per `(student, course)`. The merge script (a) takes **all** rows for a pair, active or not; (b) **refuses to run** if any two rows hold a payment for the same month or any other ambiguity exists (spec §4.2), printing student index, course, month and both payment ids and amounts, because that is double billing for the owner to refund first (spec §4.2); (c) otherwise keeps the oldest row, sets it to `HYBRID` when two modes were active, re-points `Payment.enrollmentId`, merges `EnrollmentEvent` history, and sets `activeKey` on the survivor when active. Mode change is an in-place `classType` update with an event. Session and slot `classType = null` rows are relabelled `HYBRID` in a separate reversible data migration (D-STRUCTURE-7), after the F-104 form change has made the field required for new rows.
- **Settings:** none.
- **Vitest:** merge matrix (no duplicates, two active modes, one active plus one inactive, three rows, same-month collision aborts with nothing written, rerun is a no-op); concurrent creates in two modes (one wins via the `activeKey` unique, the other `409 ALREADY_ENROLLED`); reactivation by another mode updates in place and keeps payment history; `modeAllows` truth table for all three modes and both channels; staff versus student actors and a non-student target; organization isolation.
- **Live stack:** take a `pg_dump` (doc 12), run the script dry-run, review the printed plan with the front desk, run for real, enrol a student in each mode, check that a student who held both modes now shows one `HYBRID` enrollment with all payment history.
- **Migration:** backfill (script) then contract (a **separate** later PR drops `@@unique([userId, courseId, classType])` after one week of clean operation and replaces it with `@@unique([userId, courseId])`, so inactive rows are also one per pair). **Effort:** L. **Rollback:** after the script runs only a restore from the pre-run dump undoes the merge; code rollback alone is safe before the script runs. This is an irreversible point, gated by the refuse-to-run check above.

---

# Wave 2b: Money core and the single content gate

Release the whole step to `main` together (see slicing). Before T6 reaches `main`, run the one-time report from the HYBRID spec §4.4 item 1 (physical-only students who watched recordings or joined live classes) and send the owner-approved announcement; the PHYSICAL-only rule changes behaviour for existing students.

## T4: One fee function, effective-dated fees, fixed collected amount

- **Closes:** F-110, F-59, F-62, F-63 (price half), F-66 (fee half), F-58 residual, F-78 residual, F-18 residual. **Blocked by:** W1-S1 (settings, org time), D1 (to verify notify amounts), M3.
- **Files:** new `backend/src/services/fee.service.ts` (`computeMonthFee(enrollment, month)` pure over loaded data; `listFeeFor(courseId, mode, month)`); modify `backend/prisma/schema.prisma` (new tenant-owned `CourseFee` with `(organizationId, courseId, effectiveFromMonth)` unique; `Payment.listAmount Decimal?`; keep `Course.monthlyFee` as a mirror refreshed by `fee-month-roll` (T8); until T8 ships, readers use `listFeeFor`, never the mirror); modify `backend/src/services/payment.service.ts`: `initiatePayherePayment` (the `amount: enrollment.course.monthlyFee` in the upsert create and update), `collectEntrancePayment` (`resolvedAmount`), `bulkUploadPayments` (`normalized.amount ?? ...monthlyFee`), `getFinancialReport` (replace the raw-SQL outstanding block with a TypeScript computation over active enrollments of active courses and non-deleted users; M6 later bans raw SQL), `getEnrollmentForStudent`; modify `backend/src/schemas/payment.schema.ts` (drop `amount` from `collectEntrancePaymentSchema` and `bulkPaymentRowSchema` for `ADMIN`; the `SUPER_ADMIN` override in `overridePaymentSchema` keeps its reason); modify `backend/src/services/class.service.ts` (`updateClass`: `TEACHER` gets `403 FEE_CHANGE_RESTRICTED` on a fee change; `createClass` writes the first `CourseFee` row; `SUPER_ADMIN` fee edits write a new row with `effectiveFromMonth`); modify `backend/src/controllers/payment.controller.ts` (month default from the org-time helper); frontend `app/(app)/payments/_components/CollectPayment.tsx`, `StudentPayments.tsx`, `AdminPayments.tsx` (amount shown, not typed), `frontend/lib/payhere.ts`, class edit form fee control.
- **Behaviour:** D-MONEY-2 (a)-(f). Every channel computes the same amount. The any-SUCCESS guard (added to `collectEntrancePayment` and `bulkUploadPayments` by Wave 1 Tasks 6 and 7, here generalised through `computeMonthFee`) replaces the `payhereId`-only guard: an existing SUCCESS row is `409 ALREADY_PAID` naming method and collector; correction is `overridePayment` or a `SUPER_ADMIN` override (F-59). `initiatePayherePayment` requires an active enrollment, an active course and a month between `activatedAt` and current plus `fees.advanceMonthsAllowed`, derived server-side in Asia/Colombo (F-62; today it has no such check). `initiatePayherePayment` and the PayHere success update set `method = ONLINE` (spec §3.3 rule 6). A saved fee change applies from the first month at least `fees.changeNoticeDays` away unless nobody has paid this month and the owner picks "from this month"; a `FEE_CHANGED` notification follows (the enum value is added by T4's own enum migration; the SMS default is seeded by T22; until then in-app only). One helper `assertBillableMonth(enrollment, month)` in `fee.service.ts` serves desk, bulk, PayHere initiate and later slips: month not before `activatedAt`, not after current plus `fees.advanceMonthsAllowed`; it replaces the blanket `FUTURE_MONTH` refusal in `collectEntrancePayment`, so every channel agrees from this task on.
- **Settings:** `fees.changeNoticeDays` 14, `fees.roundingRupees` 10, `fees.collectedAmountMustMatchFee` true (`fees.advanceMonthsAllowed` already registered by Wave 1 Task 7).
- **Vitest:** `computeMonthFee` table (list fee x mode fallback x concession percent x proration x rounding half-up, boundary months, a fee change effective next month, nothing paid so "this month" allowed); collect with a typed amount by `ADMIN` rejected; `SUPER_ADMIN` override with and without reason; existing SUCCESS by each method (`ENTRANCE`, `BULK`, `MANUAL`, `ONLINE`) refused; refunded row refused; initiate for inactive enrollment, archived course, month before `activatedAt`, month two ahead; PayHere notify amount equals the stored amount after a fee change; `TEACHER` fee edit refused on own course, `SUPER_ADMIN` allowed, other teacher 403; `TEACHER` still sets the fee in `createClass`; outstanding excludes archived courses and deleted users (F-78).
- **Live stack:** price a course with an online fee as owner, enrol one student ONLINE and one PHYSICAL, confirm the two PayHere checkouts (mock driver D1) carry different amounts and the notify is accepted; collect cash at the desk and see the same figure fixed; attempt to collect the same month twice.
- **Migration:** `NotificationType.FEE_CHANGED` in its own enum migration first. Expand: `CourseFee` (backfill one row per course from `monthlyFee`, effective from the earliest month with any payment, else current), `Payment.listAmount` nullable with backfill `UPDATE ... SET listAmount = amount` (Payment is not trigger-protected). Contract (drop the `Course.monthlyFee` column) is deferred one month, separate PR. Zero drift gate.
- **Effort:** M. **Rollback:** the mirror keeps the old read path; revert the PR and fees read from `Course.monthlyFee` again. Only dropping the column is one-way (deferred).

## T5: Chargeback reversal and duplicate PayHere payments

- **Closes:** F-61, F-60, F-66 (chargeback half). **Blocked by:** M3, D1.
- **Files:** modify `backend/prisma/schema.prisma` (`PaymentAdjustmentType` add `REVERSAL` and `DUPLICATE`, one enum migration first; `PaymentAdjustment.bearer` enum `SHARED | INSTITUTE` via `ADD COLUMN ... DEFAULT 'SHARED'`; `PaymentAdjustment.createdById` becomes **nullable** (the M3 integrity script treats a null actor as valid) with a system-actor meaning, because a webhook has no user; `PaymentAdjustment.reversalKey String? @unique`, written at insert only on `REVERSAL` rows as `<organizationId>:<paymentId>:<payhereId>` (insert-only fits the immutability trigger; a plain unique over `externalReference` would also cover `REFUND` rows whose reference the owner types and could fail on existing duplicates); `PaymentAdjustmentType` also gains `DUPLICATE`, in the same enum migration as `REVERSAL`; `NotificationType` add `PAYMENT_REVERSED`, own migration); modify `backend/src/services/payment.service.ts` `handlePayhereNotify` (today it returns early when a SUCCESS row receives a non-SUCCESS status, and `PAYHERE_STATUS_CHARGEDBACK` is resolved to a failure by `resolvePayhereStatus`), `backend/src/services/payment-adjustment.service.ts` (new `reversePayment(tx, ...)` mirroring `refundPayment`, Serializable); new notification dispatch to owner and front desk; frontend owner console panel "open reversals" (F-127) and `PaymentAdjustmentPanel.tsx` type label.
- **Behaviour:** D-MONEY-5. A `-3` on a SUCCESS row writes one immutable `REVERSAL` adjustment (amount = payment amount minus `refundedAmount`, `externalReference` = PayHere payment id), sets `status` FAILED and clears `payhereId` in one Serializable transaction. A repeated `-3` is a no-op (the `reversalKey` unique) and **must not rewrite `payhereId`** (today's FAILED path would). Access ends at once; the month stays payable by any channel. A PayHere success on a row already SUCCESS by another channel (spec §3.3 rule 5) is not applied: a `DUPLICATE`-labelled adjustment is recorded, staff are notified, refund goes through the existing ledger, and the notify answers 200. A signature-valid notify whose amount does not match the stored amount changes nothing, writes an `AuditLog` row and a logger and Sentry warning, and answers 200 so PayHere stops retrying (today it throws `PAYHERE_AMOUNT_MISMATCH` and PayHere retries forever); nothing is written to the immutable ledger because no payment changed (F-60).
- **Settings:** `payments.chargebackLocksAccessImmediately` true, `payments.chargebackNotifyOwner` true, `payments.reversalDefaultBearer` SHARED.
- **Vitest:** `-3` on SUCCESS (one adjustment, status FAILED, `payhereId` cleared); repeat `-3` (no second row, `payhereId` unchanged); `-3` on PENDING and FAILED (today's behaviour); bad signature rejected before any lookup; partial refund then `-3` (amount equals remaining); duplicate success on a cash row (not overwritten, adjustment, notification); duplicate success with the same `payhereId` (idempotent, no second notification); mismatched-amount notify (200, audit row, warning, row untouched); access denied on the next request; month payable at the desk afterwards; adjustments immutable (trigger) so the migration contains no UPDATE.
- **Live stack:** with D1 post a signed success, then a signed `-3`; check the student loses live and recording access, the owner sees the reversal, and the front desk can collect the month.
- **Migration:** enum values in their own migrations, then `ADD COLUMN` for `bearer` and `reversalKey` and `ALTER COLUMN createdById DROP NOT NULL`, then the unique index. **Effort:** S-M. **Rollback:** adjustments are append-only history; revert code and leave the rows. A mistaken reversal is corrected by an owner `OVERRIDE` with a reason.

## T6: One covered-student gate: grace, exceptions, delivery mode **[PRIVATE-DETAIL]**

- **Closes:** F-05 (payment half), F-65 (gate half), F-66, F-23 (plumbing). **Blocked by:** T3, T4, W1-S1, M3.
- **Files:** modify `backend/src/services/access.service.ts` (`assertStudentContentAccess` delegates to `isStudentCovered(student, course, channel, now)`; role handling per D-ACCESS-8; the `modeAllows` helper from T3); modify callers: `live-class.service.ts` (`issueLiveClassToken`, the gate call), `video.service.ts` (`generateStreamUrl`), `course-module.service.ts` (the two `assertStudentContentAccess` calls with `requirePaid`), `attendance.service.ts`, `class-session.service.ts`, `exam.service.ts`, `submission.service.ts` (unchanged semantics, `requirePaid:false` paths stay enrollment-only); new tenant-owned `AccessException` (`organizationId`, `enrollmentId`, `month`, `until`, `kind GRACE_EXTENSION | PROVISIONAL_SLIP`, `reason`, `grantedById?`, indexes); new `backend/src/services/access-exception.service.ts`, route `POST /enrollments/:id/access-exceptions` in `backend/src/routes/enrollment.routes.ts` with controller and schema; frontend student pages show the precise 402 (month, grace end) and the staff grant dialog.
- **Behaviour:** D-MONEY-1 order (1)-(6) exactly, with `channel` meaning `LIVE | RECORDING | DOWNLOAD | MODULE`. For any pair T3 left unmerged (the refuse-to-run check stopped on it, or it is awaiting manual resolution), a channel is allowed only if one single active enrollment both permits the channel by `modeAllows` and is covered; the PHYSICAL-only rule is applied unchanged. Failure codes: `402 PAYMENT_REQUIRED` (month, and the day grace ended when relevant), `403 ONLINE_ACCESS_NOT_INCLUDED` (mode). `ClassSession.onlineForPhysical` lets a PHYSICAL enrollment see one session's live class and recording. Extensions: `SUPER_ADMIN` any length with a reason; `ADMIN` up to `fees.extensionMaxDaysFrontDesk` days and `fees.extensionMaxPerEnrollmentPerMonth` per month with a reason; teachers cannot. Every exception is a visible row, never a `Payment`.
- **Settings:** `fees.graceDays` and `fees.graceRequiresPreviousMonthPaid` already registered by Wave 1 Task 1; new here: `fees.extensionMaxDaysFrontDesk` 7, `fees.extensionMaxPerEnrollmentPerMonth` 1.
- **Vitest:** channel (live, recording, download, module) x state (paid, free-card zero row, exception, trial, grace day 10 versus 11, lapsed rolling payer versus new joiner) x mode (PHYSICAL, ONLINE, HYBRID, `onlineForPhysical`) x Colombo midnight at 23:59 and 00:01 on the 1st; duplicate-enrollment coverage cases (listed in the companion file, section C); role matrix per D-ACCESS-8 and D-ACCESS-1 for live and recording; exception grant matrix (`ADMIN` over the cap, twice in a month, `TEACHER`, `SUPER_ADMIN`, enrollment not found, inactive enrollment); org isolation on exceptions.
- **Live stack:** as owner and front desk set a student's state by desk payment, check live join and recording stream outcomes for each mode; step the clock (use the D3 clock driver) across the 10th and the Colombo month boundary; grant and exhaust an extension; confirm the announcement report from the HYBRID spec is attached to the release.
- **Migration:** `AccessException` (additive). **Effort:** L. **Rollback:** callers still go through one function; `fees.graceDays = 0` and removing the mode check restore the old behaviour; `AccessException` rows stay inert.

## T7: Recording window, locked-recording reasons, optional exam payment gate **[PRIVATE-DETAIL]**

- **Closes:** F-05 (history half), F-23, F-88, D-ACCESS-8 completion, F-97 (dormant alumni branch). **Blocked by:** T6 (same release), T2b (`recordingAccessUntil`).
- **Files:** modify `backend/src/services/video.service.ts` (`listVideosByClass`, `getVideoById`, `generateStreamUrl`, `deleteVideoRecording` becomes a soft delete via a new `VideoRecording.deletedAt`; every query filters it), `backend/src/services/access.service.ts` (new `assertRecordingAccess` (extracted here in T7, introduced in Wave 0 as the role check) window check against the recording session's `date`; `assertStudentExamStartAccess` gets the `exams.requirePaidToStart` branch), `backend/src/services/class.service.ts` (teacher may set `Course.recordingWindowDays` up to `recordings.maxWindowDays`), `backend/prisma/schema.prisma` (`VideoRecording.deletedAt`, `Course.recordingWindowDays`, `Course.examsRequirePaid`), frontend `app/(app)/classes/[classId]/videos/` (lock reason, month, amount, Pay button, "available until"), `frontend/components/features/VideoPlayer.tsx` blocked-state copy, `CourseForm.tsx` tri-state and window controls.
- **Behaviour:** D-ACCESS-9 single window rule (joiner floor and view window), recording list returns `{allowed, reasonCode, month, amount}` per item with the amount from `computeMonthFee`; alumni branch (BATCH_ENDED enrollments until `recordingAccessUntil`) is present but dormant until T16; soft-deleted recordings are hidden from students only; exams: results are never gated, sitting is gated only when `exams.requirePaidToStart` or `Course.examsRequirePaid`, checked once at start with the exam's start month, `402` naming the month.
- **Settings:** `recordings.gateMode` ROLLING, `recordings.viewWindowDays` 90, `recordings.maxWindowDays` 365, `recordings.joinerBackfillMonths` 0, `recordings.excusedCatchUpDays` 0, `exams.requirePaidToStart` false.
- **Vitest:** day 90 versus 91; joiner month edge; override above ceiling rejected; soft-deleted hidden in list, get and stream but still markable READY by the Bunny webhook; `PER_MONTH` mode; excused catch-up off and on; exam start with flag x paid, grace, unpaid x scoped and legacy exam x course override; results readable unpaid; teacher outside own course cannot set the window; list payload shows reason per item; role matrix per D-ACCESS-8 for all recording reads.
- **Live stack:** with the local video driver upload two recordings of different months, check each student state in the list and on tap; flip the exam flag per course.
- **Migration:** nullable columns, no backfill. **Effort:** M. **Rollback:** `recordings.viewWindowDays = 0` (unlimited) and `gateMode` restore; soft delete is additive.

## T8: Joiner proration, reactivation clock, mode change, the monthly job

- **Closes:** F-64, F-65 (mode change). **Blocked by:** T3, T4.
- **Files:** modify `backend/src/services/fee.service.ts` (joiner rule in `computeMonthFee`), `backend/src/services/enrollment.service.ts` (`changeEnrollmentMode`, activation sets `activatedAt`), new `backend/src/jobs/fee-month-roll.job.ts` and registration in `backend/src/worker.ts` plus a queue constant in `backend/src/utils/constants.ts` (repeatable BullMQ job, daily 00:10 Asia/Colombo, heavy work days 1-3; follows the existing `scheduleWeeklyTimetableGeneration` pattern in `backend/src/jobs/notification.queue.ts`); route `PATCH /enrollments/:id/mode`; frontend `CollectPayment.tsx:128` and the unpaid-month logic use `activatedAt` instead of `createdAt`, payment pages show "joined late: 50%".
- **Behaviour:** D-MONEY-4: full fee if activated on or before `fees.joinerFullFeeUntilDay`, else `fees.joinerLateFeePercent`, recorded as the payment amount with `listAmount` and note `JOINER_PRORATED`; rejoin in an already paid month costs nothing, rejoin after a full-month gap is a new activation; a mode change that adds online access is stored in `nextClassType` and applied by the job on the 1st (immediate only when allowed by `fees.modeUpgradeEffective` or a `SUPER_ADMIN` override with a reason), a removal is immediate with no refund; arrears start at `activatedAt` and show at most `fees.arrearsReportMonths`.
- **Settings:** `fees.joinerFullFeeUntilDay` 15, `fees.joinerLateFeePercent` 50, `fees.modeUpgradeEffective` NEXT_MONTH.
- **Vitest:** join on day 15 versus 16 and the last day, Colombo midnight; rejoin in a paid month, after a gap; upgrade next-month and immediate-if-not-higher; downgrade immediate; job idempotent across two runs and a missed day; actor matrix on the mode endpoint (student own, other student 404, `ADMIN`, `SUPER_ADMIN`, `TEACHER` 403).
- **Live stack:** enrol late in the month and read the computed fee in desk and PayHere flows; change mode and watch the 1st-of-month job (advance the D3 clock driver) apply it.
- **Migration:** none beyond T2b. **Effort:** M. **Rollback:** `fees.joinerFullFeeUntilDay = 31` disables proration; the job can be paused, coverage falls back to grant-time rows.

## T9: Trials and one month in advance

- **Closes:** F-94. **Blocked by:** T6, T8.
- **Files:** modify `backend/src/services/enrollment.service.ts` (`createTrialEnrollment`; `trialUntil` settable once per student and course), `backend/src/services/access.service.ts` (trial branch: mode-limited, no recordings or downloads; exams follow D-ACCESS-2 (a trial student is covered for exam start)), outstanding query excludes trials (the advance-month window itself is delivered by T4's `assertBillableMonth`), capacity counting of PHYSICAL trials lands in T11 (`class.service.ts`); route `POST /enrollments/trial`; frontend enroll panel "Start free trial" for staff and the owning teacher.
- **Behaviour:** D-MONEY-7: trial of `trials.days` in an explicit mode (never HYBRID), granted by `ADMIN`, `SUPER_ADMIN` or the owning `TEACHER` (`assertCourseAccess`), once ever per student per course; billing clock starts when it ends; advance payment up to `fees.advanceMonthsAllowed` is covered by tests here and the owner copy; the rule lives in T4.
- **Settings:** `trials.days` 14, `trials.maxPerStudentPerCourse` 1, `trials.allowRecordings` false (`fees.advanceMonthsAllowed` already registered by Wave 1 Task 7).
- **Vitest:** second trial refused; trial expiry; recording denied, exam start allowed under D-ACCESS-2 rules, live allowed in an ONLINE trial; PHYSICAL trial gets no online content; other teacher's course 403; advance month allowed and second month refused; trials excluded from outstanding and from teacher share; trial for a non-student target.
- **Live stack:** grant a trial at the desk, scan in, confirm live and recording outcomes, let it expire (D3 clock driver).
- **Migration:** none beyond T2b. **Effort:** S-M. **Rollback:** `trials.days = 0` and `advanceMonthsAllowed = 0`.

## T10: Concessions and zero-amount ledger rows

- **Closes:** F-63. **Blocked by:** T4, T8 (job).
- **Files:** modify `backend/prisma/schema.prisma` (new tenant-owned `EnrollmentConcession` per D-MONEY-3, `Payment.concessionId`); new `backend/src/services/concession.service.ts` (grant, revoke, expire; `assertCourseAccess` on every course-scoped read and write), routes under `/api/enrollments/:id/concessions` (`SUPER_ADMIN`; teachers use T30), job step in `fee-month-roll` writing idempotent zero-amount SUCCESS rows (method `MANUAL`, note `FREE_CARD`, `collectedById` = grantor) on the existing `@@unique([enrollmentId, paymentMonth])`; `backend/src/services/fee.service.ts` applies the percent; `getFinancialReport` and `getPaymentsSummary` exclude zero rows from paid counts and collected totals (the report uses raw SQL, so test it); frontend concession grant dialog and expiry list in the owner console.
- **Behaviour:** D-MONEY-3: percent step, no backdating, reason required and hidden from front desk and rosters, owner list of concessions expiring within `concessions.expiryWarningDays`. A concession granted while a PayHere checkout is PENDING must **not** rewrite that row's amount (the notify would then fail on the amount mismatch): the grant recomputes only rows without an open checkout and tells the guardian to restart payment.
- **Settings:** `concessions.percentStep` 25, `concessions.defaultValidityMonths` 6, `concessions.maxValidityMonths` 12, `concessions.backdateMonths` 0, `concessions.siblingPercent` 0, `concessions.expiryWarningDays` 30.
- **Vitest:** grant, revoke, expire; step validation; no backdating; job idempotent and recovers a missed run; amount equals discounted amount across PayHere, desk, bulk; gate passes on a free month; financial report excludes zero rows; front desk 403 and reason hidden; teacher outside own course 403; `Payment` Zod schemas still reject zero from the API (rows come only from the job and the grant path); pending-checkout row not rewritten.
- **Live stack:** grant a 100% and a 50% card as owner, advance the D3 clock driver one month, see the zero row appear and the half-fee checkout amount; check the student keeps access.
- **Migration:** additive. **Effort:** M. **Rollback:** revoke stops future rows; existing zero rows are corrected by owner override.

---

# Wave 2c: Structure

Start with **D2**, the `ZOOM_DRIVER` mock (a PR of its own, `feature/zoom-mock-driver`): mock meeting creation and a mock participant report, selected inside `backend/src/utils/zoom.ts` and `backend/src/utils/zoom-attendance.ts`, refused when `NODE_ENV=production` through `findLocalDrivers` in `backend/src/config/drivers.ts`, with `drivers.test.ts`, `docker-compose.local.yml`, `backend/.env.local.example` and the doc 16 matrix updated (doc 16 §5). The mock cannot prove real Zoom behaviour; T24 still needs a staging-account check.

## T11: Class medium, kind, capacity, accepting enrollments

- **Closes:** F-92. **Blocked by:** M3, T3.
- **Files:** modify `backend/prisma/schema.prisma` (enums `CourseMedium`, `CourseKind`; `Course.medium`, `kind` default THEORY, `capacity Int?`, `acceptingEnrollments Boolean @default(true)`); `backend/src/schemas/class.schema.ts`, `backend/src/services/class.service.ts` (`createClass`, `updateClass`); `backend/src/services/enrollment.service.ts` (`createEnrollment` capacity and `acceptingEnrollments` checks inside the transaction under `withAdvisoryLock('course-capacity', organizationId, courseId)`); `backend/src/routes/enrollment.routes.ts` and schema (`overrideCapacity`, `reason`); frontend `app/(app)/classes/_components/CourseForm.tsx`, `ClassCard.tsx`, `EnrollPanel.tsx`, the staff picker.
- **Behaviour:** D-STRUCTURE-3. Capacity counts active PHYSICAL and HYBRID enrollments plus PHYSICAL trials; ONLINE uses no seat. A full class is `409 CLASS_FULL`. `ADMIN` and `SUPER_ADMIN` may override with a reason (audited); `TEACHER` and `STUDENT` may not. Students self-enrol only while `acceptingEnrollments` and not full; staff can enrol into a closed class. Existing rows show "medium not set" until filled.
- **Settings:** `capacity.overrideRequiresReason` true.
- **Vitest:** last-seat race (two concurrent enrolments, one wins); override by `ADMIN`, `SUPER_ADMIN`, `TEACHER` (403), `STUDENT` (403); lowering capacity never evicts; closed class for student versus staff; ONLINE and HYBRID seat counting; trial seat.
- **Live stack:** set capacity 1, enrol two students from two sessions, override at the desk with a reason and check the audit row.
- **Migration:** additive, `medium` nullable. **Effort:** M. **Rollback:** `capacity = null` disables the check.

## T12: Branch dimension and optional rooms

- **Closes:** F-52, F-53, F-109 (course half). **Blocked by:** T11, M3.
- **Files:** modify `backend/prisma/schema.prisma` (`Course.instituteId`, `ClassSession.instituteId`, `ClassSession.roomId`, `TimetableSlot.roomId`; new tenant-owned `Room` with `(organizationId, instituteId, name)` unique, optional advisory `capacity`, `isActive`); modify `backend/src/services/timetable.service.ts` (`assertNoConflict` lines ~71-120: course and teacher conflicts stay, the branch conflict becomes a **room** conflict when the slot has a `roomId` and stays branch-wide when it has none, so a branch with zero rooms behaves as today; `createSlot`, `updateSlot` require a PHYSICAL or HYBRID slot's institute to equal `course.instituteId`; `generateSessions` and `previewGeneration` copy the institute and room onto each session), `backend/src/services/class.service.ts` (course branch editable by `SUPER_ADMIN` and owning `TEACHER`), `backend/src/services/institute.service.ts` (`updateInstitute`: deactivation refused `409` with counts while active courses or slots reference it), new `backend/src/services/room.service.ts`, `controllers/room.controller.ts`, `routes/room.routes.ts` mounted at `/api/rooms` in `backend/src/index.ts` (`SUPER_ADMIN` only); payloads of `listUpcomingSessions` and `listPublicUpcoming` (both in `timetable.service.ts`) and the session list return `institute {name, code, city}` and `room {name}`; frontend class page, timetable page, student schedule, public page show branch and room.
- **Behaviour:** D-STRUCTURE-1. A course is one class at one place; the same subject at two branches is two courses. Backfill derives `Course.instituteId` when all of a course's slots share one institute and prints a report of courses that span several (resolved by the owner, never guessed); sessions get `instituteId` from their slot, else from the course.
- **Settings:** none (room capacity is advisory, warn only).
- **Vitest:** conflict matrix (same room, different rooms, no room versus room, other branch, same teacher, same course); slot institute differs from course institute (409); session copies institute and room; deactivating an institute with active courses; room CRUD by non-owner 403; organization isolation on rooms.
- **Live stack:** create two rooms in one branch, schedule two overlapping classes with different teachers in different rooms (succeeds) and in the same room (409); confirm a student sees branch and room on the class page.
- **Migration:** expand (nullable columns, `Room`), backfill script with report, no contract. **Effort:** M. **Rollback:** columns are nullable; ignoring rooms restores branch-wide conflicts.

## T13: Scanner and manual marking read the session's branch

- **Closes:** F-37 (residual), F-105 (residual), F-116. **Blocked by:** T12, W1-S3.
- **Files:** modify `backend/src/services/attendance.service.ts` (`ensureClassSessionExists` currently selects only `timetableSlot.instituteId`, so a session created without a slot has no branch check; read `ClassSession.instituteId` first and fall back to the slot; `scanBarcode` keeps the `SESSION_INSTITUTE_MISMATCH` rule; `markManualAttendance` gets the same assertion and records `Attendance.instituteId`), `backend/src/services/class-session.service.ts` (`listClassSessions` accepts `instituteId` and `today` filters and returns the institute), frontend `app/(app)/attendance/_components/StaffScanner.tsx` (session list limited to today at the selected branch, defaults to `homeInstituteId`).
- **Behaviour:** the scan and manual paths agree on the branch; online sessions of courses homed at the branch appear in that branch's list. `homeInstituteId` stays a default, never a security boundary (D-STRUCTURE-2).
- **Vitest:** matrix {session with institute, slot-only institute, neither} x {scan, manual} x {same branch, other branch, no institute selected}; `ADMIN` default branch applied; session with no branch skipped by the check only when the course has none either.
- **Live stack:** as front desk at branch A scan into a branch B session (refused) and a manually created session (now refused or allowed per its branch).
- **Migration:** none. **Effort:** S-M. **Rollback:** revert; slot-based check remains.

## T14: Enrollment lifecycle: leave request, end, transfer, rejoin

- **Closes:** F-93, F-65 (transfer half). **Blocked by:** T3, T8.
- **Files:** modify `backend/src/services/enrollment.service.ts` (`cancelEnrollment` is replaced: a `STUDENT` caller sets `dropRequestedAt` and stays active; new `endEnrollment` and `transferEnrollment` for `ADMIN` and `SUPER_ADMIN`, each writing an `EnrollmentEvent`); `backend/src/routes/enrollment.routes.ts` (`DELETE /:id` keeps its path but returns 202 "request recorded" for students; new `POST /:id/end`, `POST /:id/transfer`, `POST /:id/drop-request` with `checkIdempotency`); `backend/src/services/payment.service.ts` (outstanding and arrears use `activatedAt`, an ended enrollment owes nothing after `endedOn`); `backend/src/services/access.service.ts` (ended enrollment loses access at once); frontend `EnrollPanel.tsx` ("Request to leave this class"), a "Leaving requests" list for front desk, a staff move dialog.
- **Behaviour:** D-STRUCTURE-4. Staff end an enrollment with reason and effective date (default today); no automatic refund; unpaid months are shown for information. Transfer ends the source as `TRANSFERRED` and creates or reactivates the target in one Serializable transaction, checks capacity (staff may override), and re-points the current month's SUCCESS payment only when teacher, fee and `CourseTeacherShare` percent for that month are identical (until T31 no share rows exist, so the share condition is treated as equal); a transfer-in is not a joiner. Pause is not a state. `NON_PAYMENT` endings are never automatic: the who-owes list suggests enrollments unpaid for `enrollment.nonPaymentSuggestMonths` and staff end them in bulk.
- **Settings:** `enrollment.studentDropNeedsApproval` true, `enrollment.transferCarriesPaidMonth` SAME_TEACHER_FEE_SHARE, `enrollment.nonPaymentSuggestMonths` 2.
- **Vitest:** actor x action x state (student own versus other student, `TEACHER` 403, `ADMIN`, `SUPER_ADMIN`; active, already ended, not found); transfer with same and different teacher, fee, share; target already paid; capacity on transfer and rejoin; concurrent transfer and end; ended student loses live and recording at once; student request does not end access.
- **Live stack:** request to leave as a student, confirm access remains, confirm the request in the staff list, observe immediate loss of access; transfer between two classes of one teacher and check the payment follows.
- **Migration:** none beyond T2b. **Effort:** M-L. **Rollback:** requests and events are additive; reverting restores immediate student drop.

## T15: Closed dates and visible session cancellation

- **Closes:** F-50, F-45, partly F-48 and F-49. **Blocked by:** T12.
- **Files:** modify `backend/prisma/schema.prisma` (new tenant-owned `ClosedDate`; `ClassSession.closedDateId` (the columns `cancelledAt`, `cancelReason` and `cancelledById` and the front-desk cancel and restore endpoints already exist from Wave 1b Task 13, so this task extends them with closed-date cancellation and the notice); `NotificationType.SESSION_CANCELLED`, own migration); new `backend/src/services/closed-date.service.ts`, controller, `routes/closed-date.routes.ts` at `/api/closed-dates` (`SUPER_ADMIN`; paste-a-list bulk add); modify `backend/src/services/timetable.service.ts` (`generateSessions` and `previewGeneration` skip occurrences on an applicable closed date and report `CLOSED`; an ONLINE slot with no branch is affected only by organization-wide dates, `EXAM_BAN` covers online), `backend/src/services/class-session.service.ts` (new `cancelClassSession` and `restoreClassSession`; `deleteClassSession` stays a soft delete, owner only; routes `POST /api/classes/:classId/sessions/:sessionId/cancel` and `/restore`), `listUpcomingSessions` and `listPublicUpcoming` (in `timetable.service.ts`) and the session list include cancelled sessions with the reason, `attendance.service.ts` and `attendance-reconciliation.service.ts` skip cancelled sessions; frontend Calendar admin page and a Cancelled badge.
- **Behaviour:** D-STRUCTURE-8. Creating a closed date also cancels already generated sessions in range; removing it restores still-future ones; a cancelled session is never regenerated and carries a mandatory reason. Who: `SUPER_ADMIN`, owning `TEACHER` (`assertCourseAccess`), front desk (cancel and restore single sessions only; restoring a closed-date cancellation needs `SUPER_ADMIN`). A cancellation within `calendar.cancelSmsWithinHours` raises one `SESSION_CANCELLED` notification per enrolled, mode-eligible student (in-app always; SMS per T22/T23 setting). Fees are unaffected.
- **Settings:** `calendar.cancelSmsWithinHours` 48, `calendar.restoreSessionsOnClosedDateRemoval` true, `timetable.generateAheadDays` 14 (already registered by Wave 1 Task 12).
- **Vitest:** generation skips by branch scope and online scope; closure cancels existing sessions; removal restores; never regenerated; permissions matrix including the front desk restore refusal; Colombo date edges; cancelled excluded from attendance and from the absence job (T23).
- **Live stack:** add a Poya date as owner, see generated sessions in range become Cancelled for the student and none regenerate after the weekly job (run `worker` manually).
- **Migration:** additive. **Effort:** L. **Rollback:** delete the closed dates and restore sessions; columns nullable.

## T16: End a batch, roll over next year, alumni recording access

- **Closes:** F-97. **Blocked by:** T7, T14, T15.
- **Files:** modify `backend/prisma/schema.prisma` (`Course.endedOn`, `rolledFromCourseId` self relation `Restrict`); `backend/src/services/class.service.ts` (`endBatch`, `rolloverClass`, `reopenClass`, all transactional and audited), `backend/src/routes/class.routes.ts` (`POST /:id/end`, `/rollover`, `/reopen`, owner and owning teacher), `backend/src/services/timetable.service.ts` (bulk deactivate slots), `backend/src/services/access.service.ts` (the alumni branch dormant since T7 becomes live), owner console list "batches to end" (ACTIVE courses whose year is before the current Colombo year), roster "Repeater" badge (derived, no flag).
- **Behaviour:** D-STRUCTURE-6. End batch: confirm with the active enrollment count; set `endedOn`, close enrolments as `BATCH_ENDED` with `recordingAccessUntil = endedOn + batch.alumniRecordingMonths`, deactivate slots, cancel future sessions "Batch ended". Rollover creates a new course (subject, teacher, fee as the first `CourseFee` row, medium, kind, capacity, branch, description), copies slots as **inactive drafts**, copies no students, sessions, recordings, modules, materials, exams, payments or R2 keys, and sets `rolledFromCourseId`. Alumni may stream recordings (not live, scan, exams, downloads) without payment until `recordingAccessUntil`; DROPPED, NON_PAYMENT and TRANSFERRED enrollments get none.
- **Settings:** `batch.alumniRecordingMonths` 3, `batch.rolloverCopiesSlots` true.
- **Vitest:** end-batch effects (enrollments, slots, sessions), reopen inside the window; alumni inside and outside the window, no live or scan, DROPPED none; rollover copies only the allowed fields; teacher cannot end another's batch; archive guard (D-STRUCTURE-5) interplay.
- **Live stack:** end a seeded batch, confirm a former student streams a recording during the window and not after (D3 clock driver), roll over and review draft slots.
- **Migration:** additive. **Effort:** M. **Rollback:** reopen by `SUPER_ADMIN` inside the window; rollover only creates rows.

## T17: Session-scoped substitute teacher **[PRIVATE-DETAIL for host-token scope]**

- **Closes:** F-96. **Blocked by:** D2, T15 (cancel/make-up model), W1-S3.
- **Files:** modify `backend/prisma/schema.prisma` (`ClassSession.substituteTeacherId` relation `SessionSubstitute` `Restrict` indexed, `makeupForSessionId`); new `assertSessionAccess(sessionId, actor)` in `backend/src/services/class.service.ts` beside `assertCourseAccess`, used only by session routes; `backend/src/services/live-class.service.ts` (`scheduleLiveClass` and the host path of `issueLiveClassToken` accept the substitute for that session), `backend/src/services/attendance.service.ts` (manual mark and void for a substitute on that session), `class-session.service.ts` and route `PATCH /api/classes/:classId/sessions/:sessionId/substitute`; frontend timetable "Substitute: name".
- **Behaviour:** D-EXAMS-10. Pool = other TEACHERs of the same subject (`sessions.substitute.sameSubjectOnly`), within `sessions.substitute.maxDaysAhead`; `SUPER_ADMIN` may name any active teacher; effective at once, audited, in-app notice to owner and substitute. Session-scoped only: no exams, marks, payments, income, other sessions, materials or recordings. Income is unchanged.
- **Settings:** `sessions.substitute.teacherMayNominate` true, `sameSubjectOnly` true, `maxDaysAhead` 30.
- **Vitest:** in pool, outside pool, session-scoped only (course routes still 403), other teacher 403, `SUPER_ADMIN` any, host credentials only for that session, clearing, inactive teacher, past session.
- **Live stack:** nominate a colleague, host the meeting as the substitute, confirm course pages still refuse them.
- **Migration:** nullable columns. **Effort:** M. **Rollback:** clear the column; guard is additive.

## T18: Zoom licence concurrency **[PRIVATE-DETAIL]**

- **Closes:** F-56 (capacity half only; the host-credential scope half is unplaced, see companion file). **Blocked by:** D2.
- **Files:** modify `backend/src/services/live-class.service.ts` (`scheduleLiveClass`: overlap query over live sessions of the organization, buffered by `zoom.bufferMinutes`, counted against `zoom.maxConcurrentMeetings`; substitute scheduling goes through the same check), `backend/src/services/timetable.service.ts` (warn, never block, on slots that could go live); frontend session page shows the clash list.
- **Behaviour:** D-OPS-4. `409 ZOOM_CAPACITY` listing the clashing sessions; counted across the organization, not per teacher.
- **Settings:** `zoom.maxConcurrentMeetings` 1, `zoom.bufferMinutes` 15.
- **Vitest:** overlap at cap, buffer edges, cap 2, cancelled sessions ignored, substitute path.
- **Live stack:** schedule two overlapping online sessions with the mock driver.
- **Migration:** none. **Effort:** S. **Rollback:** set the cap high.

---

# Wave 2d: Bank-slip channel

## T19: Staff-approved bank slip

- **Closes:** F-66 (slip half); delivers spec §3. **Blocked by:** T4, T5, T6, W1-S4, D1.
- **Files:** modify `backend/prisma/schema.prisma` (`PaymentMethod.BANK_TRANSFER` and `NotificationType.PAYMENT_SLIP_SUBMITTED`, `PAYMENT_SLIP_REJECTED`, each enum value its own migration first; new tenant-owned `PaymentSlip` per the spec with `approvedReferenceKey`); new `backend/src/schemas/payment-slip.schema.ts`, `services/payment-slip.service.ts`, `controllers/payment-slip.controller.ts`, `routes/payment-slip.routes.ts` mounted at `/api/payments/slips` **before** the `/api/payments` router in `backend/src/index.ts` so `/:id` does not capture it; modify `backend/src/utils/r2.ts` (one `buildSlipObjectKey` helper, the only place a slip key is composed; `createR2PresignedPutUrl`, `r2HeadObject`, `createR2PresignedGetUrl`, `deleteR2Object` exist) so M5 later adds the prefix in one spot; hooks in `payment.service.ts` (`collectEntrancePayment`, `bulkUploadPayments`, the PayHere success path, `overridePayment`) that move open slips to `SUPERSEDED` in the same transaction; new expiry job in `backend/src/worker.ts` (`PENDING_UPLOAD` slips and orphan objects); frontend student upload form on the payment page and staff "Pending slips" queue with the side-by-side viewer.
- **Behaviour:** D-MONEY-6 on top of spec §3: exactly one month of one enrollment at exactly `computeMonthFee`; allowed months current and within `fees.advanceMonthsAllowed`; evidence rules (`transferDate`, `referenceNo`, type, size); one open slip per enrollment-month; approval by `ADMIN` and `SUPER_ADMIN` only (teachers and markers see nothing), in a Serializable transaction, re-checking amount, month state and reference uniqueness within the organization; approval sets method `BANK_TRANSFER`; image access by presigned GET with an audit row and never by SMS; a slip found fake or returned is a `SUPER_ADMIN` `REVERSAL` (T5). Provisional access ships off (`slips.provisionalAccessHours = 0`); when enabled a SUBMITTED slip grants one system `AccessException` (live and streaming only) for an enrollment that paid the previous month, once a month, ended on rejection. Bank details are organization settings (`slips.bankName`, `bankBranch`, `bankAccountName`, `bankAccountNumber`), unset until the owner enables the channel; never in env, constants or the repository.
- **Settings:** `slips.provisionalAccessHours` 0, `slips.maxTransferAgeDays` 45, `slips.maxSizeMb` 8, `slips.approvalSlaHours` 24, `slips.maxRejectionsPerMonth` 3, `slips.requireReference` true, `slips.allowedTypes` jpeg,png,pdf.
- **Vitest:** all of spec §3.6 plus: claimed amount differs from `computeMonthFee`; multi-month and short transfers; racing approve and reject (one wins); racing slips for one month; month settled by each other channel (slip superseded, later approve 409); optional window granted once and revoked on reject; duplicate reference inside and across organizations; stale or future transfer date; oversize or undecodable file removes the object; approval after the student is deactivated; approval of a slip for a month a concession already satisfied; `TEACHER`, `MARKER`, other student 403; image URL audit row.
- **Live stack:** submit a slip as a student through the local storage driver, approve as front desk, confirm the ledger row and gate; submit a second for the same month (409); settle a pending slip by cash and see it superseded.
- **Migration:** enum migrations first, then `PaymentSlip`. **Effort:** L. **Rollback:** `slips.*` unset hides the channel; append-only evidence stays.

---

# Wave 2e: Identity, communication, exams, privacy

## T20: Remove the duplicate results SMS (pull-forward-able)

- **Closes:** F-75. **Blocked by:** none; must precede T22.
- **Files:** modify `backend/src/controllers/submission.controller.ts` (delete `sendResultsSms`, defined at line ~179 and called at ~136 after publish); `backend/src/services/submission.service.ts` `publishResults` already dispatches `RESULTS_PUBLISHED` through `NotificationService` (line ~677).
- **Behaviour:** publishing results creates one in-app notification and at most one SMS, governed by the owner's per-type setting (today a second SMS bypasses the switch).
- **Vitest:** publish dispatches once; SMS disabled in settings sends none; controller no longer imports the SMS service.
- **Live stack:** publish an exam with the log SMS driver on and count worker log lines per student.
- **Migration:** none. **Effort:** S. **Rollback:** revert.

## T21: Guardian record, date of birth, consent, index-number sign-in

- **Closes:** F-98, F-25 (capture). **Blocked by:** M3, W1-S2 (staff registration, field reads).
- **Files:** modify `backend/prisma/schema.prisma` (new tenant-owned `Guardian` with `(organizationId, phone)` indexed, not unique; the migration **copies** the interim `User.guardianName`, `guardianMobile` and `guardianConsentAt` columns added by Wave 1b Task 5 into `Guardian` rows and only then drops them, with a refuse-to-run check that every non-null interim value was copied; `User.dateOfBirth`, `guardianId`, `guardianConsentAt`, `guardianConsentSource`, `guardianConsentNoticeVersion`, `preferredLanguage`; `User.email` nullable for students with a migration `CHECK` that non-student roles require an email; `NotificationType.GUARDIAN_NOTICE`, own migration); new `backend/src/services/guardian.service.ts`, controller, schema, routes under `/api/users/:id/guardian` (front desk and owner); modify `backend/src/services/auth.service.ts` (`register`, `login` accepting email or index number, with a per-identifier plus per-IP limiter in `backend/src/config/rate-limiter.ts`), `backend/src/services/user.service.ts`, `profile.service.ts`, every type that assumes `user.email` is non-null (token issue, `SafeUser`, notifications, PayHere `email`); frontend registration form, staff guardian panel, sign-in field label.
- **Behaviour:** D-IDENTITY-2: a student under `identity.minorAgeYears` needs a guardian with a mobile and a consent record; guardians match by `(organizationId, phone)` so siblings share one row; first link sends one `GUARDIAN_NOTICE` SMS; front desk can mark the guardian opted out; no guardian login. Existing students without a date of birth are treated as minors for SMS and privacy purposes and listed on a "missing details" filter. Dependent on F-15 revocation for any later phone changes.
- **Settings:** `identity.minorAgeYears` 18 (already registered by Wave 1b Task 5), `identity.consentNoticeVersion` 1, `identity.allowIndexNumberLogin` true.
- **Vitest:** age boundary (turns 18 today, leap day); minor without guardian rejected; sibling reuse of one guardian row; opt-out; index-number login throttled per identifier and per IP; emailless student cannot become staff without an email (CHECK); email uniqueness per organization; staff versus student field reads of guardian data; organization isolation.
- **Live stack:** register a minor at the desk, confirm the notice SMS in the worker log, register a sibling with the same phone and see one guardian row, sign in by index number.
- **Migration:** expand (nullable), backfill nothing, CHECK added in the same migration as the nullable email. **Effort:** M-L. **Rollback:** nullable email is reversible while no emailless student exists; consent rows are append-only facts.

## T22: SMS recipients, languages, quiet hours, budget

- **Closes:** F-25 (fan-out), F-122. **Blocked by:** T15, T19, T20, T21.
- **Files:** modify `backend/src/services/notification.service.ts` (`dispatch`: add pure `recipientsFor(type, user, guardian)`), `backend/src/utils/constants.ts` (`NOTIFICATION_TEMPLATES` becomes `{en, si, ta}` per type, every template starts with the institute name, `PAYMENT_CONFIRMED` adds amount and receipt number), `backend/src/services/sms-notification.service.ts` (`renderTemplate`, `sendSms`, `sendBulkSms`: segment guard `sms.maxSegments`, sensitive-body masking), `backend/src/jobs/sms.job.ts` (`processSmsJob`: quiet hours 21:00-07:00 Asia/Colombo by delaying in BullMQ, urgent exemptions), `backend/src/services/notification-setting.service.ts` (seed defaults: SMS on for `PAYMENT_CONFIRMED`, `FEE_CHANGED`, `GUARDIAN_NOTICE`; new types off; the existing `RESULTS_PUBLISHED` and `PAYMENT_OVERRIDDEN` keep their current setting), a monthly budget guard that **counts `SmsLog` rows in the database** (no hand-built Redis key before M5); extend `SmsPanel.tsx` with the budget view (F-120), notification settings page.
- **Behaviour:** D-IDENTITY-3: money and absence events go to the guardian for minors with a non-opted-out guardian, otherwise to the student; class-operational events go to the student; no marks, rank or other families' amounts in any SMS; one SMS per event type per recipient phone per day listing up to three names; at 100% of `sms.monthlyCap` only `PAYMENT_CONFIRMED` and security codes still send. Sinhala and Tamil templates go live per type only after a native-speaker proofread (person-days, not code).
- **Settings:** `sms.monthlyCap` 6000, `sms.budgetAlertPercent` 80, `sms.quietHours.start` 21:00, `sms.quietHours.end` 07:00, `sms.urgentWithinHours` 12, `sms.maxSegments` 2, `sms.defaultLocale` = `Organization.locale`, `sms.groupSiblingsByPhone` true, `sms.guardianResultsNotice` false, `sms.template.sensitiveMasking` true.
- **Vitest:** `recipientsFor` table (type x minor, adult, no guardian, opted-out guardian); quiet-hours hold versus exempt; grouping by phone; segment cap truncates variables; missing translation falls back to English; budget at 80% and 100%; masking of codes in `SmsLog`; disabled type sends in-app only.
- **Live stack:** with the log driver send each event type for a minor and an adult, check recipient, language and the 07:00 hold (D3 clock driver).
- **Migration:** one enum migration at the start of this task adds **all** remaining D-OPS-2 `NotificationType` values except `FEE_DUE` (listed in T23; `FEE_DUE` exists from Wave 1 Task 5) so T23 only dispatches; `FEE_CHANGED`, `PAYMENT_REVERSED`, `GUARDIAN_NOTICE`, `SESSION_CANCELLED` and the slip values already exist from T4, T5, T21, T15 and T19. **Effort:** M. **Rollback:** per-type switches and settings; templates are constants.

## T23: Event catalogue and schedulers

- **Closes:** F-76, F-72, F-51. **Blocked by:** T15, T22, W1-S3; the online-session absence rule waits for T24; until T24 ships, no absence SMS is sent for ONLINE sessions.
- **Files:** the `NotificationType` values `REFUND_PROCESSED` (doc 19 D-OPS-2 calls it `REFUND`; this plan's name is the enum value), `ABSENCE`, `SESSION_RESCHEDULED`, `EXAM_SCHEDULED`, `EXAM_REMINDER`, `EXAM_EXTENSION_GRANTED`, `RESULTS_UPDATED`, `RESULT_CORRECTED`, `MARKING_ASSIGNED`, `PAYMENT_REQUEST_DECIDED`, `ACCESS_EXCEPTION` are created by T22's enum migration; modify `backend/src/utils/constants.ts` templates, dispatch from the existing mutation points (`class-session.service.ts`, `timetable.service.ts`, `exam.service.ts` `createExam`, `marker-allocation.service.ts`, `payment-adjustment.service.ts` `refundPayment`, `payment.service.ts` `overridePayment`), new `backend/src/jobs/absence.job.ts` and `exam-reminder.job.ts`, queue constants and registration in `backend/src/worker.ts`; (manual fee reminders and their settings shipped in Wave 1 Task 5).
- **Behaviour:** D-OPS-2. In-app always; SMS per type per organization; absence SMS only when the session has at least one scan row, the student has an active enrollment whose mode includes the session channel, the row is not EXCUSED, PARTIAL or voided, after the live reconcile for online sessions (T24), held to 07:00 inside quiet hours; one exam reminder job a day before. All schedulers are BullMQ.
- **Settings:** `notifications.absenceDelayMinutes` 120, `notifications.absenceMode` EVERY_ABSENCE, `notifications.examReminderHoursBefore` 24, (`fees.reminderFromDay`, `fees.reminderMaxPerStudentPerMonth` and `fees.autoReminderEnabled` already registered by Wave 1 Task 5).
- **Vitest:** absence matrix (unscanned session sends nothing; EXCUSED, PARTIAL, voided, mode mismatch, cancelled session skipped); quiet-hours hold; reminder cap per student per month; disabled type is in-app only; jobs idempotent across two runs.
- **Live stack:** run a session with two scans and three enrolled students, advance the D3 clock driver past the delay, read the worker log.
- **Migration:** none (enum values come from T22). **Effort:** L. **Rollback:** disable the types; jobs are repeatable and can be removed.

## T24: Automatic live attendance by connected time **[PRIVATE-DETAIL]**

- **Closes:** F-14, F-40, F-111. **Blocked by:** D2, W1-S3, T3.
- **Files:** modify `backend/src/services/attendance-reconciliation.service.ts` (extract the preview builder as an actor-free `buildPreview(sessionId)` so the job and the staff action share it; `previewZoomAttendance` and `reconcileZoomAttendance` keep their actor and call it), `backend/src/utils/attendance-reconciliation.ts` (one shared matcher; sum join segments), `backend/src/utils/zoom-attendance.ts`, `backend/src/services/attendance.service.ts` (`handleZoomWebhook` stops writing attendance on join; handles `meeting.ended`), new `backend/src/jobs/attendance.queue.ts` plus a processor in `backend/src/worker.ts` (delayed job 10 minutes after `meeting.ended`, fallback at scheduled end plus 45 minutes, job id = session + phase, 3 retries on `ZOOM_ATTENDANCE_NOT_READY`), `backend/src/routes/attendance.routes.ts` (front desk read-only results), frontend `ZoomReconciliationPanel.tsx` (minutes, credited name, Accept, Map).
- **Behaviour:** D-ACCESS-6: a join is not attendance; connected time is the sum of segments capped at the scheduled duration; at or above `attendance.live.minPercent` PRESENT (LATE after the scan-window lateness setting), else PARTIAL with an Accept action; only students whose mode allows live are credited; unmatched rows can be mapped by staff. Verify Zoom field behaviour on the staging account before marking done.
- **Settings:** `attendance.live.minPercent` 50, `attendance.live.reconcileDelayMinutes` 10, `attendance.live.reconcileFallbackMinutes` 45.
- **Vitest:** segment summing, 49/50/51 percent, late flag, matcher cases per D-ACCESS-6 (unmatched, ineligible mode, staff participants), idempotency of both job phases, not-ready retry, cancelled session.
- **Live stack:** mock driver participant report with reconnects; then one real staging meeting.
- **Migration:** none beyond W1-S3. **Effort:** M. **Rollback:** disable the job; manual reconcile remains.

## T25: Recording-watch attendance

- **Closes:** F-24. **Blocked by:** T7, W1-S3, D-video.
- **Files:** new tenant-owned `RecordingView` model; modify `backend/src/services/video.service.ts` (`generateStreamUrl` writes a row on every student token issue), `backend/src/services/attendance.service.ts` (`markVideoAttendance` at line ~262 rewritten with the five checks and the shared `recordAttendance` writer), `backend/src/services/enrollment.service.ts` unaffected, frontend source label "Recording".
- **Behaviour:** D-ACCESS-7: counts only for ONLINE enrollments, source VIDEO at lowest precedence, needs a fresh `RecordingView`, an ended session, `attendance.recording.minWatchPercent` of wall-clock time elapsed, current coverage via `isStudentCovered`, and within `attendance.recording.countWithinDays`.
- **Settings:** `attendance.recording.countsAsPresent` ONLINE_ONLY, `minWatchPercent` 50, `countWithinDays` 7, `viewFreshnessHours` 6.
- **Vitest:** each condition failing in turn, ONLINE versus PHYSICAL versus HYBRID, future session, stronger source not overwritten, fast claim refused.
- **Live stack:** stream a local-driver recording, claim early (refused) and after the elapsed time (counted).
- **Migration:** additive. **Effort:** M. **Rollback:** `countsAsPresent = NEVER`.

## T26: Publish checks, unpublish, per-student extensions, late work

- **Closes:** F-126, F-71. **Blocked by:** T22 (notification type values), W1-S4 (D-EXAMS-3).
- **Files:** modify `backend/prisma/schema.prisma` (`Exam.publishedAt`, `publishedById`, `unpublishedAt`; `Submission.isLate`; new tenant-owned `ExamStudentWindow` with `(organizationId, examId, userId)` unique; `NotificationType` values from T22); new `backend/src/services/exam-results.service.ts` (publish with the ungraded count and `confirmUngraded`, unpublish, re-publish, first-marking exception) and `backend/src/services/exam-window.service.ts` (`effectiveEnd`, grant, revoke, all behind `assertCourseAccess`); modify `backend/src/services/submission.service.ts` (`publishResults` ~631, `correctPublishedResult` ~693, `startSubmission` ~184, `completeSubmission` ~337: start and complete use the effective end, the 60 second grace already became `exams.uploadGraceSeconds` in Wave 1 Task 13), `backend/src/routes/submission.routes.ts` (`POST /exam/:examId/unpublish` with `checkIdempotency`), `backend/src/routes/exam.routes.ts` (`POST` and `DELETE /api/exams/:id/extensions`); frontend "Give more time", publish confirmation, unpublish dialog.
- **Behaviour:** D-EXAMS-4 and D-EXAMS-5: `UNGRADED_SUBMISSIONS` confirm gate; owning teacher unpublishes within `exams.results.unpublishWindowHours`, `SUPER_ADMIN` any time, reason required, never reopens sitting; re-publish notifies only changed students; extension is an individual end time with a reason, at most `exams.extension.maxDaysPastEnd`, refused after publish, publish blocked while one is open; late sittings are flagged, not penalised, and ranked normally when an extension was granted.
- **Settings:** `exams.publish.ungradedPolicy` WARN, `exams.results.unpublishWindowHours` 72, `exams.results.republishNotifyChangedOnly` true, `exams.extension.maxDaysPastEnd` 7, `exams.extension.requireReason` true, `exams.late.includeInRank` true (`exams.uploadGraceSeconds` already ships in Wave 1 Task 13).
- **Vitest:** confirm gate; window edge for teacher versus owner; markers locked then unlocked; notify only changed students; first-mark exception needs no reason; extension cap, after publish, revoke, publish blocked, other teacher 403; late flag; effective end used by start and complete (not `isPublished`).
- **Live stack:** extend one student, sit after the original end, publish refused until revoked or used, unpublish and re-publish.
- **Migration:** additive. **Effort:** M-L. **Rollback:** nullable columns; windows fall back to `exam.endTime` when empty.

## T27: Results sheet, own-rank setting, progress

- **Closes:** F-73, F-102. **Blocked by:** T26.
- **Files:** `backend/src/services/exam-results.service.ts` (class sheet and statistics, computed on read), new `backend/src/services/progress.service.ts`, routes `GET /api/exams/:id/results` (owning teacher and `SUPER_ADMIN`, CSV audited), `GET /api/classes/:classId/students/:userId/progress` and a student route for own progress (the decision text `/me/progress` has no matching router prefix; settle the path in the endpoint doc), `submission.service.ts` student result adds average and optional rank.
- **Behaviour:** D-EXAMS-6: competition ranks, absent versus zero, student visibility `exams.results.studentVisibility` MARKS_AND_AVERAGE by default, own rank only when allowed, no named leaderboards (`exams.results.namedLeaderboards` fixed false).
- **Vitest:** ties, absent versus zero, ungraded excluded, small-class average suppressed, markers and front desk refused, own rank only, unpublished invisible, other teacher 403.
- **Live stack:** publish, compare student, teacher and owner views. **Migration:** none. **Effort:** M. **Rollback:** setting back to MARKS_ONLY.

## T28: Retention, anonymisation, erasure requests

- **Closes:** F-99. **Blocked by:** T21, W1-S2 (NIC purge), T25 (`RecordingView`).
- **Files:** new tenant-owned `DataSubjectRequest`; new `backend/src/jobs/retention.job.ts`, `backend/src/services/anonymise.service.ts`, `data-subject-request.service.ts`; `POST /api/users/:id/erase` and an export endpoint (`SUPER_ADMIN`, step-up password); `backend/src/utils/r2.ts` `deleteR2Object` for scripts and slips; worker registration.
- **Behaviour:** D-IDENTITY-9: job ships `REPORT_ONLY`, then `ENFORCE`; dormant students anonymised after the notice period; financial, attendance, enrollment and mark rows survive; log tables purged or masked by their settings; erasure refused while an active enrollment or PENDING payment exists; after any restore the erasure ledger and job are re-run. **The decision cites an "F-81 immutability trigger" on `AuditLog` that does not exist yet (F-81 is open and unplaced): no migration relaxing it is needed now, and if F-81 lands first it must exempt exactly the IP and user-agent columns.** This is the documented exception to soft-delete-only in `CLAUDE.md`.
- **Settings:** all `retention.*` keys and `dsar.responseDays` per D-IDENTITY-9.
- **Vitest:** active-enrollment refusal, placeholder collisions on unique columns, guardian shared by siblings kept, idempotent re-run, REPORT_ONLY writes nothing, post-restore re-apply, step-up required, organization isolation.
- **Live stack:** run REPORT_ONLY against a copy of the live data and review counts (never committed); anonymise one test student end to end.
- **Migration:** additive. **Effort:** M-L. **Rollback:** periods are settings; an anonymisation is irreversible by nature and gated by REPORT_ONLY, the notice window and owner visibility.

## T29: Teacher exit checklist

- **Closes:** F-101. **Blocked by:** T16, W1-S2 (handover guard); the final-statement line appears once T31 exists.
- **Files:** `backend/src/services/user.service.ts` (`getTeacherExitChecklist`), route `GET /api/users/:id/exit-checklist` (`SUPER_ADMIN`), runbook in `context/documents/10-maintenance-guide.md`.
- **Behaviour:** D-IDENTITY-11: one call lists courses, open exams, results to publish, sessions, final statement and the revoke list; deactivation stays gated by the W1-S2 handover guard.
- **Vitest:** actor matrix (`ADMIN` and `TEACHER` 403, `SUPER_ADMIN` allowed), teacher with and without courses, not found, non-teacher target. **Live stack:** run for a seeded teacher. **Migration:** none. **Effort:** S. **Rollback:** read-only endpoint.

---

# Wave 2f: Teacher authority and income

## T30: Capped teacher requests for concessions, waivers, refunds, fee changes

- **Closes:** F-125, F-110 (teacher half), F-126 money edge. **Blocked by:** T4, T10, T14.
- **Files:** modify `backend/prisma/schema.prisma` (new tenant-owned `PaymentRequest` and `TeacherMoneyLimit`); new `backend/src/services/payment-request.service.ts` (cap evaluation in a Serializable transaction under a per-teacher `withAdvisoryLock`; `assertCourseAccess` on reads and writes; `Idempotency-Key`; audit; notifications), `controllers/payment-request.controller.ts`, `routes/payment-request.routes.ts` at `/api/payment-requests`; executors reuse `concession.service.ts`, `refundPayment`, `overridePayment` and the `CourseFee` write; frontend teacher "Request" screens, owner approval queue in the F-127 console, `TeacherMoneyLimit` screen.
- **Behaviour:** D-MONEY-9. Types CONCESSION, WAIVER, REFUND, CORRECTION, FEE_CHANGE with a reason of at least `requests.minReasonLength`. Auto-approval only for concessions and current-month waivers inside the standing cap (monthly discount value and card count of the teacher's active teacher-granted concessions); shipping caps are zero so everything queues. **Refunds are never auto-approved or auto-executed**: the teacher files, the owner approves and executes through `POST /payments/:id/refunds` (this resolves the contradiction in doc 18 F-125 and doc 17 §12 in favour of owner-only execution). Requests expire after `requests.expiryDays`. A teacher never approves their own request above the cap, never acts on another teacher's course, never sees slips or others' money; front desk gains nothing; no request touches a `SUPER_ADMIN` or peer `ADMIN`.
- **Settings:** `teacherMoney.capAmount` 0, `teacherMoney.capCount` 0, `teacherMoney.maxMonths` 3, `teacherMoney.waiverMaxMonthsBack` 1, `requests.minReasonLength` 10, `requests.expiryDays` 14.
- **Vitest:** cap boundary (at cap, one rupee over), concurrent grants at cap minus one (only one fits), expiry, other teacher 403, self-approval above cap refused, refund request changes nothing until the owner executes, front desk and marker 403, previous-month waiver never auto-approved, reason too short, duplicate idempotency key, `SUPER_ADMIN` and peer-admin targets refused.
- **Live stack:** with caps raised for one teacher, file a concession inside and above the cap and a refund request; execute the refund as owner and check the ledger.
- **Migration:** additive. **Effort:** L. **Rollback:** caps back to zero queues everything; tables are additive.

## T31: Teacher shares and month-end statements

- **Closes:** F-91, F-79. **Blocked by:** T4, T10, T30; T14 for the transfer share condition.
- **Files:** new tenant-owned `CourseTeacherShare`, `TeacherStatement`, `TeacherStatementLine`, `TeacherPayout`; new `backend/src/services/teacher-settlement.service.ts` (draft, finalise Serializable, CSV), owner and teacher routes at `/api/teacher-statements`; the W1-S2 hand-over now also writes a `CourseTeacherShare` row effective per `handover.defaultEffectiveMonth`; the income reports in `payment.service.ts` (`getFinancialReport`) switch from the course's current teacher to the share holder for the payment month (F-79).
- **Behaviour:** D-MONEY-8. The system computes and records; it never moves money. No default share percentage (`statements.suggestedSharePercent` unset); a statement cannot finalise while any course in it lacks a share row; bearer rules (owner-granted concessions INSTITUTE by default, teacher-granted SHARED, proration SHARED, refunds and reversals SHARED unless marked institute error); basis is every SUCCESS payment with `paymentMonth` up to the statement month plus adjustments not yet in a FINAL statement, keyed by `P:<paymentId>` or `A:<adjustmentId>`; FINAL statements never change; teachers see only FINAL statements with a per-student drill-down that hides phone, NIC and concession reasons.
- **Settings:** `statements.suggestedSharePercent` null, `statements.concessionBearerOwnerGranted` INSTITUTE, `statements.concessionBearerTeacherGranted` SHARED, `statements.refundBearerDefault` SHARED, `statements.closeDay` 5, `statements.visibleToTeacher` FINAL_ONLY, `statements.payoutRecordingEnabled` true.
- **Vitest:** bearer matrix, late payment appears once, FINAL immutable, finalise blocked with a missing share, co-teacher sum at most 100, teacher reads only own FINAL statements, drill-down hides phone, NIC and reasons, hand-over attribution across the cut-over month, trial excluded.
- **Live stack:** close a month for two teachers, hand over a course mid-year, compare statements.
- **Migration:** additive. **Effort:** L. **Rollback:** advisory tables; deleting a DRAFT is safe, FINAL stays.

---

# Wave 3 outline (not specified here)

- Remaining mediums and lows of doc 18 not placed above: F-48/F-49 slot-change propagation to generated sessions, F-57 Zoom propagation of session edits, F-87 and F-90 exam accessibility (F-86 is closed by Wave 1 Task 14), F-68 scoped-exam frontend, F-70 HYBRID MCQ marks, F-74 anonymised marking, F-80 audit filters, F-81 immutable audit trail, F-85 pending-payment polling, F-89 zero-enrollment guidance, F-112 limiter placement, F-113 participant-report cap, F-115 front-desk screens, F-117 code normalisation (also in W0 resolver), F-119/F-124 role-specific screens, F-120 (SMS panel lands in Wave 1 Task 16; T22 only adds the budget view), F-121 security-event audit, F-123 exam, session and recording edit UI.
- **Unplaced by the decision set, flagged:** F-16 (proposed W0) and the credential-scope half of F-56 (proposed early Wave 3); see the companion file.
- Gate: a Vitest matrix for every new guard (`04-ai-workflow-rules.md` §3.4) and the M6 isolation suite before any second organization.

---

# Definition of Done (every task)

1. Behaviour change matches the task text and the decision it cites; settings default to the doc 19 value and each task names the restore-today value; every number is a registry key.
2. Vitest cases listed in the task plus the actor x target x organization matrix pass; `npm run lint`, `npx tsc --noEmit`, `npm run test` green in `backend/`; frontend `npm run lint`, tests and `npm run build` green when the PR touches it.
3. Migrations proven on a fresh database and an upgrade from the previous head, zero drift, tenant integrity check green; irreversible steps have their refuse-to-run check and a recorded pre-run backup.
4. Live-stack verification done on the Compose stack with the named roles; the observed results are summarised in the PR body.
5. Security-class details stay out of the repository (companion file); no secret, credential, real phone number or student data in code, tests, fixtures or PR text.
6. Conventional Commit PR title, squash-merged into `dev` after green `Quality Gate` and review, branch deleted, no attribution lines.
7. **Docs updated in the same PR**, never as a follow-up:
   - `context/api_endpoints/*.md` for every changed endpoint: `payments`, `enrollments`, `classes`, `timetable`, `institutes`, `subjects`, `attendance`, `video`, `live-class`, `exams`, `submissions`, `notifications`, `users`, `auth`, `account-setup`, `audit` as touched.
   - `context/documents/06-progress-tracker.md` (task status), `13-product-roadmap.md` (phase and wave status), `15-requirements-traceability.md` (status of each R-id the task touches: R-PAY-04, R-PAY-07, R-PAY-08, R-PAY-10, R-PAY-12, R-PAY-13, R-STU-01, R-STU-02, R-STU-04, R-USR-02, R-ATT-03, R-ATT-05, R-ATT-06, R-ATT-07, R-NTH-06, R-OPS-03, R-NFR-08, R-NFR-09, R-COM-05, R-LOC-01), `17-roles-permissions-and-flows.md` (matrix, §5 gate table, §7 waves, §9 decided items, §12 privileges), `18-flow-audit-findings-register.md` (status of every F-id the task closes, Checked column, and the table in this plan's coverage section), plus `02-architecture.md` (§7.1 gate), `08-database-design.md` (every new model and column), `14-multi-tenancy-readiness.md` (registry list, §11 note), `16-local-development.md` (D1, D2, D-video rows), `10-maintenance-guide.md` (runbooks), `12-data-backup-and-recovery.md` (merge and erasure restore notes).
   - `docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md` for T2-T10 and T19 (move sections from "proposed" to "implemented").
   - `CLAUDE.md`: remove the matching "Known gaps" entries (F-04, F-05, F-23) only in the PR that actually closes them, update the tenancy paragraph at M3, and add `assertSessionAccess` and the settings registry after T17 and W1-S1.
