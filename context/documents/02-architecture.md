# 02 — Architecture

> Defines the technology stack, system topology, layer boundaries, and **invariants** the codebase must never violate.
>
> **Guiding principle: lowest cost, lowest complexity, still secure and reliable.** For ~1,200 students this system is designed to run on **one small VPS**. We do **not** use Kubernetes, auto-scaling, or multi-instance load balancing — those add cost and operational burden this scale does not need. We keep the code stateless anyway (see §5.1) because it is nearly free discipline that leaves the door open to scale later.

---

## 1. High-Level Topology

```
┌─────────────────────────────────────────────────────────┐
│  1. CLIENT LAYER                                         │
│  ┌──────────────────┐   ┌──────────────────────────┐    │
│  │ Next.js Frontend │   │ External Webhooks        │    │
│  │ (Vercel, free)   │   │ (Zoom, PayHere)          │    │
│  └────────┬─────────┘   └──────────┬───────────────┘    │
└───────────┼────────────────────────┼────────────────────┘
            │ HTTPS                   │ HTTPS
            ▼                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. SINGLE VPS  (~$5–12/mo — Hetzner / DigitalOcean)     │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Docker Compose                                    │ │
│  │  ┌────────┐  ┌──────────┐  ┌────────┐  ┌────────┐  │ │
│  │  │ nginx  │→ │ backend  │  │ worker │  │ redis  │  │ │
│  │  │ (TLS)  │  │ (API)    │  │(BullMQ)│  │(cache/ │  │ │
│  │  │        │  │          │  │        │  │ queue) │  │ │
│  │  └────────┘  └────┬─────┘  └───┬────┘  └────────┘  │ │
│  └───────────────────┼───────────┼───────────────────┘ │
└──────────────────────┼───────────┼─────────────────────┘
                       │           │  (TCP, pooled)
                       ▼           ▼
┌─────────────────────────────────────────────────────────┐
│  3. DATA LAYER (self-hosted in Compose, private network) │
│  ┌───────────────────────────────────────────────────┐  │
│  │ PostgreSQL 16 — `postgres` service, `pgdata` vol  │  │
│  │  — not exposed to host/internet                   │  │
│  │  — `backup` sidecar: verified+encrypted+off-site  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  4. EXTERNAL SERVICES (pay-per-use / free tiers)        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ Cloudflare │ │ Bunny.net  │ │ Notify.lk  │           │
│  │ R2 (Files) │ │ (Videos)   │ │ (SMS)      │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│  ┌────────────┐ ┌────────────┐                          │
│  │ PayHere    │ │ Zoom       │                          │
│  │ (Payments) │ │ (Live)     │                          │
│  └────────────┘ └────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

**Why this shape:**
- **One VPS runs everything** for the backend: nginx (TLS termination + reverse proxy), the API, the BullMQ worker, and Redis — all as containers in one `docker-compose.yml`. Deploy is `git pull && docker compose up -d --build`.
- **Postgres is self-hosted** in the same Compose stack on a persistent `pgdata` volume, reachable only over the private Docker network. Durability is our own **`backup` service** — scheduled, verified, encrypted, off-site dumps with monthly restore drills. This removes the managed-DB bill and the free-tier cold-start problem; see [12-data-backup-and-recovery.md](./12-data-backup-and-recovery.md).
- **Redis is self-hosted** in the same Compose file. On a single instance there is no cross-instance state to synchronise, so a managed Redis buys nothing — self-hosting is free and one less external dependency.
- **The frontend is on Vercel's free tier** (edge-hosted Next.js). It could also be containerised on the same VPS; Vercel is chosen only because it is free and zero-effort. See [09-cost-and-hosting.md](./09-cost-and-hosting.md).

---

## 2. Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | Next.js 16 (App Router) + React 19 + TypeScript | SSR, client UI, SEO |
| **State Management** | Zustand + React Query (TanStack Query) | Cross-tab sync, server-state caching |
| **Form Handling** | React Hook Form + Zod | Validation on client and server |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **Backend API** | Node.js + Express 5 + TypeScript | Stateless REST API (Route → Controller → Service). **Staying on Express** is a recorded decision (2026-11-19): the strict layering, separate BullMQ worker, idempotent webhooks and 27 service modules (most with colocated Vitest suites) already provide what a framework migration would, so no NestJS rewrite is planned |
| **Real-Time** | Server-Sent Events (SSE) | One-way push to clients (results, timers, attendance) |
| **Auth** | JWT (access + refresh tokens in HTTP-only cookies) | Stateless session management |
| **Database** | PostgreSQL 16 (self-hosted in Compose, `pgdata` volume) | Relational source of truth |
| **ORM** | Prisma 7 | Type-safe queries, migrations; a tenant-scoping client extension is planned ([14](./14-multi-tenancy-readiness.md) §6) |
| **Connection Pooling** | Prisma client pool (add pgbouncer only if `max_connections` is ever exceeded) | Keeps Postgres connection count safe |
| **Cache / Pub-Sub / Queue** | Redis (self-hosted in Compose) | Result cache, rate-limit store, BullMQ backbone, SSE fan-out |
| **Task Queue** | BullMQ | Background jobs (SMS, cleanup, cron) on a separate worker process |
| **File Storage** | Cloudflare R2 | Zero-egress S3-compatible; presigned URL uploads |
| **Video CDN** | Bunny.net (Bunny Stream) | HLS VOD through Bunny's token-authenticated embed player; MediaCage DRM where enabled on the library |
| **Live Classes** | Zoom Web SDK + Zoom API webhooks | Browser-embedded live sessions; attendance via webhook |
| **Payments** | PayHere | Sri Lankan payment gateway; webhook-confirmed |
| **SMS** | Notify.lk (Lite plan) | Student notifications |
| **Reverse Proxy / TLS** | nginx (container) | TLS termination, forwards to the API container |
| **Hosting (Frontend)** | Vercel (free tier) | Edge-optimized Next.js hosting |
| **Hosting (Backend)** | Single VPS + Docker Compose | nginx + API + worker + Redis in one box |
| **Observability** | Sentry (free tier) + Pino | Crash reporting + structured JSON logging |
| **Security** | Helmet.js + express-rate-limit (Redis-backed) | HTTP hardening + rate limiting |
| **CI/CD** | GitHub Actions | Build/test on PR; deploy on merge to `main` |

**Deliberately NOT used** (cut for cost / complexity):
- **Kubernetes / HPA / auto-scaling** — unjustified at 1,200 users; a single VPS with Redis caching absorbs the result-release spike. The `k8s/` folder should be deleted.
- **Sanity CMS** — marketing pages (banners, timetable) are plain static content in Next.js. This removes a paid dependency *and* the Next.js on-demand-revalidation complexity.
- **A managed Redis (Upstash)** — no cross-instance state to share on one box.
- **Email (Resend/SMTP)** — SMS via Notify.lk is the notification channel for v1. If email is later needed, it becomes another BullMQ job. (Note: `resend` is currently a backend dependency but unused — see the drift log in the Progress Tracker.)

---

## 3. Domain-Driven Separation

### Frontend (`/frontend`) — a single Next.js app for all roles

```
frontend/
├── app/                      # Next.js App Router
│   ├── (public)/             # Landing, login — no auth required (static marketing)
│   ├── (dashboard)/          # Authenticated layout shell
│   │   ├── student/
│   │   ├── admin/
│   │   ├── marker/
│   │   └── super-admin/
│   └── api/                  # Next.js route handlers (thin; e.g. health)
├── components/               # Shared UI components
├── lib/                      # Axios instance, Zustand stores, utilities
└── public/
```

> **One frontend only.** The abandoned `admin_frontend/` and `admin_panel/` folders have been removed. All roles are served from `frontend/` via App Router route groups.

### Backend (`/backend`)

```
backend/
├── prisma/
│   └── schema.prisma         # Database blueprint (see 08-database-design.md)
├── src/
│   ├── config/               # env validation, Redis/DB clients, logger, Sentry
│   ├── middleware/           # JWT auth, role guard, validation, idempotency, rate-limit
│   ├── routes/               # Express route definitions (URL → middleware → controller)
│   ├── controllers/          # Request/response handlers (thin — extract, delegate, respond)
│   ├── services/             # Business logic + Prisma queries (ONLY layer touching DB)
│   ├── jobs/                 # BullMQ queue definitions + job payload types
│   ├── utils/                # Helpers (R2 presign, PayHere hash, Bunny token, etc.)
│   ├── index.ts              # Express app entry point
│   └── worker.ts             # Separate BullMQ worker entry point
├── Dockerfile
└── package.json
```

---

## 4. Communication Protocols

| Path | Protocol | Description |
|------|----------|-------------|
| Browser → nginx → Backend | REST over HTTPS | All CRUD operations via JSON |
| Backend → Browser | SSE (HTTP stream) | Real-time push (results, timer sync, timetable updates) |
| Backend → PostgreSQL | TCP on private Docker network (`postgres:5432`) | Prisma ORM queries |
| Backend ↔ Redis | RESP protocol | Cache reads/writes, BullMQ enqueue, SSE Pub/Sub |
| Worker ↔ Redis | RESP protocol | BullMQ job dequeue and processing |
| Worker → PostgreSQL | TCP on private Docker network (`postgres:5432`) | Background job database writes |
| Browser → Cloudflare R2 | HTTPS (presigned URL) | Direct file upload — backend never touches the file |
| Browser → Bunny.net | HLS over HTTPS | Token-protected video streaming |
| Browser → Zoom | Zoom Web SDK (WebRTC) | Live class; Zoom fires webhook back to backend |
| Zoom / PayHere → Backend | HTTPS Webhook | Event confirmation (attendance, payment) |

> **SSE fan-out via Redis Pub/Sub is retained even on a single instance.** It costs nothing extra (Redis is already present for BullMQ), and it is what makes adding a second API container a no-op if the institute ever grows.

---

## 5. Architectural Invariants

These rules **must never be violated**. Every code review checks against this list.

### 5.1 Stateless API (free discipline, not premature scaling)
- **No shared mutable state in Node.js process memory.** Counters, sessions, live-connection registries, and caches live in Redis.
- We run **one** API instance today, so in-memory state would not *break correctness* — but we still forbid it because:
  1. The BullMQ **worker is a separate process** and must share state with the API via Redis regardless.
  2. It keeps a future second instance behind nginx a zero-refactor change.
- No local disk uploads via `multer` — files go direct to R2 (§5.6).

### 5.2 Three-Tier Boundary Enforcement
- **Routes** → define URL + apply middleware. Zero business logic.
- **Controllers** → extract from `req`, call a service, return `res`. **Zero Prisma imports.**
- **Services** → all business logic + all database/third-party calls. The **only** layer touching Prisma.

### 5.3 Server-Authoritative Time
- All exam timers, deadlines, and expiration checks use **server time**, never `Date.now()` from the client.
- Frontend timers are purely visual countdowns.

### 5.4 Idempotent Mutations
- All high-stakes `POST` routes (payments, mark finalization, account activation) require an `Idempotency-Key` header.
- Backed by the `IdempotencyRecord` table plus a Redis `SET NX` lock that closes the TOCTOU race window (see the two-layer pattern in `Guides_And_Summeries/improvements_summary.md`).
- A uniqueness rule that spans several tables (for example a scan code across `User.barcode` and `StudentBarcode`) cannot be a database constraint, so every writer checks it inside one transaction after `withAdvisoryLock` (`backend/src/utils/advisory-lock.ts`; key `namespace:organizationId:key`) and reuses the one guard (`scan-code.service.ts`). Do not add inline `pg_advisory_xact_lock(hashtextextended(<id>, 0))` calls.

### 5.5 Soft Deletes Only
- Models with child relations (ClassSession, Exam) use a nullable `deletedAt` timestamp — never hard delete.
- All FK `onDelete` rules are `Restrict` or `SetNull` — never `Cascade`.

### 5.6 Direct-to-Cloud File Transfers
- Files never pass through the Node.js server. Backend generates presigned URLs; client uploads directly to R2.
- Large files use multipart chunked upload with automatic token refresh.
- **Video recordings follow the same principle via Bunny Stream's TUS protocol** (2026-07-10): the backend
  creates the Bunny video + a signed TUS authorization (`POST /videos/uploads`); the teacher's browser
  uploads the file straight to Bunny. Unlike R2 (where the client's own "complete" call flips the status),
  video completion is confirmed by **Bunny's webhook** (`POST /videos/bunny-webhook`, §5.8) — so the upload
  is never lost even if the browser disconnects the instant the transfer finishes. See
  `context/api_endpoints/video.endpoints.md`.

### 5.7 Distributed-Safe Background Jobs
- All scheduled/recurring tasks run via **BullMQ**, never `node-cron` or `setTimeout`.
- BullMQ gives durable retries with backoff and exactly-once semantics — valuable even with one worker (jobs survive a restart because they live in Redis).

### 5.8 Webhook Resilience
- All webhook handlers are idempotent (use `upsert`, not `create`).
- Webhook signatures are verified before processing (Zoom HMAC + timestamp; PayHere hash).
- External services are configured with retry policies; Admin "Sync" buttons exist as manual reconciliation fallbacks.

### 5.9 Tenant Scoping (target invariant — M1 foundation implemented, scoping not yet)

Decided 2026-11-19; implementation order is the M1–M8 plan in [14-multi-tenancy-readiness.md](./14-multi-tenancy-readiness.md).
Once its foundation steps land, every review also checks:

- Every tenant-owned table carries `organizationId`, and the tenant-model registry test is green.
- Services reach the database only through the **scoped Prisma client** built from the authenticated actor's organization; a client-supplied `organizationId` is never trusted.
- Provider credentials, R2 keys, Redis keys, SSE channels and job payloads are organization-scoped; webhooks identify the organization before verifying signatures.
- A table-driven tenant-isolation test covers every new route.

M1 (2026-11-19) added the `Organization` table, the default row and a nullable `organizationId` on every model, with a registry test and a CI tenant integrity check. Until M2–M3 land the system has exactly one organization and most queries are not yet tenant-scoped, and new code should not add anything that would block these steps (for example new global uniques on user-visible values until M3; until M5 hand-built storage and cache keys; until M4 new provider-credential reads from env; M4–M7 wait for a second organization).

---

## 6. DNS & Hosting Layout

| Domain | Target | Host |
|--------|--------|------|
| `academylms.com` / `www.academylms.com` | Next.js frontend and `/api` | One host: nginx on the VPS (`/` to Next.js, `/api` to Express), or Vercel with `/api` rewritten to the VPS |

- **DNS Provider**: Cloudflare (free).
- **Host**: `A` record for `@` / `www` → the VPS public IP (or a `CNAME` to Vercel when `/api` is rewritten to the VPS). Proxy through Cloudflare (orange cloud) for a free CDN + DDoS shield if desired.
- **TLS**: nginx terminates TLS on the VPS using a free Let's Encrypt certificate (auto-renewed). Vercel handles frontend TLS automatically.
- **Future tenants**: each organization is reached at `<slug>.<platform-domain>` (wildcard DNS and certificate). The current single-domain deployment keeps working because unmatched hosts resolve to the default organization ([14](./14-multi-tenancy-readiness.md) §5).

---

## 7. Security Model

| Layer | Mechanism |
|-------|-----------|
| Transport | HTTPS everywhere (Vercel TLS + nginx/Let's Encrypt on the VPS) |
| Authentication | JWT access token (15 min) + refresh token (7 days), both in HTTP-only cookies |
| Refresh tokens | Hashed (SHA-256) before DB storage; rotated on use (row marked `rotatedAt`); reuse beyond a short tolerance (`REFRESH_REUSE_GRACE_SECONDS`, default 10 s) revokes the whole family; the access cookie outlives the JWT and the frontend refreshes silently (`proxy.ts` → `/auth/session`, single flight) |
| Authorization | Role-based middleware guard (`requireRole('SUPER_ADMIN', 'ADMIN')`) gates by the **caller's** role only; course-scoped content (exams/videos/submissions/sessions) additionally requires `assertCourseAccess` in the service layer so a `TEACHER` is scoped to courses they actually teach — see CLAUDE.md's "Auth & authorization" section. The unused per-user `Permission` model is removed (D-IDENTITY-4) |
| Input Validation | Zod schemas in middleware — reject before reaching the controller |
| Rate Limiting | `express-rate-limit` with Redis store: global per verified user or anonymous address; separate login account/address, login address, registration address and refresh user/address buckets |
| HTTP Hardening | Helmet.js on all responses |
| CORS | Strict origin whitelist (`academylms.com` only), `credentials: true` |
| Secrets | Kept in `backend/.env` on the VPS (never committed); loaded via Docker `env_file` |
| DRM / Anti-piracy | Bunny token-authenticated embed (signed URL, 4-hour TTL) + MediaCage DRM where the library enables it + per-student watermark; no black-screen detection exists in the player |
| File Security | Time-limited presigned URLs; no public R2 bucket access |
| Audit | Every privileged mutation writes an `AuditLog` row (actor, role, IP, user-agent, before/after) |

### 7.1 Content Protection — Live & Recorded Classes

Teachers deliver classes **live through the site** and publish **recorded classes through the site**. Both are premium content the institution pays to produce, so both are access-gated and piracy-hardened. **Content is never public** — every request is authorized per student, per course.

> **Local development:** DRM exists only with a real Bunny Stream library. The offline stack will replace Bunny with a **planned** local video driver (not yet implemented) that emulates the upload/webhook/embed contract and has **no copy protection** ([16-local-development.md](./16-local-development.md)). Verify DRM and token behaviour against real Bunny before launch.

**Access gate (applies to both live and recorded):**
- The requesting user must be authenticated, have an **active `Enrollment`** in the course, and be covered by a SUCCESS payment for the organization billing month or the configured grace rule (default: first 10 days with the previous month paid). The service layer checks this before issuing any stream token.
- Access decisions live in the service layer — no signed URL or SDK signature is ever handed out without passing the gate.

**Recorded classes (Bunny.net Stream, embedded in the site):**
- Playback uses Bunny's **token-authenticated iframe embed**. The backend (`getSignedBunnyEmbedUrl` in `utils/bunny.ts`) signs `SHA256(tokenKey + videoId + expires)` with the library's token authentication key and returns an embed URL that expires after `BUNNY_TOKEN_TTL_SECONDS` (4 hours). A URL that has expired, or that was altered, is refused by Bunny. **The token is not bound to an IP address**: an earlier design bound HLS tokens to `req.ip`, and that function (`generateBunnyStreamUrl`) is now unused and should be deleted in the next code-alignment pass.
- **No public Bunny library**; the raw `bunnyVideoId` is never sent to students as a metadata field (the signed embed URL they receive contains it, and is useless without its token), and the token is only issued after the access gate passes and the video is `READY`. Recording reads (list, metadata, stream) are limited to enrolled students, the owning teacher and the owner by one access function (`assertRecordingAccess` in `video.service.ts`) behind route-level role guards; front-desk and marker accounts get `403 FORBIDDEN_ROLE`, and teacher or owner stream opens are written to the audit log (`RECORDING_STREAM_STAFF`).
- **DRM**: MediaCage DRM is a library-level setting in the Bunny dashboard ("enable if the plan allows" in the July design). It cannot be confirmed from code, so treat it as unverified until checked in staging. Token protection works without it. The Bunny key currently configured is documented as invalid, so real playback has not been proven end to end.
- **Per-student watermark overlay** (student name + index number) rendered over the player and repositioned on an interval — a deterrent against screen-record redistribution, not a guarantee.
- Webhooks from Bunny are verified by HMAC over the raw body using the read-only API key (see `verifyBunnyWebhookSignature`).

**Live classes (Zoom Meeting SDK, embedded in the site — implemented 2026-07-10):**
- Teachers **schedule through the site**: `POST .../live/schedule` calls Zoom's REST API (Server-to-Server
  OAuth app) to actually create the meeting, replacing the old "paste a Zoom link you made yourself" step.
  Both host and students then **join embedded in the LMS** (`@zoom/meetingsdk`) — nobody leaves the site.
- The join/host **JWT is generated server-side per attempt**, freshly minted (never cached/reused across
  page loads) and only after the same enrolled+paid gate as recorded video — it cannot be pre-shared to
  non-enrolled users. Zoom enforces a 30-minute floor on the JWT's own lifetime; a Redis-backed per-
  `(session, user)` throttle (8s) is the actual "single-use-ish" control.
- A single Zoom Licensed account hosts every meeting — **our own Enrollment/Payment tables decide who joins
  as host vs participant, not Zoom's account model.** This means Zoom's On-Behalf-Of (OBF) token requirement
  (added for apps joining meetings on a genuinely *external* account) does not apply here; a ZAK is still
  fetched fresh per host-start. See `context/api_endpoints/live-class.endpoints.md` for the full auth model
  — this area of Zoom's platform changed materially after most training data was collected, so that doc was
  written against Zoom's live, current documentation, not assumed knowledge.
- **Honest limit on anti-recording**: the Web Meeting SDK has no HDCP/OS-level capture prevention (unlike
  the VOD player above) — that only exists on Zoom's *native* SDKs. The realistic ceiling here is deterrence,
  not prevention: locked-down meeting settings (no cloud/local recording, waiting room, muted+video-off
  entry), the same watermark-overlay philosophy as VOD (name + index + live timestamp, repositioning), and
  basic UI hardening. A native mobile app (which *could* add real OS-level capture-blocking) was explicitly
  scoped out for now — noted as a real future phase, not a gap.
- Joining fires the existing Zoom webhook → `upsert` attendance (see §5.8) — unchanged, since it already
  matched on `classSession.zoomMeetingId`, which this flow populates the same way.

**Rate limits:** token/signature endpoints are rate-limited per user to stop scripted harvesting of stream credentials.

**Frontend (implemented 2026-07-10):** `LiveClassAction` on the class detail page (schedule/start/join CTA,
never a raw zoom.us link) and `LiveClassRoom` at `/classes/[classId]/live/[sessionId]` (dynamic-imports
`@zoom/meetingsdk/embedded`, fetches a fresh token per visit, renders the repositioning watermark). See
`context/frontend/06-frontend-roadmap.md` for the packaging notes (React 19 peer-dep override, private
`@zoom/download-manager` stub). Verified against the full production container stack via a downstream Prisma
fixture (Zoom credentials are still placeholders) — see that doc's entry for what was and wasn't exercised.

### Organization settings and billing clock

`OrganizationSetting` holds owner changes keyed by organization and registry key. Missing rows use typed registry defaults; only `SUPER_ADMIN` can edit, and changes and audit rows commit together. Reads use a per-request memo with no shared cache. Billing months and grace use `Organization.timezone` (default `Asia/Colombo`); setting `fees.graceDays` to 0 restores the strict monthly gate.
