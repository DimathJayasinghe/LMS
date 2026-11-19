# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Learning Management System for Sri Lankan tuition institutes, **deployed for one organization first** (~1,200 students) and being made **multi-tenant ready** (decided 2026-11-19; **step M1 is implemented, M2–M7 are not**: the `Organization` table and a nullable `organizationId` on every model — see `context/documents/14-multi-tenancy-readiness.md`). Two independent apps —
`frontend/` (Next.js) and `backend/` (Express) — no npm workspace, no root `package.json`; `cd` into
each separately. Designed to run on **one small VPS** via Docker Compose: no Kubernetes, no
auto-scaling, no multi-instance anything. The backend API is deliberately kept **stateless** anyway
(all shared state in Redis) so a second instance stays a config change, not a rewrite.

## Commands

```bash
# Backend (Express + TS + Prisma)
cd backend
npm install && npx prisma generate
npm run dev            # tsx watch src/index.ts
npm run build           # tsc && tsc-alias
npm run test             # vitest run  — colocated *.test.ts, mock @/config/database's prisma export
npm run test:watch

# Frontend (Next.js 16 App Router)
cd frontend
npm install
npm run dev
npm run build
```

Full production stack (nginx + backend + worker + redis + postgres + backup), used constantly during
this project's development for real end-to-end verification, not just type-checking:

