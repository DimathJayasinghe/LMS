# 06 — Progress Tracker

> The living document. Updated after every task. Allows the agent to pick up exactly where it left off.

---

## Current Status

| Field | Value |
|-------|-------|
| **Current Phase** | Phase 9 — Polish & Hardening (paused for schema realignment) |
| **Last Updated** | 2026-07-09 |
| **Last Completed Task** | Docs revision — cost/complexity refactor + institution model (subjects, teachers) |
| **Next Task** | **Phase S — Schema Realignment** (see below) before resuming frontend/hardening |
| **Blockers** | Schema in code predates the revised design (roles, Subject, teacher ownership) |

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
- [ ] Submission flow: accept & store `writtenAnswers` (typed essay/structured answers) + autosave contract
- [ ] Payment flow: pay-at-entrance endpoint setting `method=ENTRANCE` + `collectedById`
- [ ] Attendance scan: accept `source=QR` on the entrance-scan endpoint
- [ ] Live classes: server-signed Zoom SDK join endpoint (same content gate) + per-student video **watermark** overlay (frontend)
- [ ] Enrollment CRUD endpoints (the `Enrollment` model has no API yet — needed for the gate to have data)
- [ ] Teacher-scoped **reads** for attendance (currently `SUPER_ADMIN`+`ADMIN`)
- [ ] **Student account-setup flow**: NIC front/back R2 upload endpoints, register/list/delete `StudentBarcode` per institute, flip `setupCompleted`; block content until setup done + account active
- [ ] Physical attendance scan by **institute context**: resolve `(instituteId, barcode)` → student (add institute to the scan endpoint + optionally `Attendance.instituteId`)

---

## Phase Overview

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| 0 | Project Setup | 🟡 In Progress | Repo init, package scaffolds, env config, Prisma schema, CI/CD skeleton |
| 1 | Auth & User Management | 🟡 In Progress | JWT auth, role-based access, user CRUD, barcode assignment |
| 2 | Class Management | 🟡 In Progress | Class sessions, attendance (barcode + Zoom webhook), video recordings |
| 3 | Exam System | 🟡 In Progress | Exam CRUD, paper PDF upload, MCQ engine, answer submission, server timers |
| 4 | Marking & Results | 🟡 In Progress | Marker assignment + grading API done; UI pending |
| 5 | Payments | 🟡 In Progress | PayHere + bulk upload API done; UI pending |
| 6 | Notifications & Real-Time | 🟡 In Progress | Backend done; notification UI pending |
| 7 | Admin Dashboard | ⬜ Not Started | Audit logs, user management UI, financial reports, support tools |
| 8 | Student Dashboard | ⬜ Not Started | Home view, class schedule, results, payments, video player |
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
- [ ] Build class schedule page (student view)
- [ ] Build attendance scanner page (admin view)
- [ ] Build video player component with DRM black-screen detection

---

## Phase 3 — Exam System

### Tasks

- [x] Create `exam.routes.ts`, `exam.controller.ts`, `exam.service.ts`
- [x] Implement exam CRUD with R2 presigned URL generation
- [x] Implement MCQ question model and answer engine
- [x] Create `submission.routes.ts`, `submission.controller.ts`, `submission.service.ts`
- [ ] Implement multipart PDF upload with token refresh
- [x] Implement server-authoritative exam timer validation
- [ ] Build exam list page (student view)
- [ ] Build exam taking page with countdown timer
- [ ] Build MCQ exam component with localStorage auto-save
- [ ] Build exam creation page (super admin view)

---

## Phase 4 — Marking & Results

### Tasks

- [x] Implement marker assignment (Super Admin → Marker × Exam)
- [x] Implement mark submission (idempotent)
- [x] Implement result publishing (batch)
- [ ] Build marking interface (marker view — PDF viewer + mark input)
- [ ] Build results page (student view)
- [x] Implement SSE broadcast for result publication

---

## Phase 5 — Payments

### Tasks

- [x] Create `payment.routes.ts`, `payment.controller.ts`, `payment.service.ts`
- [x] Implement PayHere payment initiation + webhook handler
- [x] Implement idempotency middleware for payment routes
- [x] Implement Excel bulk payment upload (Admin)
- [ ] Build payment page (student view)
- [ ] Build payment dashboard (admin view)
- [ ] Build payment override UI (super admin)

---

## Phase 6 — Notifications & Real-Time

### Tasks

- [x] Set up SSE endpoint (`/api/stream`)
- [x] Implement Redis Pub/Sub for cross-instance SSE broadcasting
- [x] Create BullMQ worker entry point (`worker.ts`)
- [x] Implement SMS job (Notify.lk integration)
- [x] Implement email notification job (optional)
- [ ] Build notification bell component (frontend)

---

## Phase 7 — Admin Dashboard

### Tasks

- [ ] Build user management table (search, filter, role change)
- [ ] Build audit log viewer
- [ ] Build financial reports page
- [ ] Build support tools (password reset, account unlock)
- [ ] Implement "Sync Attendance" reconciliation button

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
- [ ] GitHub Actions: build/test on PR; on merge to `main`, SSH deploy (`git pull && docker compose up -d --build`)
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

---

## Known Risks & Mitigations

| Risk | Mitigation | Status |
|------|-----------|--------|
| Thundering herd on result release | Redis caching for result queries | ⬜ To implement |
| Zoom webhook missed during server restart | Retry config + Admin "Sync" button | ⬜ To implement |
| JWT expiry during long exam | Silent refresh token rotation | ⬜ To implement |
| R2 presigned URL expiry during slow upload | Multipart upload with token refresh | ⬜ To implement |
| Video piracy (leaked stream link) | IP-bound Bunny tokens + enrolled/paid gating + student watermark overlay | ⬜ To implement |
| Live-class link sharing | Per-session Zoom SDK signature bound to authenticated enrolled+paid student | ⬜ To implement |
| DRM black screen on external monitors | Frontend detection overlay with user guidance | ⬜ To implement |
| Single VPS is a single point of failure | Self-hosted Postgres on a persistent volume + the `backup` service (verified, encrypted, **off-site** dumps) + nightly Redis snapshot; scripted rebuild + restore runbook ([12](./12-data-backup-and-recovery.md)) | 🟡 Backup engine built & validated; configure off-site + drill before cutover |
| Webhook spam from flaky student connections | Upsert-based webhook handlers | ✅ Done |
| Database cascade delete | Soft deletes + `onDelete: Restrict` | ✅ Done |
| Multi-worker cron job collision | BullMQ distributed queue | ✅ Done |
