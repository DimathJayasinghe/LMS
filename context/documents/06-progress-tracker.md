# 06 — Progress Tracker

> The living document. Updated after every task. Allows the agent to pick up exactly where it left off.

---

## Current Status

| Field | Value |
|-------|-------|
| **Current Phase** | Shared/separate exam and customizable marking design; Phase E implementation pending |
| **Last Updated** | 2026-09-06 |
| **Last Completed Task** | Owner approved the shared/separate exam and customizable marker-access design. |
| **Next Task** | Write the phased implementation plan, then deliver small tested slices; role-dashboard integration audit follows exam/marking work. |
| **Blockers** | No design blocker; provider/deployment/recovery and retention requirements remain release gates. |

### 2026-09-06 — Configurable exam scope and dashboard follow-up

- [x] Owner confirmed shared AND separate exam instances, teacher-selected centers/grouped centers/online students, and optional teacher-configured marker restrictions inside shared instances.
- [x] Owner approved the [customizable exam-marking design](../../docs/superpowers/specs/2026-09-06-customizable-exam-marking-design.md), separating paper reuse, exam audiences, student roster and effective marker access. No new behavior/schema is implemented in this design checkpoint.
- [x] PR #79 remains open, independently reviewed and green in GitHub CI. Its 295-backend/105-frontend tests and 21 compiled-stack assertions are evidence for that patch, not for this planned feature or current `dev`. Its Docker verification supersedes the earlier unavailable-daemon checkpoint.
- [ ] Land PR #79 and deliver the approved feature as small tested migration/API/UI slices. Preserve both branches and reconcile tracker updates when integrating.
- [ ] After the current exam/marking work, [issue #81](https://github.com/DimathJayasinghe/LMS/issues/81) covers all five role dashboards: real backend wiring, correct privileges, navigation, loading/error/empty states and end-to-end outcomes. Sparse dashboards do not justify copying another role's privileges.
- [ ] Separate results-SMS duplication/settings bypass is tracked in [issue #80](https://github.com/DimathJayasinghe/LMS/issues/80).

### 2026-09-06 — Production delivery baseline

- [x] Added [`docs/plans/2026-09-06-production-delivery-baseline.md`](../../docs/plans/2026-09-06-production-delivery-baseline.md): source/GitHub evidence, unresolved decisions, delivery sequence, release gates, and verification limits.
- [x] Created [GitHub delivery issue #77](https://github.com/DimathJayasinghe/LMS/issues/77) to track decisions, Phase E slices, and release safeguards.
- [x] Verified remote `dev` at `8fcd988` and green CI run `32581060718`; opened a task branch from that baseline.
- [x] Identified conflicting owner-input history in open PR #72: 500-student MVP/Zoom deferred/Bunny-R2 working versus newer 1,200-student/provider-readiness claims. Treat provider state as unverified until staging evidence exists.
- [x] Verified both integration/production branches lack branch protection and the repository has no rulesets; recorded release safeguard work.
- [x] Verified forensic gaps in source: ordinary audit writes are non-blocking; only `PaymentAdjustment`, not `AuditLog`, has a checked-in immutability trigger.
- [x] Local baseline: frontend 105/105 tests; backend 271/271 after regenerating a stale Prisma client. Both linters/typechecks and backend production build pass; frontend build verification is recorded in the delivery baseline.
- [ ] Owner scope/policy answers, fresh compiled-stack smoke and migration/recovery proof remain outstanding. No Phase E production behavior or database schema changed in this checkpoint.

### 2026-08-22 — Phase E planning checkpoint

- [x] Captured the current exact-marker authorization behavior and the role/ownership boundaries that
  must remain invariant.
- [x] Designed incremental slices for reusable groups, immutable membership history, assignment
  preview/workload, atomic exam-specific snapshots, group UI, and guided exam authoring.
- [x] Documented security/ethics constraints, mandatory tests, production-Docker gates, deferrals, and
  the exact resume point in
  [`docs/plans/2026-08-22-phase-e-marker-groups-exam-workflow.md`](../../docs/plans/2026-08-22-phase-e-marker-groups-exam-workflow.md).
- [ ] Phase E implementation has not started; begin with Slice E1 tests and migration design.

### 2026-08-20 — Teacher/student academic workspace completed

- [x] `SubjectTeacher` assignments let only SUPER_ADMIN approve teachers per subject; an assignment cannot be removed while that teacher owns a class in the subject.
- [x] TEACHER class list/detail/create/edit is ownership-scoped; SUPER_ADMIN can reassign a class only to a teacher approved for the selected subject.
- [x] Teacher session and video workflows are exposed from the owned-class UI and all consequential mutations emit audit events.
- [x] Teachers/SUPER_ADMIN replace an exam's exact marker set from the marking workspace; MARKER grading locks after publication.
- [x] Published results can be corrected only by the owning TEACHER or SUPER_ADMIN, require a reason, and log before/after values.
- [x] STUDENT classes distinguish current enrollments from discovery and show new READY recordings plus upcoming sessions; visiting a course advances a persisted per-course seen marker.
- [x] Added focused backend/frontend authorization and interaction tests. Full verification: backend 225 tests, frontend 93 tests, lint/type/build green, fresh and upgrade PostgreSQL paths at zero drift, authenticated compiled-stack smoke green.
- [x] Dependency hardening: Next 16.3.1, Prisma 7.9.1, Sentry 10.70, Multer 2.2, vulnerable `xlsx` replaced, backend/frontend full npm audits at zero known advisories.

### 2026-08-20 — Financial scope correction and full-system gap audit

- [x] Teachers can open Financial reports and see collected/outstanding aggregates only for owned classes; individual student payment histories are not returned.
- [x] SUPER_ADMIN can filter financial aggregates by teacher and class and receives a by-teacher breakdown.
- [x] Backend scope ignores a teacher-supplied `teacherId` and combines class filters with authenticated ownership; focused service and frontend role-scope tests cover this behavior.
- [x] Closed the core `assertStudentContentAccess` direct-test gap with privileged-bypass, enrollment, unpaid, and paid-path coverage.
- [x] Production log review found Pino exposing response `Set-Cookie` values; response-cookie redaction and a regression test were added, and the affected smoke refresh session was revoked.
- [x] Added `docs/reports/2026-08-20-full-system-gap-analysis.md` covering authorization ethics, media dimensions, materials/live/exam/marker-group usability, fairness/privacy/security gaps, and phased delivery/production-Docker gates.
- [x] Production-Docker verification: backend 233/233 (31 files), frontend 95/95 (24 files), both production builds and linters green, both dependency audits at zero known vulnerabilities, live migration status/zero drift green, all Compose services healthy, and authenticated SUPER_ADMIN/TEACHER plus negative-role report/UI smoke green.
- [x] Credential-log production proof: login/logout produced two redacted `Set-Cookie` log events, zero raw token-bearing log lines, and logout left zero smoke refresh sessions.
- [x] Remote CI exposed and fixed a flawed legacy-adoption simulation: it no longer `db push`es the current schema before deploying additive migrations; it builds the historical baseline from the first two SQL files, records those two as applied, then proves the later migrations and zero drift.

### 2026-08-20 — Secure class banner and backdrop uploads

- [x] Removed arbitrary image URL input from class create/update; only a server-issued, course-bound public-R2 key can become a displayed URL.
- [x] Added owning-TEACHER/SUPER_ADMIN presign, confirm, and idempotent remove endpoints with audit actions for authorization, attachment, and removal.
- [x] Confirmation enforces an 8 MB stored-object cap, MIME agreement, patched Sharp/libvips full decoding with a pixel limit, and exact 1600×600 banner / 1920×1080 backdrop dimensions; invalid and replaced tracked objects are deleted best-effort.
- [x] Added migration-backed object-key lifecycle fields and accessible alt-text fields while retaining existing legacy URLs until replacement/removal.
- [x] Class edit now provides dimension guidance, format/size checks, preview, accessible description, replace, and remove controls; class creation explains that images are added after creation.
- [x] Production-Docker verification passed: backend 248/248 (33 files), frontend 99/99 (25 files), both production builds/linters and live npm audits green, live + disposable-fresh migration paths at zero drift, and all Compose services healthy. Authenticated live R2 smoke covered exact-size upload/public preview/alt edit/remove, wrong-size rejection/deletion, strict URL rejection, unauthenticated denial, teacher cross-class denial, SUPER_ADMIN bypass, and audit records. Headless Chromium confirmed one visible form with both dimension guides, two accessible descriptions/file pickers, no legacy URL field, and no page errors; all smoke sessions and objects were cleaned up.
- [x] Concurrent replace/remove/alt writes use optimistic compare-and-update. A stale confirmation deletes its own upload and returns `409 COURSE_ASSET_CHANGED` rather than overwriting the newer image or leaving that upload orphaned.

### 2026-08-21 — Private course modules and downloadable materials

- [x] Owning TEACHER/SUPER_ADMIN can create, order, edit, publish/schedule, and soft-remove modules; ADMIN/MARKER are explicitly denied.
- [x] Private PDF/JPG/PNG/WebP uploads use course/module-bound randomized R2 keys, a 25 MB bound, decoded content verification, safe filenames, and invalid/removal cleanup.
- [x] Enrolled students list only released published modules; download issuance repeats current-month payment access and returns a 15-minute attachment URL without exposing object keys.
- [x] Class detail provides module creation/publish/remove, material upload/remove, and one-click authorized download; all lifecycle actions and downloads are audit-filterable.
- [x] Production-Docker verification: backend 256/256 (34 files), frontend 102/102 (26 files), both builds/linters green, fresh six-migration path at zero drift, and live Compose healthy. Authenticated SUPER_ADMIN smoke covered real private-R2 PDF upload/confirm/publish/download/removal, unauthenticated 401, audit creation, rendered staff controls, log review, and session/object cleanup.

### 2026-08-21 — Timetable and embedded live-class unification

- [x] SUPER_ADMIN/ADMIN see all recurring schedules; TEACHER sees owned active/inactive slots;
  STUDENT sees only active slots and dated sessions for enrolled matching cohorts; MARKER is denied.
- [x] Recurring slot create/edit/disable/restore rejects same-course, same-teacher, and same-institute
  overlaps and prevents cross-midnight schedules.
- [x] Staff preview a bounded date range before idempotently generating; teacher preview/generation
  remains server-scoped to owned courses.
- [x] Timetable slots and generated sessions no longer accept/copy/expose reusable Zoom links.
  Online occurrences use the existing audited embedded schedule/start/join flow.
- [x] ADMIN/MARKER live-token access is explicitly denied, and meeting scheduling plus all timetable
  mutations require replay-safe idempotency keys.
- [x] Production-Docker verification passed: backend 271/271 (35 files), frontend 105/105
  (27 files, constrained to two workers on this host), both production builds/linters and live npm
  audits green, six migrations current, and live schema drift zero. The compiled Compose smoke covered
  SUPER_ADMIN/TEACHER/STUDENT login, ephemeral MARKER denial, scoped reads, student session-credential
  redaction, slot create/conflict/disable, preview, audit creation, SSR timetable controls, no raw Zoom
  URL, log review, and fixture cleanup.
- [ ] Real Zoom provider scheduling remains blocked on non-placeholder Server-to-Server OAuth and
  Meeting SDK credentials; production smoke verifies the safe failure path but cannot prove provider success.

> **2026-07-10 reality-check pass.** This tracker had drifted significantly behind the actual
> code — most of Phase 7 (admin dashboard) and Phase 8 (student dashboard) frontend work was
> already built (exam-taking, marking, payments, attendance, timetable, live classes, video
> player) but never checked off here. Verified against `frontend/app/` directly and re-marked
> below. Two genuinely missing frontend pieces found: an **audit log viewer** and a **notification
> bell** (backend SSE/audit endpoints exist; no frontend consumer). See `CLAUDE.md` for the
> standing note that `context/` docs drift from code — this file is no exception.

> **2026-07-15 gap-audit pass.** Full re-verification against real code (not assumed from this
> file) across backend, frontend, and security/testing/ops. Confirmed shipped since 07-10:
> payments UI, admin subjects/institutes, staff attendance scanner, PayHere onsite checkout,
> secure Bunny playback (DRM/token/webhook fixes), recorded-video watch-attendance, financial
> reports, upload-integrity confirm-step, profile edit + credential management, and pay-at-entrance
> + receipts. **Confirmed still-open** (verbatim from 07-10, re-checked against code, not just this
> doc): QR-vs-wedge attendance `source` tagging and institute-context barcode resolution (both
> fixed 2026-08-13) in the
> *attendance* scan endpoint specifically (the new payments barcode-resolver exists but attendance
> scanning doesn't call it), payment override UI (fixed 2026-08-19), `BUNNY_API_KEY` still a malformed GUID in `.env`,
> no attendance-sync/reconciliation button (fixed 2026-08-17), no Redis caching on result reads, only reactive (not
> proactive) token refresh, no multipart/refresh-on-expiry for slow R2 uploads, TEACHER course
> create/edit + timetable-slot authoring UI, all of Phase 9's frontend polish items, TEACHER/MARKER
> attendance view (`ComingSoon`), timetable's raw `zoom.us` link, and SSE listeners for
> `RESULTS_PUBLISHED`/`TIMETABLE_UPDATED`/`EXAM_CONTROL`. **Newly found this pass** (not previously
> documented anywhere): `assertCourseAccess` missing from 8 read paths letting any TEACHER view
> another teacher's exam/video/submission/session content (spec written, see above); a hard
> `prisma.timetableSlot.delete()` despite an inbound FK and an unused `isActive` column, violating
> the soft-delete invariant; `PATCH /payments/:id/override`, `POST /payments/bulk-upload`, and the
> `/users/:id/{role,status,barcode}` mutations missing `Idempotency-Key` despite CLAUDE.md naming
> payments and account activation explicitly; the PayHere webhook signature check uses `!==`
> instead of `crypto.timingSafeEqual` (Zoom/Bunny both do it correctly); **10 of 21 backend
> services have zero test coverage**, including `access.service.ts` (the core content-protection
> gate) and the three files central to the new visibility-scoping gap (`exam`/`submission`/`video`);
> and no CI pipeline exists at all (`.github/workflows/` is empty) — Phase 10's "Not Started" is
> accurate for real deployment/CI even though the dev-side Docker Compose stack (postgres/nginx/
> backend/worker/redis/backup) is fully built and has run real backups. Teacher course create/edit,
> exact marker assignment, and result correction were subsequently completed on 2026-08-20. See the refreshed
> "Remaining follow-ups" and "Known Risks" below for the full itemized list.

> **2026-07-09 docs revision.** All `documents/` were revised for **lowest cost / lowest complexity**: backend runs on **one VPS via Docker Compose** (nginx + API + worker + Redis), Postgres on **Neon free tier**, frontend on **Vercel free tier**. Kubernetes (`k8s/`), Sanity CMS, Upstash, and the abandoned `admin_frontend/` + `admin_panel/` folders were **removed**. The institution model was expanded: **multiple teachers** (new `TEACHER` role), **subjects** (new top-level `Subject`), **QR attendance**, **pay-at-entrance**, and **typed online answers**. See the Decisions Log and [09-cost-and-hosting.md](./09-cost-and-hosting.md).

---

## Phase S — Schema Realignment (2026-07-09)

The `backend/prisma/schema.prisma` was migrated to match [08-database-design.md §12](./08-database-design.md#12-code-drift--required-migrations). No production data exists, so this was safe pre-launch. **Backend `tsc` build is green.**

**Done in code:**
- [x] `Role` → `SUPER_ADMIN/TEACHER/ADMIN/MARKER/STUDENT`; every `requireRole(...)` guard remapped (owner→`SUPER_ADMIN`, front-desk→`ADMIN`, `TEACHER` added to course-content routes)
- [x] `Subject` model + full CRUD module (`schema/service/controller/route`, mounted at `/api/subjects`)
- [x] `Course.subjectId` + `Course.teacherId`; `@@unique([subjectId,name,year])`
- [x] **Teacher-ownership** enforced via `assertCourseAccess()` (in `class.service`), wired through course/session/exam/video create+update+delete
- [x] `AttendanceSource.QR`, `PaymentMethod` enum + `Payment.method`/`collectedById`, `Submission.writtenAnswers`, `Exam.allowTypedAnswers`/`allowPdfUpload` added to schema
- [x] `AuditLog` collapsed to `actorId` + `actorRole` (legacy `adminId` dropped)
- [x] Owner-visibility checks (soft-deleted/inactive) fixed to `SUPER_ADMIN` across class/session/exam services
- [x] Exam channel flags exposed via the exam create/update API

**Architecture re-alignment pass (2026-07-09, later):**
- [x] **Content-access gate** — new `access.service.ts` (`assertStudentContentAccess`): students must hold an active enrollment to list videos / read a course's sessions & exams, and must **also have paid the current month** before a Bunny stream token is minted (architecture §7.1). Wired into video (stream=paid, list=enrolled), exam (`listExams` scoped to enrolled + `getExamById` gated), and class-session list/get. Privileged roles bypass.
- [x] **Stream-token rate limit** — `streamLimiter` (30/min/IP) on `/api/videos/:id/stream`.
- [x] **Email removed** — deleted `email.job.ts`, email queue/worker, `EmailJobData`, `RESEND_*` env, email JOB constants, and uninstalled the `resend` dependency.
- [x] Stale "Render/instances" comment in `rate-limiter.ts` updated to single-VPS wording.

**Remaining follow-ups (columns/enums exist; endpoints not yet wired):**
- [x] Reconcile and apply versioned migrations (2026-08-20): the API entrypoint runs fail-fast `prisma migrate deploy`; fresh PostgreSQL 16 installs and existing db-push adoption both finish with zero Prisma drift. The one-time existing-database sequence is documented in the migration guide and preserves the ledger trigger.
- [x] Submission flow: `writtenAnswers` accepted/stored server-side (`submission.service.ts`) + frontend `WrittenAnswerPanel`/`ExamSit` wired
- [x] Payment flow: pay-at-entrance (2026-07-14/15) — `POST /payments/collect-entrance` (`collectEntrancePayment`), `GET /users/resolve-barcode` (`resolveStudentByBarcode`, institute-scoped `StudentBarcode` then global `User.barcode` fallback), `CollectPayment`/`PaymentReceipt` frontend + `/payments/[id]` printable receipt with QR. See `payments.endpoints.md` §8.
- [x] Attendance scan source tagging (2026-08-13): `/attendance/scan` accepts `BARCODE | QR`; the staff scanner sends `BARCODE` for wedge input and `QR` for camera decoding and displays the source in the live roster.
- [x] Live classes: server-signed Zoom SDK join endpoint (2026-07-10, same content gate) + per-student watermark overlay (frontend) — see `02-architecture.md §7.1`
- [x] **Enrollment endpoints** (2026-07-10) — `POST /api/enrollments` (STUDENT self-enroll; ADMIN/SUPER_ADMIN enroll a `userId`; re-enroll reactivates a cancelled row), `GET /my`, `GET /` (admin, paginated), `GET /:id`, `DELETE /:id` (soft-cancel). Feeds the content-access gate and unblocks `POST /payments/initiate`. Files: `schemas/enrollment.schema.ts`, `services/enrollment.service.ts`, `controllers/enrollment.controller.ts`, `routes/enrollment.routes.ts`; `AUDIT_ACTION.ENROLLMENT_{CREATED,CANCELLED}`; `context/api_endpoints/enrollments.endpoints.md`. No migration (existing `Enrollment` table).
- [x] Teacher-scoped **reads** for attendance (2026-07-10) — `GET /session/:sessionId` and `GET /class/:classId` now allow `TEACHER`, scoped via the existing `assertCourseAccess` ownership gate (reused from `class.service.ts`, not duplicated). See `attendance.endpoints.md`.
- [x] **Student account-setup flow** (2026-07-10) — NIC front/back R2 upload, register/list/delete `StudentBarcode` per institute, `setupCompleted` auto-flip (no approval gate, explicit product decision), LMS-QR auto-generated at registration. `/auth/account-setup` page + `(app)` layout redirect gate. See `account-setup.endpoints.md`.
- [x] Physical attendance scan by **institute context** (2026-08-13): staff select an active institute; `/attendance/scan` resolves the exact `(instituteId, barcode)` `StudentBarcode` first and falls back to global `User.barcode`. Timetable-generated sessions reject a mismatched institute. No `Attendance.instituteId` migration was needed because timetable/session data remains location truth and audit metadata captures scan context.
- [x] Recorded-video attendance (2026-07-12, PR #57): `VideoPlayer.tsx` wires `POST /attendance/video` via player.js `timeupdate`/`ended` events (marks after ~30s forward-watched, seek-proof), plus the missing enrollment gate on the endpoint itself.
- [x] Zoom attendance reconciliation + teacher reporting (2026-08-17): `GET/POST /attendance/session/:sessionId/reconciliation` fetches Zoom's completed-meeting participant rows, aggregates reconnects, matches server-controlled index suffix/email without guessing, excludes inactive/non-course enrollments, previews before applying, and inserts missing rows idempotently with an audit event. The `/attendance` UI exposes session rosters + Sync to SUPER_ADMIN and owning TEACHER; front-desk ADMIN keeps the entrance scanner only.
- [x] **Audit log viewer** (2026-07-10) — `/admin/audit` (SUPER_ADMIN-gated), action + date-range filters, expandable rows for IP/user-agent/metadata. Also fixed a real bug found while building it: the route was gated to `Role.ADMIN` (front-desk) instead of `Role.SUPER_ADMIN` — a leftover from before the 2026-07-09 role-enum remap that locked the actual super-admin out and let front-desk read the full trail. See `audit.endpoints.md`.
- [x] **Notification bell + settings** (2026-07-10) — new `Notification`/`NotificationSetting` models, `NotificationService.dispatch()` single entry point (in-app + settings-gated SMS, fires SSE `NOTIFICATION_CREATED`), wired into results-published and payment confirmed/overridden. `/admin/notification-settings` (SUPER_ADMIN) toggles per (scenario, channel); the bell in `TopBar` is the **first frontend SSE consumer** in the codebase — `RESULTS_PUBLISHED`/`TIMETABLE_UPDATED`/`EXAM_CONTROL` still have no frontend listener, a separate pre-existing gap. See `notifications.endpoints.md`.
- [ ] Actor-vs-target privilege guard audit: `assertCanManagePrivilegedTarget` now covers `PATCH /:id/status` and `PATCH /:id/barcode` (2026-07-10 fix, see Decisions Log) — `PATCH /:id/role` is separately SUPER_ADMIN-only at the route level so needs no change, but re-check any *new* admin-on-user mutation for the same actor/target gap before shipping it
- [x] **Refresh-token collision on rapid re-auth** (found 2026-07-10, fixed 2026-07-11): `signRefreshToken`/`signAccessToken` in `auth.service.ts` called `jwt.sign(payload, secret, { expiresIn })` with no `jti` (nonce) claim, so two token issuances for the same `(userId, role)` within the same second produced a byte-identical JWT — and since the DB stores `RefreshToken.token` as a hash of the raw token with a unique constraint, the second insert threw `P2002` and the request 500'd. Fixed by adding `jwtid: crypto.randomUUID()` to both `jwt.sign` calls. Regression test in `auth.service.test.ts` freezes system time with `vi.useFakeTimers()` so two `login()` calls share the same `iat`, then asserts the two refresh tokens (and their stored hashes) differ; confirmed the test fails without the fix and passes with it. Live-verified: registered a throwaway user then fired 5 concurrent logins against the running stack — 5 distinct `RefreshToken` rows, zero 500s.
- [x] Upload-integrity confirm-step (2026-07-13, PR #65): split presign from persistence for NIC/exam-paper/answer-PDF direct-to-R2 uploads — `r2HeadObject` verifies the object actually landed before a `confirm*` endpoint persists the key / flips `setupCompleted`, closing the false-success gap a failed/CORS-blocked `PUT` used to cause.
- [x] Profile edit + credential management (2026-07-13, PR #66) — see `docs/superpowers/specs/2026-07-13-profile-edit-credential-management-design.md`.
- [x] Teacher-scoped read gaps found and fixed (2026-07-15, **implemented**): `assertCourseAccess` was missing from `exam.service.ts` (`listExams`/`getExamById`), `video.service.ts` (`listVideosByClass`/`getVideoById`/`generateStreamUrl`), `submission.service.ts` (`listSubmissions`), and `class-session.service.ts` (`listClassSessions`/`getClassSessionById`) — any TEACHER could view another teacher's exam content (incl. answers), recordings, submissions, and session schedule. `MARKER` scoping (`ensureMarkerAssigned`) and front-desk `ADMIN` route-gating were both independently verified correct — not part of the gap. Fixed via subagent-driven-development (23 new Vitest cases across 4 new test files, one review-cycle fix on `submission.service.ts` — an `if/else` had to be corrected to two independent `if`s), then live-stack verified with two real teacher accounts on different courses. See `docs/superpowers/specs/2026-07-15-teacher-marker-visibility-scoping-design.md`.
- [ ] **Security/correctness hardening found in the 2026-07-15 gap audit** (not yet fixed):
  - ✅ Fixed 2026-08-17: `DELETE /timetable/slots/:id` now sets `isActive: false`, preserves generated-session links, and remains safe when repeated. The existing PATCH path restores with `isActive: true`; service tests cover missing, unauthorized, repeated-disable, and repeated-restore cases, and the SUPER_ADMIN timetable view labels inactive slots.
  - ✅ Fixed 2026-07-22: `PATCH /payments/:id/override`, `POST /payments/bulk-upload`, and `PATCH /users/:id/{role,status,barcode}` now carry `checkIdempotency`, and the live frontend callers send per-action `Idempotency-Key` UUIDs. `POST /users/me/nic/confirm` remains consciously excluded because it is already idempotent by object-key upsert.
  - ✅ Fixed 2026-08-13: PayHere webhook signature checks now use `crypto.timingSafeEqual`, matching Zoom/Bunny webhook verification.
- [ ] **Test coverage gap found in the 2026-07-15 gap audit**: 10 of 21 backend services had zero `.test.ts` file at the time of the audit. **Update:** dedicated coverage now exists for exam, video, submission, class-session, live-class authorization/scheduling, timetable, enrollment learning-state, subject-teacher assignment, and `access.service` (privileged bypass, active enrollment, paid/unpaid, and marker assignment). Still zero direct coverage: `institute.service.ts`, `sms-notification.service.ts`, and `stream.service.ts`.
- [x] **CI quality gate** (2026-08-13; lint completed 2026-08-17; migration proof added 2026-08-20): `.github/workflows/ci.yml` runs locked installs, Prisma validation/generation, fresh migration deploy + zero-drift verification, legacy db-push baseline adoption, backend/frontend lint and tests, frontend typecheck, and both production builds on PRs into `dev`/`main`, with one aggregate `Quality Gate` check. The backend now has a locked ESLint/typescript-eslint flat config; application code and unit tests are covered, while legacy live-stack diagnostic scripts already excluded from `tsconfig.json` remain a separate cleanup follow-up. The frontend's five React 19 findings were fixed rather than suppressed, with regression tests for payment search cancellation, route-driven mobile-nav closing, and current SSE callback delivery.
- [x] **Exam read-role leak fixed**: `GET /` and `GET /:id` explicitly allow only SUPER_ADMIN, TEACHER, MARKER, and STUDENT; service-level scoping limits teachers to owned courses, markers to assigned exams with answer keys stripped, and students to enrolled courses and valid time windows. Front-desk ADMIN is rejected at the route.

---

## Phase Overview

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| 0 | Project Setup | 🟡 In Progress | Repo init, package scaffolds, env config, Prisma schema, CI/CD skeleton |
| 1 | Auth & User Management | 🟡 In Progress | JWT auth, role-based access, user CRUD, barcode assignment |
| 2 | Class Management | 🟡 In Progress | Class sessions, attendance (barcode + Zoom webhook), video recordings |
| 3 | Exam System | 🟡 In Progress | Exam CRUD, paper PDF upload, MCQ engine, answer submission, server timers |
| 4 | Marking & Results | 🟡 In Progress | Exact marker assignment, grading, publishing, and audited published-result correction are available in the UI; richer moderation workflows remain. |
| 5 | Payments | 🟡 In Progress | PayHere, bulk upload, pay-at-entrance, receipts, and payment override UI are built. **Immutable adjustment/refund ledger ✅ (2026-08-19)** — atomic append-only override/refund events, completed-external-refund recording, net reporting, terminal `REFUNDED` protection, migration + DB trigger, and SUPER_ADMIN ledger UI. Provider-initiated refunds, voids, compensating/re-payment flows, discounts, and installments remain. |
| 6 | Notifications & Real-Time | 🟡 In Progress | Notification bell + settings ✅ (2026-07-10); RESULTS_PUBLISHED/TIMETABLE_UPDATED/EXAM_CONTROL SSE events still have no frontend listener (confirmed still true 2026-07-15) |
| 7 | Admin Dashboard | 🟡 In Progress | User management UI ✅ (incl. reactivate/list-inactive); subjects + institutes management pages ✅ (2026-07-11, SUPER_ADMIN-only, wired to existing `/subjects` + `/institutes` CRUD — verified: 18 Vitest+RTL unit tests, `tsc`+`build` green, and a headless-Chromium UI smoke on the live Docker stack: create/edit/deactivate/filter/duplicate-409 for both + ADMIN bounced by the SSR gate); audit log viewer ✅ (2026-07-10); financial reports ✅ (2026-07-12); Zoom attendance reconciliation + teacher reporting ✅ (2026-08-17); payment override UI ✅ (2026-08-19). |
| 8 | Student Dashboard | 🟡 In Progress | Home/dashboard, classes, timetable, exams (incl. taking), submissions, payments, attendance, video player, live classes — all built |
| 9 | Polish & Hardening | 🟡 In Progress | Backend hardening in progress; frontend polish pending |
| 10 | Deployment | ⬜ Not Started | Vercel + EC2 + Upstash setup, DNS, staging/prod pipeline, monitoring |

---

## Phase 0 — Project Setup

### Tasks

- [x] Create project documentation (`context/documents/` — 6 files)
- [x] Initialize Next.js frontend (`/frontend`) with TypeScript + Tailwind + App Router
- [x] Initialize Node.js backend (`/backend`) with TypeScript + Express
- [x] Configure Prisma with schema from plan document
- [ ] Set up shared Zod schemas
- [ ] Configure ESLint + Prettier for both projects
- [x] Create `.env.example` files with all required variables
- [x] Set up Redis connection config
- [x] Set up Pino logger
- [x] Set up global error handler
- [x] Set up Docker (backend + redis for local dev)
- [ ] Create base Axios instance (frontend)
- [ ] Set up Zustand store skeleton (auth store)
- [ ] Create base UI component library (Button, Input, Badge, Card, Modal, Toast)
- [ ] Create dashboard layout shell (Sidebar + TopBar + role-based routing)

### Files Created
| File | Purpose |
|------|---------|
| `context/documents/01-project-overview.md` | Product summary, user roles, key flows, out-of-scope |
| `context/documents/02-architecture.md` | Tech stack, topology, layer boundaries, invariants |
| `context/documents/03-code-standards.md` | TypeScript + Next.js conventions |
| `context/documents/04-ai-workflow-rules.md` | Agent scoping and decision-making rules |
| `context/documents/05-ui-context.md` | Design tokens, component conventions, layout patterns |
| `context/documents/06-progress-tracker.md` | This file — the living progress document |
| `backend/src/schemas/user.schema.ts` | Zod validation for user management endpoints |
| `backend/src/services/user.service.ts` | User list, lookup, role, status, and barcode logic |
| `backend/src/controllers/user.controller.ts` | User management HTTP handlers |
| `backend/src/routes/user.routes.ts` | User management API routes |
| `backend/src/scripts/test-users.ts` | Smoke test for user management endpoints |
| `backend/src/schemas/class.schema.ts` | Zod validation for class (course) endpoints |
| `backend/src/schemas/class-session.schema.ts` | Zod validation for class session endpoints |
| `backend/src/services/class.service.ts` | Class (course) CRUD logic |
| `backend/src/services/class-session.service.ts` | Class session CRUD logic |
| `backend/src/controllers/class.controller.ts` | Class (course) HTTP handlers |
| `backend/src/controllers/class-session.controller.ts` | Class session HTTP handlers |
| `backend/src/routes/class.routes.ts` | Class (course) API routes |
| `backend/src/routes/class-session.routes.ts` | Class session API routes |
| `backend/src/scripts/test-classes.ts` | Smoke test for class and session endpoints |
| `context/api_endpoints/classes.endpoints.md` | Class and class session API documentation |
| `backend/src/utils/r2.ts` | Cloudflare R2 presigned URL helper |
| `backend/src/scripts/test-exams.ts` | Smoke test for exam endpoints |
| `backend/src/scripts/test-worker.ts` | Smoke test for BullMQ worker jobs |
| `context/api_endpoints/exams.endpoints.md` | Exam API documentation |
| `backend/src/schemas/payment.schema.ts` | Zod validation for payment endpoints |
| `backend/src/services/payment.service.ts` | PayHere + payment processing logic |
| `backend/src/controllers/payment.controller.ts` | Payment HTTP handlers |
| `backend/src/routes/payment.routes.ts` | Payment API routes |
| `backend/src/utils/payhere.ts` | PayHere hash/signature helpers |
| `backend/src/jobs/notification.queue.ts` | BullMQ queues + enqueue helpers |
| `backend/src/types/job.types.ts` | Job payload types for BullMQ |
| `backend/src/config/sentry.ts` | Sentry initialization + capture helper |
| `backend/src/middleware/request-logger.middleware.ts` | Pino HTTP request logging middleware |
| `backend/src/middleware/zoom-webhook.middleware.ts` | Zoom webhook signature validation |

---

## Phase 1 — Auth & User Management

### Tasks

- [x] Create `auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`
- [x] Implement JWT access + refresh token flow
- [x] Create `verifyToken` middleware
- [x] Create `requireRole` middleware
- [x] Create `user.routes.ts`, `user.controller.ts`, `user.service.ts`
- [x] Implement user CRUD (Super Admin only for role changes)
- [x] Implement barcode assignment + validation
- [ ] Build login page (Next.js)
- [ ] Build registration flow (pending → Admin approval)
- [ ] Set up Zustand `useAuthStore` with cross-tab sync
- [ ] Implement silent token refresh in Axios interceptor

---

## Phase 2 — Class Management

### Tasks

- [x] Create `class.routes.ts`, `class.controller.ts`, `class.service.ts`
- [x] Implement class session CRUD (with soft delete)
- [x] Create `attendance.routes.ts`, `attendance.controller.ts`, `attendance.service.ts`
- [x] Implement barcode scanning attendance endpoint
- [x] Implement Zoom webhook handler (upsert attendance)
- [x] Create `video.routes.ts`, `video.controller.ts`, `video.service.ts`
- [x] Implement Bunny.net video token generation (IP-bound)
- [x] Build class schedule page (student view) — `(app)/timetable/page.tsx`
- [x] Build attendance scanner/report page — `(app)/attendance/page.tsx` keeps the working SUPER_ADMIN/ADMIN entrance scanner (institute→class→session, wedge/camera QR, live roster, manual fallback) and now gives SUPER_ADMIN/TEACHER an ownership-scoped session roster + Zoom reconciliation preview/apply view (2026-08-17). MARKER remains intentionally unsupported.
- [ ] Build video player component with DRM black-screen detection — `components/features/VideoPlayer.tsx` (187 lines) plays video but has **no watermark overlay and no black-screen detection**; `02-architecture.md §7.1` describes these as if built for VOD — that description is aspirational/stale for the watermark specifically, don't trust it without checking the component

---

## Phase 3 — Exam System

### Tasks

- [x] Create `exam.routes.ts`, `exam.controller.ts`, `exam.service.ts`
- [x] Implement exam CRUD with R2 presigned URL generation
- [x] Implement MCQ question model and answer engine
- [x] Create `submission.routes.ts`, `submission.controller.ts`, `submission.service.ts`
- [x] Implement multipart PDF upload with token refresh (direct-to-R2 presigned PUT, `ExamSit`/`WrittenAnswerPanel`)
- [x] Implement server-authoritative exam timer validation
- [x] Build exam list page (student view) — `(app)/exams/page.tsx`
- [x] Build exam taking page with countdown timer — `[examId]/_components/ExamSit.tsx` + `CountdownTimer.tsx`
- [x] Build MCQ exam component — `McqQuestionList.tsx` (verify localStorage auto-save specifically if picking this up again)
- [x] Build exam creation page (super admin view) — `exams/new/page.tsx` + `ExamForm.tsx`/`McqBuilder.tsx`

---

## Phase 4 — Marking & Results

### Tasks

- [x] Implement marker assignment (Super Admin → Marker × Exam)
- [x] Implement mark submission (idempotent)
- [x] Implement result publishing (batch)
- [x] Build marking interface (marker view) — `submissions/[examId]/_components/GradeSubmissionRow.tsx` + `PublishResultsButton.tsx` (verify inline PDF viewing specifically if revisiting)
- [x] Build results page (student view) — `ExamResult.tsx`
- [x] Implement SSE broadcast for result publication

---

## Phase 5 — Payments

### Tasks

- [x] Create `payment.routes.ts`, `payment.controller.ts`, `payment.service.ts`
- [x] Implement PayHere payment initiation + webhook handler
- [x] Implement idempotency middleware for payment routes — present on `/initiate`, `/payhere/checkout`, `/collect-entrance`, `/override`, and `/bulk-upload` (override + bulk-upload hardened 2026-07-21; frontend callers completed 2026-07-22)
- [x] Implement Excel bulk payment upload (Admin)
- [x] Build payment page (student view) — `(app)/payments/page.tsx` role-aware: STUDENT sees per-course this-month Pay/Paid cards (reuses the initiate→PayHere flow) + filterable history (2026-07-11)
- [x] Build payment dashboard (admin view) — SUPER_ADMIN/ADMIN: month summary (`GET /payments/summary`), status/month-filtered records table, and Excel bulk upload with per-row results (2026-07-11)
- [x] Pay-at-entrance (2026-07-14/15) — `collectEntrancePayment` + barcode resolution + `CollectPayment` UI + printable `PaymentReceipt`/`/payments/[id]`, see Phase S follow-ups above
- [x] Build payment override UI (super admin) — record-row action opens an explicit review form, sends a fresh `Idempotency-Key`, validates amount/note, preserves failures, refreshes on success, and remains hidden from front-desk ADMIN (2026-08-19)
- [x] Build immutable payment adjustment/refund ledger (2026-08-19) — `PaymentAdjustment`, `refundedAmount`, terminal `REFUNDED`, database mutation-rejection trigger, atomic service writes, self-scoped reads, completed-refund endpoint/UI, and net summary/report calculations

---

## Phase 6 — Notifications & Real-Time

### Tasks

- [x] Set up SSE endpoint (`/api/stream`)
- [x] Implement Redis Pub/Sub for cross-instance SSE broadcasting
- [x] Create BullMQ worker entry point (`worker.ts`)
- [x] Implement SMS job (Notify.lk integration)
- [x] Implement email notification job (optional)
- [x] Build notification bell component (frontend) — 2026-07-10, see Phase S follow-ups above

---

## Phase 7 — Admin Dashboard

### Tasks

- [x] Build user management table (search, filter, role change) — `admin/users/page.tsx` + `UsersTable.tsx`/`UserFilters.tsx`, includes status (active/inactive/all) filter and the activate/deactivate toggle
- [x] Build audit log viewer — `/admin/audit` (2026-07-10), see Phase S follow-ups above for the role-guard bug fixed alongside it
- [x] Build financial reports page (2026-07-12) — `/admin/reports` (SUPER_ADMIN-only), `GET /payments/reports` aggregate, Recharts revenue-trend/by-course/by-method/outstanding views
- [x] Build support tools (password reset, account unlock) — profile/credential management shipped 2026-07-13 (`docs/superpowers/specs/2026-07-13-profile-edit-credential-management-design.md`); "account unlock" remains the existing activate/deactivate toggle
- [x] Implement "Sync Attendance" reconciliation workflow (2026-08-17) — completed-meeting Zoom preview, safe identity matching, active-enrollment check, idempotent apply, audit event, and SUPER_ADMIN/TEACHER UI

---

## Phase 8 — Student Dashboard

### Tasks

- [ ] Build home dashboard (upcoming classes, recent results, payment status)
- [ ] Build class schedule view with calendar
- [ ] Build results history view
- [ ] Build payment history view
- [ ] Build profile / settings page

---

## Phase 9 — Polish & Hardening

### Tasks

- [x] Add Sentry error tracking for API + worker
- [x] Add Pino HTTP request logging middleware
- [x] Enforce production env validation for external services
- [x] Verify Zoom webhook signatures (timestamp + HMAC)
- [x] Tighten auth rate limit to 10/min
- [x] Run backend/frontend smoke tests against compiled production Compose (latest: Phase D, 2026-08-22)
- [ ] Implement loading skeletons on all data-fetching pages
- [ ] Implement empty states with illustrations
- [ ] Implement toast notifications for all mutations
- [ ] Implement dark mode toggle and persistence
- [ ] Add SEO meta tags to all public pages
- [ ] Performance audit (Lighthouse, bundle analysis)
- [ ] Accessibility audit (keyboard nav, screen reader, contrast)
- [ ] Error boundary components with user-friendly fallbacks

---

## Phase 10 — Deployment (single VPS + Docker Compose)

### Tasks

- [ ] Configure Vercel project + custom domain (frontend, free tier)
- [ ] Provision one VPS (Hetzner/DigitalOcean, ~$5–12/mo); install Docker + Compose
- [ ] Point `api.` DNS (Cloudflare) at the VPS; nginx TLS via Let's Encrypt
- [ ] Set a strong `POSTGRES_PASSWORD` + `BACKUP_ENCRYPTION_PASSPHRASE` in `backend/.env`; configure `BACKUP_RCLONE_REMOTE` (off-site) + `BACKUP_HEALTHCHECK_URL`
- [ ] Run `docker compose up -d --build` on the VPS (postgres + nginx + API + worker + Redis + backup); verify the API entrypoint's automatic `prisma migrate deploy` and clean migration status
- [ ] Run one restore drill ([12 §8](./12-data-backup-and-recovery.md)) before cutover
- [ ] Set up Sentry projects (frontend + backend, free tier)
- [x] GitHub Actions quality gate: Prisma validate/generate, fresh/legacy migration proofs, backend/frontend test/type/build on PRs to `dev`/`main` (2026-08-13; migration checks 2026-08-20). Branch-protection setting and SSH deploy-on-merge remain external/production follow-ups.
- [ ] Smoke test full system
- [ ] Production cutover + monitoring
- [ ] See [09-cost-and-hosting.md](./09-cost-and-hosting.md) for the full runbook + cost table

---

## Architectural Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-09 | Use SSE over WebSockets | One-way server-to-client push is sufficient; SSE is simpler, uses standard HTTP, works with load balancers without adapter config |
| 2026-05-09 | Use BullMQ over node-cron | Distributed-safe job execution across auto-scaled instances; prevents zombie cron jobs |
| 2026-05-09 | Presigned URLs for file uploads | Files never touch Node.js server; eliminates the local file upload trap in multi-instance deployments |
| 2026-05-09 | Idempotency keys for payments & marking | Prevents double-charge and duplicate mark submission from network retries or double-clicks |
| 2026-05-09 | Soft deletes on ClassSession and Exam | Prevents cascade deletion of attendance and submission records |
| 2026-05-09 | Server-authoritative exam timers | Prevents time-traveler exploit where students manipulate system clocks |
| 2026-05-09 | Zustand with BroadcastChannel | Prevents multi-tab overwrite bug during exams |
| 2026-05-09 | Pino over console.log | Structured JSON logging searchable across auto-scaled instances |
| 2026-05-10 | Hash refresh tokens before DB storage | If DB leaks, raw tokens are useless — SHA-256 hash stored, raw token only lives in the HTTP-only cookie |
| 2026-05-10 | Refresh token reuse detection | On reuse, revoke ALL tokens for that user — protects against refresh token theft (silent rotation per plan §1) |
| 2026-05-10 | Vague login error messages | `INVALID_CREDENTIALS` for both wrong email AND wrong password — prevents email enumeration attacks |
| 2026-05-10 | Restrict refresh cookie path to `/api/auth` | Prevents the browser sending the refresh token on every API request — reduces attack surface |
| 2026-05-12 | Map `Role.ADMIN` as Super Admin, `Role.STAFF` as Admin | Prisma enum lacks `SUPER_ADMIN`; route guards follow this temporary mapping for Step 4 |
| 2026-05-13 | Treat "classes" as courses; sessions are nested resources | Classes map to Course model; sessions live under `/api/classes/:classId/sessions` |
| 2026-05-20 | Accept R2 endpoint + legacy env keys | Align local env vars with R2 client configuration without renaming existing secrets |
| 2026-05-29 | Move backend hosting to EC2 + PM2 | Single-instance deploy with Upstash Redis; frontend stays on Vercel |
| 2026-07-09 | **Single VPS + Docker Compose** (supersedes EC2+PM2) | Lowest cost/complexity: nginx + API + worker + Redis in one Compose file on a ~$5–12/mo VPS. `git pull && docker compose up -d --build` is the whole deploy. |
| 2026-07-09 | **Delete Kubernetes** (`k8s/` + HPA) | Auto-scaling is unjustified at ~1,200 users; Redis caching absorbs the result-release spike on one box. Removed the biggest cost/complexity sink. |
| 2026-07-09 | ~~Postgres = Neon (managed)~~ **superseded → self-hosted Postgres** | Redis in Compose is free and has no cross-instance state to sync on a single instance. Dropped Upstash. (Neon choice reversed below.) |
| 2026-07-09 | **Postgres = self-hosted in Compose** (supersedes Neon) | Neon free-tier compute auto-suspends → first-query `ETIMEDOUT` broke auth. Self-hosting on a `pgdata` volume is always warm, zero DB bill, full control. We now own durability via the **`backup` service**: scheduled `pg_dump`, verified, AES-256 encrypted, GFS-rotated, off-site (rclone), monthly restore drills. Runbook: [12-data-backup-and-recovery.md](./12-data-backup-and-recovery.md). |
| 2026-07-09 | **Drop Sanity CMS** | Marketing pages are static in Next.js. Removes a paid dependency *and* the on-demand-revalidation complexity. |
| 2026-07-09 | **Email out of scope for v1** | SMS via Notify.lk is the notification channel; `resend` dependency to be removed. Email can return later as a BullMQ job. |
| 2026-07-09 | **One Next.js frontend** | Deleted abandoned `admin_frontend/` + `admin_panel/`; all roles served from `frontend/` via App Router route groups. |
| 2026-07-09 | **Add `TEACHER` role; owner is the single `SUPER_ADMIN`** | Institution has several teachers; each manages only their own courses' sessions/exams. Fine-grained exceptions via `Permission`. Replaces the legacy `ADMIN/STAFF` enum mapping. |
| 2026-07-09 | **Add `Subject` as academic top level** | Subject → Course → sessions/exams/enrollment. Each Course belongs to one Subject and one Teacher. |
| 2026-07-09 | **QR attendance + pay-at-entrance** | `AttendanceSource.QR`; `PaymentMethod` enum (`ONLINE/ENTRANCE/BULK/MANUAL`) + `Payment.collectedById`. |
| 2026-07-09 | **One mixed paper, multi-channel answers** | Exam is course-wide (both cohorts). `Submission.writtenAnswers` (typed) + `answerPdfUrl` (scanned) + `answers` (MCQ); exam-level `allowTypedAnswers`/`allowPdfUpload` flags. |
| 2026-07-09 | **Physical institutes + per-institute barcodes + NIC onboarding** | New `Institute` allowlist (Super-Admin, pre-configured centers) and `StudentBarcode` (`@@unique([instituteId,barcode])` — per-institute, one per student per institute). `User.barcode` kept as the global LMS QR. `User.setupCompleted`/`nicFrontUrl`/`nicBackUrl` for mandatory onboarding. Institute CRUD module added at `/api/institutes`. |
| 2026-07-09 | **Recurring timetable (template + generated sessions) + course banners** | New `TimetableSlot` weekly template + `ClassSession.timetableSlotId` (`@@unique([timetableSlotId,date])` for idempotent generation). Timetable CRUD + manual `POST /api/timetable/generate` + **weekly BullMQ job** (Sun 20:00 UTC, 14-day window). Front-desk `ADMIN` added to session/timetable editing. `Course.bannerUrl`/`backdropUrl` display assets. |
| 2026-07-10 | **Student account-setup**: LMS-QR auto-generated at registration; NIC upload + institute barcodes are self-service, no admin-approval gate | Reduces admin workload; fraud/abnormal-account detection deferred as a documented follow-up until there's real usage data to design against |
| 2026-07-10 | **Actor-vs-target privilege guard required for admin-on-user mutations** | Incident: a front-desk `ADMIN` deactivated a `SUPER_ADMIN` account twice (`PATCH /:id/status` was gated only by the caller's own role, not the target's). Fixed via `assertCanManagePrivilegedTarget` in `user.service.ts`, applied to `/:id/status` and `/:id/barcode`. Any new endpoint where one role acts on another user's account must be checked for the same gap — see `CLAUDE.md` |
| 2026-07-10 | **Vitest introduced; unit tests + edge-case brainstorming required for every implementation going forward** | Same incident above — the missing test coverage let the gap ship unnoticed. `backend/vitest.config.ts` + `npm run test`; see `04-ai-workflow-rules.md §3.4` for the actor×target-matrix + check-ordering testing pattern |
| 2026-07-10 | **Notification bell: full persisted inbox, not an ephemeral toast** | User explicitly chose the bigger option over the lighter SSE-only recommendation — wanted unread counts, mark-as-read, and history, not just live pop-ups |
| 2026-07-10 | **Notification channels: IN_APP + SMS only, no EMAIL toggle** | Matches the existing "email out of scope for v1" decision — a toggle with no sender behind it would be a dead control. `NotificationChannel` enum is structured to extend cleanly when email infra exists |
| 2026-07-10 | **Notification settings are SUPER_ADMIN-only, not ADMIN** | Consistent with the audit-log-access decision the same session — front-desk doesn't get to decide whether students get contacted, only the owner does |
| 2026-07-10 | **Consolidated payment SMS into NotificationService.dispatch(), removed the old per-controller helpers** | `payment.controller.ts` already had `sendPaymentConfirmationSms`/`sendPaymentOverrideSms` calling `SmsNotificationService.sendSms` directly, with no settings gate and at risk of double-sending once the new dispatch-based calls were added in the service layer. Removed the controller-level versions; `NotificationService.dispatch` is now the only path, and it respects the super-admin toggle. `sendBulkPaymentSms` (bulk upload) was left as the pre-existing no-op — it never sent anything before this change either, wiring it up needs `bulkUploadPayments` to expose per-row recipients first |

---

## Known Risks & Mitigations

| Risk | Mitigation | Status |
|------|-----------|--------|
| Thundering herd on result release | Redis caching for result queries | ⬜ To implement (confirmed absent 2026-07-15 — zero `@/config/redis` usage in `exam.service.ts`/`submission.service.ts`) |
| Zoom webhook missed during server restart | Ownership-scoped preview/apply reconciliation plus SUPER_ADMIN/TEACHER "Sync" UI; provider retry monitoring still remains | 🟡 Reconciliation done 2026-08-17; staging provider proof and retry alerting remain |
| JWT expiry during long exam | Silent refresh token rotation | 🟡 Partial — reactive refresh-on-401 exists (`frontend/lib/api.ts`, single retry); no proactive/background rotation ahead of the 15-min expiry |
| R2 presigned URL expiry during slow upload | Multipart upload with token refresh | ⬜ To implement (confirmed absent 2026-07-15 — NIC/exam-paper/answer-PDF uploaders are single presign→PUT→confirm, no resume path) |
| Video piracy (leaked stream link) | Bunny token-authenticated embed + MediaCage DRM, enrolled/paid gating, per-student watermark overlay | ✅ Done (2026-07-11, PR #56 — see `docs/superpowers/specs/2026-07-11-bunny-video-drm-design.md`) |
| Live-class link sharing | Per-session Zoom SDK signature bound to authenticated enrolled+paid student | ✅ Done |
| DRM black screen on external monitors | Frontend detection overlay with user guidance | ⬜ Not planned — Web Meeting SDK has no OS-level capture-blocking; CLAUDE.md documents this as an **accepted limitation**, not a bug to fix |
| Single VPS is a single point of failure | Self-hosted Postgres on a persistent volume + the `backup` service (verified, encrypted, **off-site** dumps) + nightly Redis snapshot; scripted rebuild + restore runbook ([12](./12-data-backup-and-recovery.md)) | 🟡 Backup engine built & validated; configure off-site + drill before cutover |
| Webhook spam from flaky student connections | Upsert-based webhook handlers (Zoom/Bunny `updateMany`; PayHere `findUnique`+`update` on the pre-existing row) | ✅ Done |
| Database cascade delete via FK | Soft deletes + `onDelete: Restrict`/`SetNull` (no `Cascade` anywhere in `schema.prisma`, confirmed 2026-07-15) | ✅ Done |
| Multi-worker cron job collision | BullMQ distributed queue | ✅ Done |
| **New 2026-07-15:** `timetable.service.ts` hard-deletes a `TimetableSlot` row despite an inbound FK and an unused `isActive` column | Switch to soft-delete (`isActive: false`) matching every other model | ✅ Done (2026-08-17) |
| **New 2026-07-15:** PayHere webhook signature compared with `!==` instead of constant-time | Switch to `crypto.timingSafeEqual`, matching Zoom/Bunny | ✅ Done (2026-08-13) |
| **New 2026-07-15:** `Idempotency-Key` missing on `/payments/:id/override`, `/payments/bulk-upload`, `/users/:id/{role,status,barcode}` | Add `checkIdempotency` to match `/initiate`/`/collect-entrance`/mark-finalization | ✅ Done (2026-07-22) |
| **New 2026-07-15:** 10/21 backend services had zero test coverage, incl. the core `access.service.ts` content gate | Backfill Vitest coverage, prioritizing `access`/`exam`/`submission`/`video` | 🟡 Core four plus live/timetable covered; institute/SMS/stream service coverage remains |
| **New 2026-07-15:** No CI pipeline — nothing runs tests/build on PR | Add `.github/workflows/ci.yml`; establish lint baseline separately | ✅ Done (2026-08-13; lint follow-up recorded) |
