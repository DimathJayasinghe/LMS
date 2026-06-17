# Academic LMS

Production-grade Learning Management System for a single educational institute (~1,200 students).

## Features

- **Auth & Roles** — JWT sessions with Super Admin, Admin, Marker, and Student roles
- **Class Management** — Schedule sessions, Zoom live classes, barcode attendance scanning
- **Video Streaming** — DRM-protected VOD via Bunny.net with IP-bound tokens
- **Exam Engine** — Timed MCQ/essay exams, R2 PDF uploads, server-authoritative timers
- **Marking & Results** — Marker assignment, grading, batch result publishing via SSE
- **Payments** — PayHere gateway with idempotency keys, bulk Excel import
- **Notifications** — SMS (Notify.lk), real-time SSE push, BullMQ background jobs

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, Zustand, React Query |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | Neon PostgreSQL (PgBouncer pooling) |
| Cache/Queue | Redis, BullMQ |
| Storage | Cloudflare R2 (files), Bunny.net (video) |
| Hosting | Vercel (frontend), AWS EC2 + PM2 (backend + workers) |

## Project Structure

```
├── frontend/          # Next.js App Router
├── backend/           # Express API (Controller → Service → Route)
└── context/           # Architecture docs, plan, design specs
```

## Getting Started

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && npm install && npx prisma generate && npm run dev
```

## Architecture Highlights

- **Stateless servers** — zero in-memory state; all shared state in Redis
- **3-tier separation** — Routes (URLs) → Controllers (req/res) → Services (business logic + DB)
- **Direct-to-cloud uploads** — presigned URLs; files never touch the API server
- **Production-ready** — PM2-managed API + worker on EC2; designed to scale later

## Environment Variables

Copy `.env.example` in both `frontend/` and `backend/` and fill in your credentials.

## Docs

Full system design and conventions live in [`context/documents/`](./context/documents/).

## License

Private — All rights reserved.
