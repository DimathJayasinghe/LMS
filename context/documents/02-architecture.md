# 02 — Architecture

> Defines the technology stack, system topology, layer boundaries, and **invariants** the codebase must never violate.
>
> **Guiding principle: lowest cost, lowest complexity, still secure and reliable.** For ~1,200 students this system runs comfortably on **one small VPS**. We do **not** use Kubernetes, auto-scaling, or multi-instance load balancing — those add cost and operational burden this scale does not need. We keep the code stateless anyway (see §5.1) because it is nearly free discipline that leaves the door open to scale later.

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
│  3. MANAGED DATA LAYER                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Neon Serverless PostgreSQL (free tier)            │  │
│  │  — automated backups + point-in-time restore      │  │
│  │  — pooled connection string (PgBouncer built-in)  │  │
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
- **Postgres is the only managed piece of the data layer** (Neon free tier) because a database is the one thing you must never lose, and Neon gives automated backups + point-in-time restore for $0 at this scale.
- **Redis is self-hosted** in the same Compose file. On a single instance there is no cross-instance state to synchronise, so a managed Redis buys nothing — self-hosting is free and one less external dependency.
- **The frontend is on Vercel's free tier** (edge-hosted Next.js). It could also be containerised on the same VPS; Vercel is chosen only because it is free and zero-effort. See [09-cost-and-hosting.md](./09-cost-and-hosting.md).

---

## 2. Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | Next.js 14+ (App Router) + TypeScript | SSR, client UI, SEO |
| **State Management** | Zustand + React Query (TanStack Query) | Cross-tab sync, server-state caching |
| **Form Handling** | React Hook Form + Zod | Validation on client and server |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **Backend API** | Node.js + Express.js + TypeScript | Stateless REST API (Route → Controller → Service) |
| **Real-Time** | Server-Sent Events (SSE) | One-way push to clients (results, timers, attendance) |
| **Auth** | JWT (access + refresh tokens in HTTP-only cookies) | Stateless session management |
| **Database** | Neon Serverless PostgreSQL | Relational source of truth |
| **ORM** | Prisma | Type-safe queries, migrations |
| **Connection Pooling** | Neon pooled connection string (PgBouncer, built-in) | Keeps Postgres connection count safe |
| **Cache / Pub-Sub / Queue** | Redis (self-hosted in Compose) | Result cache, rate-limit store, BullMQ backbone, SSE fan-out |
| **Task Queue** | BullMQ | Background jobs (SMS, cleanup, cron) on a separate worker process |
| **File Storage** | Cloudflare R2 | Zero-egress S3-compatible; presigned URL uploads |
| **Video CDN** | Bunny.net (Bunny Stream) | HLS VOD with IP-bound tokens |
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
| Backend → PostgreSQL | TCP via Neon pooled URL | Prisma ORM queries through the connection pooler |
| Backend ↔ Redis | RESP protocol | Cache reads/writes, BullMQ enqueue, SSE Pub/Sub |
| Worker ↔ Redis | RESP protocol | BullMQ job dequeue and processing |
| Worker → PostgreSQL | TCP via Neon pooled URL | Background job database writes |
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

### 5.5 Soft Deletes Only
- Models with child relations (ClassSession, Exam) use a nullable `deletedAt` timestamp — never hard delete.
- All FK `onDelete` rules are `Restrict` or `SetNull` — never `Cascade`.

### 5.6 Direct-to-Cloud File Transfers
- Files never pass through the Node.js server. Backend generates presigned URLs; client uploads directly to R2.
- Large files use multipart chunked upload with automatic token refresh.

### 5.7 Distributed-Safe Background Jobs
- All scheduled/recurring tasks run via **BullMQ**, never `node-cron` or `setTimeout`.
- BullMQ gives durable retries with backoff and exactly-once semantics — valuable even with one worker (jobs survive a restart because they live in Redis).

