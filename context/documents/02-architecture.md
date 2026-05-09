# 02 — Architecture

> Defines the technology stack, system topology, layer boundaries, and **invariants** the codebase must never violate.

---

## 1. High-Level Topology

```
┌─────────────────────────────────────────────────────────┐
│  1. CLIENT LAYER                                        │
│  ┌──────────────────┐   ┌──────────────────────────┐    │
│  │ Next.js Frontend │   │ External Webhooks        │    │
│  │ (Vercel)         │   │ (Zoom, PayHere, R2)      │    │
│  └────────┬─────────┘   └──────────┬───────────────┘    │
└───────────┼────────────────────────┼────────────────────┘
            │ HTTPS                  │ HTTPS
            ▼                        ▼
┌─────────────────────────────────────────────────────────┐
│  2. COMPUTE LAYER  (Render — Auto-Scaling Group)        │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Load Balancer (round-robin)                │  │
│  └──────────┬──────────────────────┬──────────────────┘  │
│       ┌─────▼──────┐        ┌─────▼──────┐              │
│       │ Node.js #1 │        │ Node.js #N │              │
│       │ Express    │        │ Express    │              │
│       │ Prisma ORM │        │ Prisma ORM │              │
│       └─────┬──────┘        └─────┬──────┘              │
│             │                     │                      │
│  ┌──────────▼─────────────────────▼──────────────────┐  │
│  │        BullMQ Background Worker (separate)        │  │
│  └───────────────────────┬───────────────────────────┘  │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│  3. DATA LAYER           │                              │
│  ┌───────────────┐  ┌────▼──────────┐                   │
│  │ Redis         │  │ Neon Postgres │                   │
│  │ (Cache/Queue) │  │ (via PgBouncer│                   │
│  └───────────────┘  └───────────────┘                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  4. EXTERNAL SERVICES                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ Cloudflare │ │ Bunny.net  │ │ Notify.lk  │           │
│  │ R2 (Files) │ │ (Videos)   │ │ (SMS)      │           │
│  └────────────┘ └────────────┘ └────────────┘           │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | Next.js 14+ (App Router) + TypeScript | SSR, client UI, SEO |
| **State Management** | Zustand + React Query (TanStack Query) | Cross-tab sync, server-state caching |
| **Form Handling** | React Hook Form + Zod | Validation on client and server |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **Backend API** | Node.js + Express.js + TypeScript | Stateless REST API (Controller → Service → Route) |
| **Real-Time** | Server-Sent Events (SSE) | One-way push to clients (results, timers, attendance) |
| **Auth** | JWT (access + refresh tokens in HTTP-only cookies) | Stateless session management |
| **Database** | Neon Serverless PostgreSQL | Relational source of truth |
| **ORM** | Prisma | Type-safe queries, migrations |
| **Connection Pooling** | PgBouncer (Neon pooled URL) | Survives horizontal auto-scaling |
| **Cache / Pub-Sub** | Redis (Upstash or Render Redis) | Session cache, result cache, BullMQ backbone, rate-limit store |
| **Task Queue** | BullMQ | Background jobs (emails, SMS, cron) on separate worker |
| **File Storage** | Cloudflare R2 | Zero-egress S3-compatible; presigned URL uploads |
| **Video CDN** | Bunny.net (Bunny Stream) | HLS VOD with IP-bound DRM tokens |
| **Live Classes** | Zoom Web SDK + Zoom API webhooks | Browser-embedded live sessions; attendance via webhook |
| **Payments** | PayHere | Sri Lankan payment gateway; webhook-confirmed |
| **SMS** | Notify.lk (Lite plan) | Student notifications |
| **CMS (Marketing)** | Sanity CMS | Public landing page banners and timetables |
| **Hosting (Frontend)** | Vercel | Edge-optimized Next.js hosting |
| **Hosting (Backend)** | Render | Auto-scaling Node.js with background workers |
| **Observability** | Sentry + Pino | Crash reporting + structured JSON logging |
| **Security** | Helmet.js + express-rate-limit (Redis-backed) | HTTP hardening + distributed rate limiting |
| **CI/CD** | GitHub Actions | Staging → Production pipeline with zero-downtime deploys |

---

## 3. Domain-Driven Separation

### Frontend Monorepo (`/frontend`)

```
frontend/
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── (public)/         # Landing, login — no auth required
│   │   ├── (dashboard)/      # Authenticated layout shell
│   │   │   ├── student/
│   │   │   ├── admin/
│   │   │   ├── marker/
│   │   │   └── super-admin/
│   │   └── api/              # Next.js API routes (revalidation webhook)
│   ├── components/           # Shared UI components
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Axios instance, Zustand stores, utilities
│   ├── schemas/              # Zod validation schemas (shared with backend)
│   └── types/                # TypeScript type definitions
├── public/
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

### Backend Monorepo (`/backend`)

