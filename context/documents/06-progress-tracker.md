# 06 — Progress Tracker

> The living document. Updated after every task. Allows the agent to pick up exactly where it left off.

---

## Current Status

| Field | Value |
|-------|-------|
| **Current Phase** | Phase 9 — Polish & Hardening |
| **Last Updated** | 2026-05-29 |
| **Last Completed Task** | Step 13 — Audit Logs + SMS |
| **Next Task** | Step 14 — Hardening (Sentry, logging, env validation, smoke tests) |
| **Blockers** | None |

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

## Phase 10 — Deployment

### Tasks

- [ ] Configure Vercel project + custom domain
- [ ] Provision EC2 instance + PM2 (API + worker)
- [ ] Set up Cloudflare DNS records
- [ ] Configure Neon PostgreSQL + PgBouncer pooled URL
- [ ] Set up Redis instance (Upstash)
- [ ] Set up Sentry projects (frontend + backend)
- [ ] Create GitHub Actions CI/CD pipeline (staging → production)
- [ ] Smoke test full system on staging
- [ ] Production deploy + monitoring

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

---

## Known Risks & Mitigations

| Risk | Mitigation | Status |
|------|-----------|--------|
| Thundering herd on result release | Redis caching for result queries | ⬜ To implement |
| Zoom webhook missed during server restart | Retry config + Admin "Sync" button | ⬜ To implement |
| JWT expiry during long exam | Silent refresh token rotation | ⬜ To implement |
| R2 presigned URL expiry during slow upload | Multipart upload with token refresh | ⬜ To implement |
| DRM black screen on external monitors | Frontend detection overlay with user guidance | ⬜ To implement |
| Webhook spam from flaky student connections | Upsert-based webhook handlers | ✅ Done |
| Database cascade delete | Soft deletes + `onDelete: Restrict` | ✅ Done |
| Multi-server cron job collision | BullMQ distributed queue | ✅ Done |