### 5.8 Webhook Resilience
- All webhook handlers are idempotent (use `upsert`, not `create`).
- Webhook signatures are verified before processing (Zoom HMAC + timestamp; PayHere hash).
- External services are configured with retry policies; Admin "Sync" buttons exist as manual reconciliation fallbacks.

---

## 6. DNS & Hosting Layout

| Domain | Target | Host |
|--------|--------|------|
| `academylms.com` / `www.academylms.com` | Next.js frontend | Vercel |
| `api.academylms.com` | nginx → Node.js backend | Single VPS |

- **DNS Provider**: Cloudflare (free).
- **Frontend**: `CNAME` for `@` / `www` → Vercel.
- **Backend**: `A` record for `api` → the VPS public IP. Proxy through Cloudflare (orange cloud) for a free CDN + DDoS shield if desired.
- **TLS**: nginx terminates TLS on the VPS using a free Let's Encrypt certificate (auto-renewed). Vercel handles frontend TLS automatically.

---

## 7. Security Model

| Layer | Mechanism |
|-------|-----------|
| Transport | HTTPS everywhere (Vercel TLS + nginx/Let's Encrypt on the VPS) |
| Authentication | JWT access token (15 min) + refresh token (7 days), both in HTTP-only cookies |
| Refresh tokens | Hashed (SHA-256) before DB storage; rotated on use; reuse detection revokes the whole family |
| Authorization | Role-based middleware guard (`requireRole('SUPER_ADMIN', 'ADMIN')`), plus optional per-user `Permission` overrides (see 08) |
| Input Validation | Zod schemas in middleware — reject before reaching the controller |
| Rate Limiting | `express-rate-limit` with Redis store (auth routes tightened to 10/min/IP) |
| HTTP Hardening | Helmet.js on all responses |
| CORS | Strict origin whitelist (`academylms.com` only), `credentials: true` |
| Secrets | Kept in `backend/.env` on the VPS (never committed); loaded via Docker `env_file` |
| DRM / Anti-piracy | IP-bound Bunny.net tokens; black-screen detection UI |
| File Security | Time-limited presigned URLs; no public R2 bucket access |
| Audit | Every privileged mutation writes an `AuditLog` row (actor, role, IP, user-agent, before/after) |

### 7.1 Content Protection — Live & Recorded Classes

Teachers deliver classes **live through the site** and publish **recorded classes through the site**. Both are premium content the institution pays to produce, so both are access-gated and piracy-hardened. **Content is never public** — every request is authorized per student, per course.

**Access gate (applies to both live and recorded):**
- The requesting user must be authenticated, have an **active `Enrollment`** in the course, and have the **current month paid** (`Payment.status = SUCCESS` for `paymentMonth`). The service layer checks this before issuing any stream token.
- Access decisions live in the service layer — no signed URL or SDK signature is ever handed out without passing the gate.

**Recorded classes (Bunny.net Stream, embedded in the site):**
- Playback uses **short-lived, IP-bound signed tokens** generated server-side (bound to `req.ip`). A leaked URL fails from any other IP with `403`.
- HLS chunked delivery; **no public Bunny library**; the raw `bunnyVideoId` is never exposed to the client without a fresh token.
- **Per-student watermark overlay** (student index number + name) rendered over the player — a cheap, strong deterrent against screen-record redistribution.
- DRM/HDCP is on; the player detects the "innocent black screen" (frame rate 0 with audio) and shows guidance rather than flooding support.

**Live classes (Zoom Web SDK, embedded in the site):**
- The live session runs **inside the site** via the Zoom Web SDK — students do not leave the LMS.
- The join **signature is generated server-side per session**, short-lived, and only after the access gate passes — it cannot be pre-shared to non-enrolled users.
- Joining fires the Zoom webhook → `upsert` attendance (see §5.8).
- Optional lower-cost/self-hosted alternative (if Zoom cost becomes an issue): Bunny.net live streaming with the same token gate. Zoom is kept for v1 because it is already in the stack and gives interactivity.

**Rate limits:** token/signature endpoints are rate-limited per user to stop scripted harvesting of stream credentials.
