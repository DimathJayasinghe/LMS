# 06 — Progress Tracker

> The living document. Updated after every task. Allows the agent to pick up exactly where it left off.

---

## Current Status

| Field | Value |
|-------|-------|
| **Current Phase** | Phase 9 — Polish & Hardening (core CRUD + UI for all phases now built; hardening/gaps remain) |
| **Last Updated** | 2026-08-13 |
| **Last Completed Task** | PayHere webhook signature comparison hardened to use `crypto.timingSafeEqual`, with utility coverage for matching, mismatch, and length-mismatch paths. |
| **Next Task** | See "Remaining follow-ups" below and the new "2026-07-15 gap-audit pass" — no single blocker, pick by priority |
| **Blockers** | None |

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
> doc): QR-vs-wedge attendance `source` tagging, institute-context barcode resolution in the
> *attendance* scan endpoint specifically (the new payments barcode-resolver exists but attendance
> scanning doesn't call it), payment override UI, `BUNNY_API_KEY` still a malformed GUID in `.env`,
> no attendance-sync/reconciliation button, no Redis caching on result reads, only reactive (not
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
> backend/worker/redis/backup) is fully built and has run real backups. See the refreshed
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
- [ ] Apply the schema to the self-hosted Postgres in-container: `docker compose exec backend npx prisma migrate deploy` (dev DB is on `localhost:5433` for host tooling) — entrypoint currently uses `prisma db push`
- [x] Submission flow: `writtenAnswers` accepted/stored server-side (`submission.service.ts`) + frontend `WrittenAnswerPanel`/`ExamSit` wired
- [x] Payment flow: pay-at-entrance (2026-07-14/15) — `POST /payments/collect-entrance` (`collectEntrancePayment`), `GET /users/resolve-barcode` (`resolveStudentByBarcode`, institute-scoped `StudentBarcode` then global `User.barcode` fallback), `CollectPayment`/`PaymentReceipt` frontend + `/payments/[id]` printable receipt with QR. See `payments.endpoints.md` §8.
- [ ] Attendance scan: accept `source=QR` on the entrance-scan endpoint (still always writes `BARCODE` — `attendance.service.ts:92` hardcodes it; confirmed still true 2026-07-15 — see `attendance.endpoints.md`)
- [x] Live classes: server-signed Zoom SDK join endpoint (2026-07-10, same content gate) + per-student watermark overlay (frontend) — see `02-architecture.md §7.1`
- [x] **Enrollment endpoints** (2026-07-10) — `POST /api/enrollments` (STUDENT self-enroll; ADMIN/SUPER_ADMIN enroll a `userId`; re-enroll reactivates a cancelled row), `GET /my`, `GET /` (admin, paginated), `GET /:id`, `DELETE /:id` (soft-cancel). Feeds the content-access gate and unblocks `POST /payments/initiate`. Files: `schemas/enrollment.schema.ts`, `services/enrollment.service.ts`, `controllers/enrollment.controller.ts`, `routes/enrollment.routes.ts`; `AUDIT_ACTION.ENROLLMENT_{CREATED,CANCELLED}`; `context/api_endpoints/enrollments.endpoints.md`. No migration (existing `Enrollment` table).
- [x] Teacher-scoped **reads** for attendance (2026-07-10) — `GET /session/:sessionId` and `GET /class/:classId` now allow `TEACHER`, scoped via the existing `assertCourseAccess` ownership gate (reused from `class.service.ts`, not duplicated). See `attendance.endpoints.md`.
- [x] **Student account-setup flow** (2026-07-10) — NIC front/back R2 upload, register/list/delete `StudentBarcode` per institute, `setupCompleted` auto-flip (no approval gate, explicit product decision), LMS-QR auto-generated at registration. `/auth/account-setup` page + `(app)` layout redirect gate. See `account-setup.endpoints.md`.
- [ ] Physical attendance scan by **institute context**: resolve `(instituteId, barcode)` → student (add institute to the scan endpoint + optionally `Attendance.instituteId`) — **confirmed still separate from the payments fix** (2026-07-15): `resolveStudentByBarcode` exists and is wired into `GET /users/resolve-barcode` for payments, but `attendance.service.ts`'s `scanBarcode` still does a plain `User.barcode` lookup and never calls it
- [x] Recorded-video attendance (2026-07-12, PR #57): `VideoPlayer.tsx` wires `POST /attendance/video` via player.js `timeupdate`/`ended` events (marks after ~30s forward-watched, seek-proof), plus the missing enrollment gate on the endpoint itself.
- [x] **Audit log viewer** (2026-07-10) — `/admin/audit` (SUPER_ADMIN-gated), action + date-range filters, expandable rows for IP/user-agent/metadata. Also fixed a real bug found while building it: the route was gated to `Role.ADMIN` (front-desk) instead of `Role.SUPER_ADMIN` — a leftover from before the 2026-07-09 role-enum remap that locked the actual super-admin out and let front-desk read the full trail. See `audit.endpoints.md`.
- [x] **Notification bell + settings** (2026-07-10) — new `Notification`/`NotificationSetting` models, `NotificationService.dispatch()` single entry point (in-app + settings-gated SMS, fires SSE `NOTIFICATION_CREATED`), wired into results-published and payment confirmed/overridden. `/admin/notification-settings` (SUPER_ADMIN) toggles per (scenario, channel); the bell in `TopBar` is the **first frontend SSE consumer** in the codebase — `RESULTS_PUBLISHED`/`TIMETABLE_UPDATED`/`EXAM_CONTROL` still have no frontend listener, a separate pre-existing gap. See `notifications.endpoints.md`.
- [ ] Actor-vs-target privilege guard audit: `assertCanManagePrivilegedTarget` now covers `PATCH /:id/status` and `PATCH /:id/barcode` (2026-07-10 fix, see Decisions Log) — `PATCH /:id/role` is separately SUPER_ADMIN-only at the route level so needs no change, but re-check any *new* admin-on-user mutation for the same actor/target gap before shipping it
- [x] **Refresh-token collision on rapid re-auth** (found 2026-07-10, fixed 2026-07-11): `signRefreshToken`/`signAccessToken` in `auth.service.ts` called `jwt.sign(payload, secret, { expiresIn })` with no `jti` (nonce) claim, so two token issuances for the same `(userId, role)` within the same second produced a byte-identical JWT — and since the DB stores `RefreshToken.token` as a hash of the raw token with a unique constraint, the second insert threw `P2002` and the request 500'd. Fixed by adding `jwtid: crypto.randomUUID()` to both `jwt.sign` calls. Regression test in `auth.service.test.ts` freezes system time with `vi.useFakeTimers()` so two `login()` calls share the same `iat`, then asserts the two refresh tokens (and their stored hashes) differ; confirmed the test fails without the fix and passes with it. Live-verified: registered a throwaway user then fired 5 concurrent logins against the running stack — 5 distinct `RefreshToken` rows, zero 500s.
- [x] Upload-integrity confirm-step (2026-07-13, PR #65): split presign from persistence for NIC/exam-paper/answer-PDF direct-to-R2 uploads — `r2HeadObject` verifies the object actually landed before a `confirm*` endpoint persists the key / flips `setupCompleted`, closing the false-success gap a failed/CORS-blocked `PUT` used to cause.
- [x] Profile edit + credential management (2026-07-13, PR #66) — see `docs/superpowers/specs/2026-07-13-profile-edit-credential-management-design.md`.
- [x] Teacher-scoped read gaps found and fixed (2026-07-15, **implemented**): `assertCourseAccess` was missing from `exam.service.ts` (`listExams`/`getExamById`), `video.service.ts` (`listVideosByClass`/`getVideoById`/`generateStreamUrl`), `submission.service.ts` (`listSubmissions`), and `class-session.service.ts` (`listClassSessions`/`getClassSessionById`) — any TEACHER could view another teacher's exam content (incl. answers), recordings, submissions, and session schedule. `MARKER` scoping (`ensureMarkerAssigned`) and front-desk `ADMIN` route-gating were both independently verified correct — not part of the gap. Fixed via subagent-driven-development (23 new Vitest cases across 4 new test files, one review-cycle fix on `submission.service.ts` — an `if/else` had to be corrected to two independent `if`s), then live-stack verified with two real teacher accounts on different courses. See `docs/superpowers/specs/2026-07-15-teacher-marker-visibility-scoping-design.md`.
- [ ] **Security/correctness hardening found in the 2026-07-15 gap audit** (not yet fixed):
  - `timetable.service.ts` hard-deletes a `TimetableSlot` (`prisma.timetableSlot.delete(...)`) despite an inbound FK from `ClassSession.timetableSlotId` and an existing-but-unused `isActive` column that looks built for exactly this soft-disable — violates the repo's soft-delete-only invariant.
  - ✅ Fixed 2026-07-22: `PATCH /payments/:id/override`, `POST /payments/bulk-upload`, and `PATCH /users/:id/{role,status,barcode}` now carry `checkIdempotency`, and the live frontend callers send per-action `Idempotency-Key` UUIDs. `POST /users/me/nic/confirm` remains consciously excluded because it is already idempotent by object-key upsert.
  - ✅ Fixed 2026-08-13: PayHere webhook signature checks now use `crypto.timingSafeEqual`, matching Zoom/Bunny webhook verification.
- [ ] **Test coverage gap found in the 2026-07-15 gap audit**: 10 of 21 backend services had zero `.test.ts` file at the time of the audit. **Update:** the teacher-marker-visibility-scoping fix (below) added dedicated test files for `exam.service.ts`, `video.service.ts`, `submission.service.ts`, and `class-session.service.ts` (24 new cases total) — those four are no longer gaps. Still zero coverage: `access.service.ts` (the core enrolled+paid content gate — the most important remaining one), `enrollment.service.ts`, `institute.service.ts`, `live-class.service.ts`, `sms-notification.service.ts`, `subject.service.ts`, `stream.service.ts`.
- [ ] **No CI pipeline** (found in the 2026-07-15 gap audit): `.github/workflows/` doesn't exist. The dev-side Docker Compose stack (postgres/nginx/backend/worker/redis/backup) is fully built and has run real backups — this is specifically about automated build/test-on-PR, which is genuinely not started (Phase 10 task).
- [ ] **MARKER/front-desk ADMIN can read any exam, unscoped** (found during teacher-marker-visibility-scoping's final review, 2026-07-15): `exam.routes.ts`'s `GET /` and `GET /:id` carry only `verifyToken`, no `requireRole` at all — unlike every other route in that file. Any authenticated role, including `MARKER` and front-desk `ADMIN`, can list every exam and fetch any exam's detail (paper PDF presigned URL + full MCQ payload with answers) with zero scoping. Pre-existing, not introduced or fixed by the TEACHER-scoping work above — needs its own spec (likely: route-level `requireRole` restricting these two endpoints to roles that should see exam content, or a `MarkerAssignment`-style check inside the service, mirroring `submission.service.ts`'s existing `listSubmissions` MARKER handling).

---

## Phase Overview

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| 0 | Project Setup | 🟡 In Progress | Repo init, package scaffolds, env config, Prisma schema, CI/CD skeleton |
| 1 | Auth & User Management | 🟡 In Progress | JWT auth, role-based access, user CRUD, barcode assignment |
| 2 | Class Management | 🟡 In Progress | Class sessions, attendance (barcode + Zoom webhook), video recordings |
| 3 | Exam System | 🟡 In Progress | Exam CRUD, paper PDF upload, MCQ engine, answer submission, server timers |
| 4 | Marking & Results | 🟡 In Progress | Marker assignment + grading API done; UI pending |
| 5 | Payments | 🟡 In Progress | PayHere + bulk upload API done; role-aware `/payments` UI ✅ (2026-07-11) — student overview/history + admin summary/records/bulk-upload; new `GET /payments/summary` aggregate. PayHere live charge works end-to-end. **Pay-at-entrance + printable receipts ✅ (2026-07-14/15)** — `collectEntrancePayment`, barcode resolution, `CollectPayment`/`PaymentReceipt` + `/payments/[id]`. **Payment override UI still absent** (backend `PAYMENT_OVERRIDDEN` audit action + `PATCH /:id/override` exist; no frontend) — genuine remaining gap. Refunds still absent. |
| 6 | Notifications & Real-Time | 🟡 In Progress | Notification bell + settings ✅ (2026-07-10); RESULTS_PUBLISHED/TIMETABLE_UPDATED/EXAM_CONTROL SSE events still have no frontend listener (confirmed still true 2026-07-15) |
| 7 | Admin Dashboard | 🟡 In Progress | User management UI ✅ (incl. reactivate/list-inactive); subjects + institutes management pages ✅ (2026-07-11, SUPER_ADMIN-only, wired to existing `/subjects` + `/institutes` CRUD — verified: 18 Vitest+RTL unit tests, `tsc`+`build` green, and a headless-Chromium UI smoke on the live Docker stack: create/edit/deactivate/filter/duplicate-409 for both + ADMIN bounced by the SSR gate); audit log viewer ✅ (2026-07-10); financial reports ✅ (2026-07-12, SUPER_ADMIN-only `/admin/reports` — revenue trend / by-course / by-method / outstanding, new `GET /payments/reports` aggregate, Recharts). Payment-override UI (see Phase 5) and the "Sync Attendance" reconciliation button (see Known Risks) are this phase's two remaining concrete gaps. |
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
- [x] Build attendance scanner page (admin/front-desk view) — `(app)/attendance/page.tsx` staff branch (SUPER_ADMIN/ADMIN) is a working entrance scanner (2026-07-11): class→session picker, keyboard-wedge + camera-QR (`@zxing/browser`) scanning → `POST /attendance/scan`, live deduped roster (`GET /attendance/session/:id`), and manual mark-by-name (`GET /users?search` → `POST /attendance/manual`). TEACHER/MARKER still `ComingSoon`
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
- [ ] Build payment override UI (super admin) — backend `PAYMENT_OVERRIDDEN` audit action + `PATCH /:id/override` exist; frontend not built — **confirmed still absent 2026-07-15** (genuine remaining gap)

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
- [ ] Implement "Sync Attendance" reconciliation button (genuine gap — **confirmed still absent 2026-07-15**, no reconciliation function/route/UI found anywhere)

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
- [ ] Run backend smoke tests (requires prod-like env)
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
- [ ] Run `docker compose up -d --build` (postgres + nginx + API + worker + Redis + backup); then `prisma migrate deploy` in-container
- [ ] Run one restore drill ([12 §8](./12-data-backup-and-recovery.md)) before cutover
- [ ] Set up Sentry projects (frontend + backend, free tier)
- [ ] GitHub Actions: build/test on PR; on merge to `main`, SSH deploy (`git pull && docker compose up -d --build`) — **confirmed genuinely not started 2026-07-15**: `.github/workflows/` doesn't exist. Distinct from the dev-side Compose stack, which IS fully built (postgres/nginx/backend/worker/redis/backup all running, real backups have executed) — don't confuse the two when re-checking this phase.
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
| Zoom webhook missed during server restart | Retry config + Admin "Sync" button | ⬜ To implement (confirmed absent 2026-07-15 — no reconciliation function/route/UI exists) |
| JWT expiry during long exam | Silent refresh token rotation | 🟡 Partial — reactive refresh-on-401 exists (`frontend/lib/api.ts`, single retry); no proactive/background rotation ahead of the 15-min expiry |
| R2 presigned URL expiry during slow upload | Multipart upload with token refresh | ⬜ To implement (confirmed absent 2026-07-15 — NIC/exam-paper/answer-PDF uploaders are single presign→PUT→confirm, no resume path) |
| Video piracy (leaked stream link) | Bunny token-authenticated embed + MediaCage DRM, enrolled/paid gating, per-student watermark overlay | ✅ Done (2026-07-11, PR #56 — see `docs/superpowers/specs/2026-07-11-bunny-video-drm-design.md`) |
| Live-class link sharing | Per-session Zoom SDK signature bound to authenticated enrolled+paid student | ✅ Done |
| DRM black screen on external monitors | Frontend detection overlay with user guidance | ⬜ Not planned — Web Meeting SDK has no OS-level capture-blocking; CLAUDE.md documents this as an **accepted limitation**, not a bug to fix |
| Single VPS is a single point of failure | Self-hosted Postgres on a persistent volume + the `backup` service (verified, encrypted, **off-site** dumps) + nightly Redis snapshot; scripted rebuild + restore runbook ([12](./12-data-backup-and-recovery.md)) | 🟡 Backup engine built & validated; configure off-site + drill before cutover |
| Webhook spam from flaky student connections | Upsert-based webhook handlers (Zoom/Bunny `updateMany`; PayHere `findUnique`+`update` on the pre-existing row) | ✅ Done |
| Database cascade delete via FK | Soft deletes + `onDelete: Restrict`/`SetNull` (no `Cascade` anywhere in `schema.prisma`, confirmed 2026-07-15) | ✅ Done |
| Multi-worker cron job collision | BullMQ distributed queue | ✅ Done |
| **New 2026-07-15:** `timetable.service.ts` hard-deletes a `TimetableSlot` row despite an inbound FK and an unused `isActive` column | Switch to soft-delete (`isActive: false`) matching every other model | ⬜ To implement |
| **New 2026-07-15:** PayHere webhook signature compared with `!==` instead of constant-time | Switch to `crypto.timingSafeEqual`, matching Zoom/Bunny | ✅ Done (2026-08-13) |
| **New 2026-07-15:** `Idempotency-Key` missing on `/payments/:id/override`, `/payments/bulk-upload`, `/users/:id/{role,status,barcode}` | Add `checkIdempotency` to match `/initiate`/`/collect-entrance`/mark-finalization | ✅ Done (2026-07-22) |
| **New 2026-07-15:** 10/21 backend services have zero test coverage, incl. the core `access.service.ts` content gate | Backfill Vitest coverage, prioritizing `access`/`exam`/`submission`/`video` | ⬜ To implement |
| **New 2026-07-15:** No CI pipeline — nothing runs tests/build on PR | Add `.github/workflows/ci.yml` (lint + `tsc` + `vitest run` for both apps) | ⬜ To implement |
