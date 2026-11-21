# Academic LMS

[![CI](https://github.com/DimathJayasinghe/LMS/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/DimathJayasinghe/LMS/actions/workflows/ci.yml)

Learning Management System for Sri Lankan tuition institutes (A/L and similar classes). Deployed for **one organization first** (~1,200 students, several teachers across multiple subjects) and being made **multi-tenant ready** so more institutes can be onboarded later. Built to run **cheaply on one small VPS** — no Kubernetes, no auto-scaling.

## Features

- Super-admin subject-to-teacher assignments and teacher-owned class authoring
- Teacher session/video management, exact marker assignment, and audited released-result correction
- Student current-enrollment dashboard with new READY lessons, upcoming sessions, and seen state
- Role/ownership gates, mutation audit trails, fail-fast migrations, and zero-advisory dependency baseline

- **Roles** — Super Admin (owner), Teacher (many), Admin (front-desk), Marker, Student — authorization is the role plus resource and target guards
- **Academic model** — Subject → Course (one teacher) → Class Sessions & Exams; students enrol + pay per course
- **Classes** — physical, online, or both. Delivered in-site: live via Zoom Web SDK, recorded via Bunny.net; QR/barcode attendance at the physical entrance; Zoom-webhook attendance for streamed classes. A `HYBRID` enrollment type (one fee, both modes) is designed but not built
- **Content protection** — enrolled + paid gating; recorded video via Bunny's **token-authenticated embed player** (MediaCage DRM) + a per-student watermark overlay; server-signed Zoom live join
- **Exams** — one mixed paper (MCQ + structured + essay) for both online and physical students; submit via MCQ, typed answers, or scanned PDF upload; server-authoritative timers
- **Marking & Results** — marker assignment, grading, batch result publishing via SSE
- **Payments** — PayHere **onsite checkout** (in-app modal, no redirect), front-desk/branch cash collection with receipts, bulk Excel import, and an admin records/summary dashboard; idempotency keys. A staff-approved **bank-transfer slip** channel is designed but not built
- **Notifications** — SMS (Notify.lk), real-time SSE push, BullMQ background jobs

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js (App Router), TypeScript, Tailwind, Zustand, React Query — hosted on Vercel (free) |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 (self-hosted in Compose, persistent volume) + `backup` service (encrypted, off-site dumps) |
| Cache/Queue | Redis (self-hosted in Compose), BullMQ |
| Storage / Video | Cloudflare R2 (files), Bunny.net (video) |
| Hosting | **One VPS** running postgres + nginx + API + worker + Redis + backup via Docker Compose |
| Observability | Sentry + Pino |

## Project Structure

```
├── frontend/          # Next.js App Router — all roles via route groups
├── backend/           # Express API (Route → Controller → Service) + BullMQ worker
├── nginx/             # Reverse proxy + TLS config
├── docker-compose.yml # nginx + backend + worker + redis (one box)
└── context/           # Architecture docs, plan, design specs
```

## Getting Started (local dev)

**Option A — run everything in Docker** (recommended; also the way to exercise external webhooks).
The whole app comes up behind nginx on one origin — `/` → frontend, `/api` → backend — and an
optional `ngrok` service tunnels it to a public HTTPS URL so Bunny/Zoom/PayHere webhooks can reach
`localhost`. Put secrets in `backend/.env` (see `backend/.env.example`), then:

```bash
docker compose up -d --build      # postgres + redis + backend + worker + nginx + frontend + ngrok
```

The backend applies checked-in Prisma migrations before it starts. Migration failure is fatal; do not
use `prisma db push` against a persistent environment. Existing pre-2026-08-20 development databases
need the one-time adoption procedure in
[`database_migration_guide.md`](./context/Guides_And_Summeries/database_migration_guide.md#one-time-adoption-for-a-database-previously-managed-by-db-push).

For ngrok: set `NGROK_AUTHTOKEN` (+ optional reserved `NGROK_DOMAIN`) in `backend/.env`. Webhook
URLs are `https://<ngrok-domain>/api/{videos/bunny-webhook, attendance/zoom-webhook, payments/payhere/notify}`.
See the appendix in [`context/documents/09-cost-and-hosting.md`](./context/documents/09-cost-and-hosting.md).

**Option A2 — fully offline** (no Cloudflare/Bunny/Notify.lk accounts): `cp backend/.env.local.example backend/.env`, then
`docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`. File storage runs in a local
S3-compatible container and SMS is logged instead of sent. What is and is not emulated (no DRM locally):
[`16-local-development.md`](./context/documents/16-local-development.md).

**Option B — run the apps directly** (fast UI iteration with hot-reload):

```bash
# Optional: use the offline local drivers while running on the host. Start only the dependencies first:
#   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres redis storage storage-init
cd backend && npm install && npx prisma generate && npm run dev
cd frontend && npm install && npm run dev
```

## Deploy (production)

One small VPS + Docker Compose:

```bash
git pull && docker compose up -d --build
```

Full runbook and monthly cost breakdown: [`context/documents/09-cost-and-hosting.md`](./context/documents/09-cost-and-hosting.md).

## Architecture Highlights

- **One VPS, no cluster** — Redis caching absorbs the result-release spike; scale up (bigger box) before scaling out
- **Stateless API** — no in-memory shared state; keeps the worker/API split clean and a future second instance a config change
- **3-tier separation** — Routes (URLs) → Controllers (req/res) → Services (business logic + DB)
- **Direct-to-cloud uploads** — presigned URLs; files never touch the API server
- **Content gated per enrollment + paid month** — token-authenticated Bunny embed (DRM) + watermark, server-signed Zoom live join

## Docs

Full system design and conventions live in [`context/documents/`](./context/documents/). Start with `01-project-overview.md`. For where the product stands against the full requirement list see [`15-requirements-traceability.md`](./context/documents/15-requirements-traceability.md); the multi-tenancy plan is [`14-multi-tenancy-readiness.md`](./context/documents/14-multi-tenancy-readiness.md); local offline setup and provider drivers are in [`16-local-development.md`](./context/documents/16-local-development.md); the payment-channel and `HYBRID` design is in [`docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md`](./docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md).

## License

Private — All rights reserved.