```bash
docker compose build backend      # after backend code changes
docker compose up -d              # brings up/recreates the whole stack
docker compose logs backend --tail 200
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

`backend/src/config/env.ts` validates all env vars via Zod at boot and **crashes immediately** if
anything required is missing — check there before assuming an env var exists.

`npm run lint` is wired and enforced in CI for both apps. The backend uses an ESLint flat config
with typescript-eslint; legacy live-stack diagnostic scripts excluded from `tsconfig.json` are also
excluded from this initial lint baseline, while application code and unit tests are linted.

## Architecture

### Three-tier backend, strictly enforced

`routes/` (URL + middleware wiring only) → `controllers/` (extract req, call one service, shape
`res`, **zero Prisma imports**) → `services/` (all business logic, the **only** layer that imports
`@/config/database`'s `prisma`). Grep for `import.*prisma` outside `services/` before adding any
backend code that touches the DB — if it's not in a service, it's in the wrong place.

Response envelope used everywhere (not the older shape sketched in
`context/documents/03-code-standards.md §5.2` — that doc's example is stale; the real convention,
confirmed by reading actual controllers, is):
```json
{ "status": "success", "data": {}, "message": "optional" }
{ "status": "success", "data": [], "count": 0 }
{ "status": "error", "message": "...", "code": "SOME_ERROR_CODE" }
```
Known failures throw `AppError(code, statusCode, message)` (`backend/src/utils/app-error.ts`); the
global error handler turns it into the envelope above.

### Auth & authorization

JWT access (15 min) + refresh (7 days) tokens in HTTP-only cookies; refresh tokens are hashed before
storage and rotated on use. `requireRole(...)` middleware (`backend/src/middleware/role.middleware.ts`)
gates routes by the **caller's** role, but does **not** know about the **target** of the request.
Any endpoint where one privileged role acts on another user's account (status, role, barcode, etc.)
needs an explicit actor-vs-target check inside the service — see
`assertCanManagePrivilegedTarget` in `backend/src/services/user.service.ts` for the pattern (an
`ADMIN`/front-desk actor must never be able to touch a `SUPER_ADMIN` or peer `ADMIN` target; only
`SUPER_ADMIN` can). This exact gap caused a real incident (front-desk deactivated the super-admin
account) — when adding a new admin-on-user mutation, check whether it needs the same guard.

A related but distinct gap: `requireRole(...)` also doesn't know whether a `TEACHER` caller
actually **teaches** the course a request is about — it only checks the caller's role, not
ownership of the specific resource. `assertCourseAccess` (`backend/src/services/class.service.ts`)
is the fix for this class of gap: it throws `403 FORBIDDEN_COURSE` when a `TEACHER` isn't the
course's `teacherId` (and passes `ADMIN`/`SUPER_ADMIN` through unconditionally). It's wired into
every course-scoped **mutation** by convention, but as of 2026-07-15 it had been missed on 8
**read** paths (`exam`/`video`/`submission`/`class-session` list-and-get functions) — any `TEACHER`
could view another teacher's exam content, recordings, submissions, and session schedule. When
adding a new course-scoped read (not just a mutation), call `assertCourseAccess` too — reads are
easy to forget since they don't "feel" as dangerous as a mutation, but they leak the same content.

Role enum: `SUPER_ADMIN, TEACHER, ADMIN, MARKER, STUDENT`. Several older `context/api_endpoints/*.md`
docs were written against an earlier naming scheme and explicitly call out the remap: their `ADMIN`
means today's `SUPER_ADMIN`, their `STAFF` means today's `ADMIN` (front-desk). Read those notes before
trusting a role table in an endpoint doc.

### Direct-to-cloud file transfers (no file bytes ever hit the API server)

- **Cloudflare R2** (NIC photos, exam PDFs, etc.): backend presigns a PUT via
  `createR2PresignedPutUrl` (`backend/src/utils/r2.ts`), eagerly writes the DB row at
  presign-time (server never confirms the upload happened), client PUTs directly to R2.
  R2 bucket **CORS is configured in the Cloudflare dashboard**, not in code — the S3-compatible
  access key used by the backend is scoped to object read/write only and cannot set
  `PutBucketCors` itself. If direct browser uploads start failing with a CORS error, that's a
  bucket-config problem, not a code bug.
- **Bunny Stream video** (TUS protocol): backend creates the Bunny video + signed TUS auth, browser
  uploads directly to Bunny, and **completion is confirmed by Bunny's webhook** — not a client
  "I'm done" call — so an upload survives the browser disconnecting mid-transfer.

### Live classes (Zoom Meeting SDK, embedded — not a zoom.us redirect)

Teachers schedule through the site (backend calls Zoom's Server-to-Server OAuth REST API); both host
and students join embedded via `@zoom/meetingsdk`. The join/host JWT is minted fresh per attempt,
server-side, after the same enrolled+paid gate as recorded video. One Licensed Zoom account hosts
every meeting — **this app's own `Enrollment`/`Payment` tables decide host vs participant**, not
Zoom's account model. See `context/documents/02-architecture.md §7.1` and
`context/api_endpoints/live-class.endpoints.md` — the latter was written against Zoom's current
documentation specifically because this part of Zoom's platform changed after most training data was
collected; don't rely on prior Zoom SDK knowledge here.

### Content protection

Recorded video and live-class access both require: authenticated, an active `Enrollment`, and the
current month's `Payment.status = SUCCESS` — checked in the service layer before any token/signature
is issued. VOD playback uses Bunny's token-authenticated embed (signed URL, 4-hour TTL, **not** IP-bound) + a per-student watermark (MediaCage DRM is a library-level Bunny setting); live
classes get the same watermark treatment but the Web Meeting SDK has no OS-level capture-blocking
(that's a documented, accepted limitation, not a bug to fix).

### Terminology and tenancy (decided 2026-11-19)

- **Organization** is the tenant (a tuition institute as a customer). **Institute** means a *physical
  branch* inside an organization and is not a tenant. `SUPER_ADMIN` owns one organization; the name
  `PLATFORM_ADMIN` is reserved for a future SaaS operator and is not in the `Role` enum.
- The `Organization` table and a nullable `organizationId` (default: the one `default`/`DEF` organization) exist
  on every model since M1; the scoped Prisma client, JWT context and `NOT NULL` constraints (M2–M3) do not yet.
  Until `14-multi-tenancy-readiness.md §11` M2–M3 land, do not add new global uniques on user-visible values,
  hand-built R2/Redis keys, or new provider-credential reads from `env`. Every new model must declare
  `organizationId` + the `Organization` relation + `@@index([organizationId])` (the registry test in
  `backend/src/utils/tenant-integrity.test.ts` fails otherwise), and CI runs the tenant integrity check.
- **Stack decision:** stay on Express + Next.js. A NestJS rewrite was considered and rejected.
- **Planned, not built:** `HYBRID` enrollment and a bank-slip payment channel
  (`docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md`). Today the
  content gate ignores `Enrollment.classType`.
- Requirement-by-requirement status lives in `context/documents/15-requirements-traceability.md`.
- Offline local development uses provider **drivers** (`STORAGE_DRIVER`, `SMS_DRIVER`, more planned) that default to the real providers and are refused when `NODE_ENV=production`; run `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`. See `context/documents/16-local-development.md`. A local video driver is planned and will have no DRM.

### Invariants (see `context/documents/02-architecture.md §5` for the full list)

- No in-memory shared state in the API process — Redis only (the BullMQ worker is a separate
  process and needs it anyway).
- Soft deletes only (`deletedAt`), never hard-delete a model with relations; FK `onDelete` is
  `Restrict`/`SetNull`, never `Cascade`.
- Scheduled/background work goes through **BullMQ**, never `node-cron`/`setTimeout`.
- Webhook handlers (Zoom, PayHere, Bunny) are idempotent (`upsert`, not `create`) and verify
  signatures before processing.
- High-stakes `POST`s (payments, mark finalization, account activation) require an
  `Idempotency-Key` header, backed by `IdempotencyRecord` + a Redis `SET NX` lock.

## Working with `context/`

`context/documents/` (numbered `01`-`16`) is the source of truth for architecture, code standards,
DB design, and AI workflow rules — read the relevant one before a non-trivial change.
`context/api_endpoints/*.md` documents the actual current API surface per domain.
`context/plan/` is historical brainstorming only; where it conflicts with `documents/`, `documents/`
wins — don't implement straight from `plan/`.

**These docs drift from the code** — this has happened repeatedly (stale "not yet exposed" notes
after a feature shipped, an outdated response-envelope example, endpoint tables using a retired role
naming scheme). Verify against the actual source before trusting a doc's specifics, and update the
doc alongside the code change rather than leaving the drift for the next person.

`context/documents/04-ai-workflow-rules.md` is the operating manual for how to scope and execute work
in this repo (branch-off-`dev` discipline, ask-vs-decide framework, file-size/comment conventions).
Notably §3.4: for every new implementation or behavioral bugfix, brainstorm the edge cases (actor ×
target matrix, not-found cases, check-ordering when two validations could both fire) and back it with
a Vitest unit test in addition to live-stack verification — this was added after the
privileged-account incident above and is a standing requirement, not a suggestion.

`context/documents/11-git-and-naming.md` is the full git guide (rewritten 2026-11-19). Essentials: branch off
fresh `origin/dev` as `type/kebab-scope` (`feature/`, `fix/`, `hotfix/`, `chore/`, `docs/`, `refactor/`, `test/`;
no personal prefixes, no long-lived lanes); never commit straight to `dev` or `main`; Conventional Commits
(`type(scope): summary`, PR title too); squash-merge into `dev` with green `Quality Gate` plus review;
**delete the branch after merge** (this reverses the 2026-07-10 "never delete" rule; start a new branch for
follow-up work); releases are merge-commit `dev` -> `main` PRs tagged `vX.Y.Z`, hotfixes are back-merged;
work in the main checkout, not a worktree, and use tagged stashes only.