```
backend/
├── prisma/
│   └── schema.prisma         # Database blueprint
├── src/
│   ├── config/               # Environment variables, Redis/DB connections
│   ├── middleware/            # JWT auth, role guard, idempotency, rate-limit
│   ├── routes/               # Express route definitions (URL → middleware → controller)
│   ├── controllers/          # Request/response handlers (thin — extract, delegate, respond)
│   ├── services/             # Business logic + Prisma queries (ONLY layer touching DB)
│   ├── jobs/                 # BullMQ job definitions (email, SMS, cron tasks)
│   ├── utils/                # Helpers (Zoom token gen, presigned URL gen, etc.)
│   └── index.ts              # Express app entry point
├── worker.ts                 # Separate BullMQ worker entry point
├── .env
└── package.json
```

---

## 4. Communication Protocols

| Path | Protocol | Description |
|------|----------|-------------|
| Browser → Backend | REST over HTTPS | All CRUD operations via JSON |
| Backend → Browser | SSE (HTTP stream) | Real-time push (results, timer sync, timetable updates) |
| Backend → PostgreSQL | TCP via PgBouncer | Prisma ORM queries through connection pool |
| Backend → Redis | RESP protocol | Cache reads/writes, BullMQ job enqueue, Pub/Sub |
| Worker → Redis | RESP protocol | BullMQ job dequeue and processing |
| Worker → PostgreSQL | TCP via PgBouncer | Background job database writes |
| Browser → Cloudflare R2 | HTTPS (presigned URL) | Direct file upload — backend never touches the file |
| Browser → Bunny.net | HLS over HTTPS | DRM-protected video streaming |
| Browser → Zoom | Zoom Web SDK (WebRTC) | Live class; Zoom fires webhook back to backend |
| Zoom/PayHere/R2 → Backend | HTTPS Webhook | Event confirmation (attendance, payment, upload) |

---

## 5. Architectural Invariants

These rules **must never be violated**. Every code review should check against this list.

### 5.1 Stateless Servers
- **No in-memory state** on any Node.js instance. All shared state lives in Redis.
- No `let counter = 0` at module scope. No local file storage via `multer`.
- Every server instance must be an identical, disposable clone.

### 5.2 Three-Tier Boundary Enforcement
- **Routes** → define URL + apply middleware. Zero business logic.
- **Controllers** → extract from `req`, call service, return `res`. Zero Prisma imports.
- **Services** → all business logic + all database/third-party calls. The only layer touching Prisma.

### 5.3 Server-Authoritative Time
- All exam timers, deadlines, and expiration checks use **server time**, never `Date.now()` from the client.
- Frontend timers are purely visual countdowns.

### 5.4 Idempotent Mutations
- All high-stakes `POST` routes (payments, mark finalization, account activation) require an `Idempotency-Key` header.
- Backed by the `IdempotencyRecord` table in Prisma.

### 5.5 Soft Deletes Only
- Production models with relations (ClassSession, Exam) use `isDeleted` flag — never hard delete.
- Prisma `onDelete: Restrict` on critical foreign keys.

### 5.6 Direct-to-Cloud File Transfers
- Files never pass through the Node.js server. Backend generates presigned URLs; client uploads directly to R2.
- Large files use multipart chunked upload with automatic token refresh.

### 5.7 Distributed-Safe Background Jobs
- All scheduled/recurring tasks run via **BullMQ**, never `node-cron` or `setTimeout`.
- BullMQ ensures exactly-once execution across all auto-scaled instances.

### 5.8 Webhook Resilience
- All webhook handlers are idempotent (use `upsert`, not `create`).
- External services (Zoom, PayHere, R2) are configured with retry policies.
- Admin "Sync" buttons exist as manual reconciliation fallbacks.

---

## 6. DNS & Hosting Layout

| Domain | Target | Host |
|--------|--------|------|
| `academylms.com` / `www.academylms.com` | Next.js frontend | Vercel |
| `api.academylms.com` | Node.js backend | Render |

- **DNS Provider**: Cloudflare
- **Frontend**: `A` / `CNAME` record for `@` → Vercel
- **Backend**: `CNAME` record for `api` → Render service URL

---

## 7. Security Model

| Layer | Mechanism |
|-------|-----------|
| Transport | HTTPS everywhere (Vercel + Render auto-TLS) |
| Authentication | JWT access token (15 min) + refresh token (7 days) in HTTP-only cookies |
| Authorization | Role-based middleware guard (`requireRole('SUPER_ADMIN', 'ADMIN')`) |
| Input Validation | Zod schemas in middleware — reject before reaching controller |
| Rate Limiting | `express-rate-limit` with Redis store — distributed across all instances |
| HTTP Hardening | Helmet.js on all responses |
| CORS | Strict origin whitelist (`academylms.com` only) |
| DRM | IP-bound Bunny.net tokens; black-screen detection UI |
| File Security | Time-limited presigned URLs; no direct R2 bucket access |
