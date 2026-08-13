# Academic LMS

[![CI](https://github.com/DimathJayasinghe/LMS/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/DimathJayasinghe/LMS/actions/workflows/ci.yml)

Learning Management System for a **single tuition institution** (~1,200 students) with several teachers across multiple subjects. Built to run **cheaply on one small VPS** — no Kubernetes, no auto-scaling.

## Features

- **Roles** — Super Admin (owner), Teacher (many), Admin (front-desk), Marker, Student — with optional per-user permission overrides
- **Academic model** — Subject → Course (one teacher) → Class Sessions & Exams; students enrol + pay per course
- **Classes** — delivered in-site: live via Zoom Web SDK, recorded via Bunny.net; QR/barcode attendance at the physical entrance; Zoom-webhook attendance for streamed classes
- **Content protection** — enrolled + paid gating; recorded video via Bunny's **token-authenticated embed player** (MediaCage DRM) + a per-student watermark overlay; server-signed Zoom live join
- **Exams** — one mixed paper (MCQ + structured + essay) for both online and physical students; submit via MCQ, typed answers, or scanned PDF upload; server-authoritative timers
- **Marking & Results** — marker assignment, grading, batch result publishing via SSE
- **Payments** — PayHere **onsite checkout** (in-app modal, no redirect), bulk Excel import, and an admin records/summary dashboard; idempotency keys
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

For ngrok: set `NGROK_AUTHTOKEN` (+ optional reserved `NGROK_DOMAIN`) in `backend/.env`. Webhook
URLs are `https://<ngrok-domain>/api/{videos/bunny-webhook, attendance/zoom-webhook, payments/payhere/notify}`.
See the appendix in [`context/documents/09-cost-and-hosting.md`](./context/documents/09-cost-and-hosting.md).

**Option B — run the apps directly** (fast UI iteration with hot-reload):

```bash
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

Full system design and conventions live in [`context/documents/`](./context/documents/). Start with `01-project-overview.md`.

## License

Private — All rights reserved.
