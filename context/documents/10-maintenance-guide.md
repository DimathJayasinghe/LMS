# 10 — Codebase Maintenance Guide

> How to keep this codebase healthy as it grows: the design principles it already follows (**SOLID**), the **patterns** it uses, how to stay **ACID-safe** with Prisma, and the exact recipe for adding a feature without breaking things.
>
> This is descriptive, not aspirational — the examples are real files. Match the existing style; consistency beats cleverness.

---

## 1. The One Rule That Preserves Everything: the 3-Tier Boundary

Every request flows **Route → Controller → Service**. Nothing skips a layer.

| Layer | May do | Must NOT do |
|-------|--------|-------------|
| **Route** (`*.routes.ts`) | Define URL, attach middleware (auth, role, validate, idempotency) | Business logic, Prisma |
| **Controller** (`*.controller.ts`) | Parse `req`, call one service, shape `res`, fire audit log | Import Prisma, contain business rules |
| **Service** (`*.service.ts`) | Business logic, Prisma queries, third-party calls | Touch `req`/`res` |

If you keep this boundary, most of SOLID follows for free. A controller importing `prisma` is the single most common violation — grep for it in review:

```bash
grep -rn "from '@/config/database'" src/controllers   # must return nothing
```

---

## 2. SOLID, As Applied Here

SOLID is not academic here — each principle maps to a concrete rule this repo already follows.

### S — Single Responsibility
Each file does one thing; each function has one reason to change.
- `class.service.ts` owns course logic; `subject.service.ts` owns subjects. When teacher-ownership needed to be enforced in four services, it went into **one** function — `assertCourseAccess()` in `class.service.ts` — and the others import it. There is exactly one place to change the ownership rule.
- Keep files ≈150 lines. If a service grows two unrelated concerns, split it (`payment.service.ts` vs `payhere` helpers in `utils/payhere.ts`).

### O — Open/Closed
Extend by adding, not by editing hot paths.
- Adding an exam type or SMS template = add an entry to `ExamType` / the `SMS_TEMPLATES` map, not rewrite the grader. New audit action = new key in `AUDIT_ACTION`.
- New notification channel = a new BullMQ queue + processor, not a change to callers.

### L — Liskov Substitution
Anything typed as a role, status, or `AuthenticatedUser` must behave uniformly.
- Every `requireRole(...)` accepts the same `Role[]`; a new role slots in without special-casing the middleware.
- Services accept `actor: AuthenticatedUser` (`{ userId, role }`) — never a concrete controller/request shape — so a job or script can call the same service.

### I — Interface Segregation
Return only what the caller needs; keep DTOs narrow.
- Prisma `select` shapes (`classSelect`, `examListSelect`, `videoSelect`) return exactly the fields a view needs. The student MCQ payload is a **narrower** type (`StudentMcqPayload`) that structurally cannot contain `isCorrect`. Type-narrowing is the security boundary.

### D — Dependency Inversion
Depend on abstractions/config, not concretes.
- `prisma` and `redis` are single injected clients from `config/`. Business code imports the client, not `pg` or `ioredis` directly.
- External services sit behind `utils/` (`r2.ts`, `bunny.ts`, `payhere.ts`) so swapping a provider touches one file. Env is read only through `config/env.ts` (validated once at boot), never `process.env` scattered around.

---

## 3. Design Patterns In Use

Recognise these so you extend them instead of inventing parallels.

| Pattern | Where | Why |
|---------|-------|-----|
| **Module singleton** | `config/database.ts`, `config/redis.ts` | One pooled client per process; import everywhere |
| **Middleware factory** | `requireRole(...roles)`, `validateBody(schema)` | Config-time function returns a request handler |
| **Guard clause / early return** | Every service (`if (!x) throw new AppError(...)`) | Flat, readable control flow |
| **Shared authorization gate** | `assertCourseAccess(courseId, actor)` | One ownership check reused by 4 services (DRY + SRP) |
| **DTO via `select` + `satisfies`** | `... satisfies Prisma.CourseSelect` | Compile-checked projection; no over-fetching |
| **Schema-first validation** | Zod schema → `z.infer` type | One source of truth for shape + TS type |
| **Queue/worker (producer–consumer)** | `jobs/*.queue.ts` enqueue; `worker.ts` consumes | Slow work off the request path |
| **Idempotency key + lock** | `idempotency.middleware.ts` (Postgres cache + Redis `SET NX`) | Exactly-once mutations |
| **Upsert for webhooks** | `attendance.service` Zoom handler | Retry-safe (no duplicate rows) |
| **Global error funnel** | `error.middleware.ts` + `AppError` | Uniform `{ status, message, code }` |

**Anti-patterns to reject in review:** a new "repository" or "DTO mapper" layer, base classes / abstract factories, `any`, `console.log` (use Pino), in-memory shared state (use Redis), business logic in a controller.

---

## 4. ACID & Transactions with Prisma

Postgres gives ACID per statement. You are responsible for grouping **multi-step invariants** into one transaction.

### When a single `prisma` call is enough
Most writes are one row — already atomic. A unique constraint enforces the invariant at the DB (cheaper and safer than app checks):
- `@@unique([enrollmentId, paymentMonth])` — can't double-pay a month.
- `@@unique([userId, examId])` — one submission per exam.
- `@@unique([subjectId, name, year])` — no duplicate course.

Prefer a DB constraint + catching `P2002` over a `findFirst`-then-`create` (which has a race window — see §4.3).

### When you need `prisma.$transaction`
Wrap steps that must **all** succeed or **all** roll back:
```ts
// Grade + finalize in one atomic unit — never a submission marked graded
// without its marks persisted.
await prisma.$transaction(async (tx) => {
  await tx.submission.update({ where: { id }, data: { marks, feedback, gradedAt: new Date() } });
  await tx.auditLog.create({ data: { /* ... */ } });
});
```
Use it for: publishing results (flip flag + snapshot), bulk payment import (all rows or none), any "update A and B together" rule.

### The four hazards this codebase already defends against
| Hazard | Defense |
|--------|---------|
| **Atomicity** — half-applied multi-step change | `prisma.$transaction([...])` |
| **Consistency** — invalid state | Zod at the edge + DB constraints + `onDelete: Restrict` (never `Cascade`) |
| **Isolation** — double-click / TOCTOU | Idempotency middleware (Redis `SET NX` lock) + unique constraints |
| **Durability** — data survives crashes | Self-hosted Postgres on a persistent volume + the `backup` service (verified, encrypted, off-site dumps — see [12](./12-data-backup-and-recovery.md)); Redis AOF for the queue |

### 4.3 Race conditions — prefer the constraint
`findUnique` → `if exists throw` → `create` is **not atomic**; two requests can both pass the check. The idempotency middleware closes this for high-stakes POSTs, but for everyday uniqueness, lean on the DB constraint and handle the conflict:
```ts
try {
  return await prisma.subject.create({ data });
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new AppError('SUBJECT_ALREADY_EXISTS', 409, '...');
  }
  throw e;
}
```
(The current services use the check-then-create form for readability; that's acceptable where a duplicate is low-stakes, but upgrade to the constraint-catch form for anything financial or exam-critical.)

### Money & time
- Money is `Decimal(10,2)` — never `Float`. Do arithmetic on `Prisma.Decimal`, not JS numbers.
- Deadlines use **server time** (invariant §5.3). Never trust a client timestamp for exam windows.

---

## 5. Change Safety Checklist

Before opening a PR:

1. **Scope** — one feature/domain (see 04-ai-workflow-rules). Touching >5 files or two domains → split.
2. **Build green** — `cd backend && npm run build` (tsc) has zero errors. No `any`.
3. **Boundary intact** — no Prisma in controllers; services take `AuthenticatedUser`, not `req`.
4. **Authorization** — new mutating route has `requireRole(...)`; course-scoped writes call `assertCourseAccess`.
5. **Validation** — every body/param/query has a Zod schema in `validate` middleware.
6. **Migrations** — schema change reviewed as SQL (see `Guides_And_Summeries/database_migration_guide.md`); additive-first; test on a scratch DB restored from a backup (`backup restore --dbname lms_staging --create`), then `prisma migrate deploy` in-container.
7. **Audit** — privileged mutations call `AuditService.log(...)`.
8. **Secrets** — nothing added to git; new env var registered in `config/env.ts` (fail-fast).

---

## 6. Recipe: Add a New Resource (the `Subject` example)

`Subject` was added end-to-end on 2026-07-09 — copy that shape:

1. **Schema** — add the model to `prisma/schema.prisma` (UUID PK, indexed FKs, `createdAt`/`updatedAt`, constraints). `npx prisma validate && npx prisma generate`.
2. **Zod** — `schemas/subject.schema.ts`: `createXSchema`, `updateXSchema = create.partial()`, `xIdParamSchema`, `listXQuerySchema` + inferred types.
3. **Service** — `services/subject.service.ts`: pure functions taking `(input, actor)`, returning DTOs via a `select` shape; throw `AppError`; scope reads by role.
4. **Controller** — `controllers/subject.controller.ts`: `asyncHandler`, parse with the schema, call the service, `res.json({ status, data, ... })`, fire `AuditService.log` on mutations.
5. **Route** — `routes/subject.routes.ts`: `verifyToken` → `requireRole(...)` → `validate*` → controller.
6. **Mount** — `app.use('/api/subjects', subjectRoutes)` in `index.ts`.
7. **Build** — `npm run build` green; add endpoints to `context/api_endpoints/`.

Do **not** add a repository layer, a base controller, or a mapper. The four files above are the whole pattern.

---

## 7. Testing & Observability

- **Smoke scripts** live in `src/scripts/` (excluded from the build). They hit endpoints against a prod-like env; run them after touching a domain.
- **Logs** are structured Pino JSON — always pass a context object first: `logger.error({ err, userId }, 'msg')`. Never `console.log`.
- **Errors** surface in Sentry with stack + context. A caught-and-handled `AppError` is expected flow; an unhandled throw is a bug to fix, not to swallow.
- When adding real unit tests, target **services** (pure, no `req`/`res`) — they are the testable core by design.

---

## 8. Operator settings (environment variables)

Infrastructure numbers are environment variables with defaults in `backend/src/config/env.ts` (business numbers belong to the owner settings registry, not here). Restart the backend after changing one.

Before deploying the Bunny production guard, set `BUNNY_READ_ONLY_API_KEY` (webhook signature verification) and `BUNNY_TOKEN_KEY` (playback signing) in the backend environment. Both backend and worker load `backend/.env` and will not boot in production without both keys. `BUNNY_WEBHOOK_SECRET` is unused and may be left unset.

| Variable | Default | Meaning |
|---|---|---|
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Lifetime of the access JWT. The cookie itself lives as long as the refresh cookie, so changing this does not sign anyone out early; shorter values only make revocation tighter and refreshes more frequent. Set `1m` locally to exercise silent refresh. |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Session length without re-login. Also the lifetime of both cookies. |
| `REFRESH_REUSE_GRACE_SECONDS` | `10` | A refresh token presented again within this many seconds of its rotation is treated as a duplicate (several tabs, retried request) instead of theft. `0` restores strict single use; range 0-60. A `Refresh token reuse detected` line in the backend log outside this window is a real signal. |

**Rolling back the session change:** before reverting the backend code run `DELETE FROM "RefreshToken" WHERE "rotatedAt" IS NOT NULL;`, because the previous code would treat a rotated row as a live token. The `rotatedAt` column can stay.


## Scan-code collision report (run before deploying F-07)

Before deployment, query the production database with `SELECT datctype FROM pg_database WHERE datname = current_database();`. Continue only if the result is `en_US.utf8`, `C.UTF-8` or `C`; stop and contact the owner otherwise. Build the new backend image first, while the current services remain in use. With PostgreSQL running, use a host directory **outside the repository** for the report (replace the placeholders). Build first:

```sh
docker compose build backend
```

Have the front desk stop assigning cards and registering students before the final report, and keep those activities stopped until the new image is serving. Run the report as the last step immediately before the deploy command:

```sh
docker compose run --rm --no-deps -v <host dir outside the repo>:/reports backend node dist/scripts/report-scan-code-collisions.js --out /reports/<name>.csv
```

The report exits 0 when clean, 2 when rows are listed, and 1 on error. If rows are listed, stop the deployment and send the report to the owner for resolution; it contains personal data and must never be committed. After resolving any rows, repeat the final report immediately before deploying. Once it exits 0, deploy the new backend image, then rerun the report from the new running container and expect exit 0. The report checks collisions, reserved formats and stored codes outside printable ASCII. For local development only, `npm run scan-codes:report -- --out <path outside the repo>` runs from `backend/`; the production image does not include its development tooling.

Mock tests do not establish transaction serialization. Run the disposable-stack live verification script supplied with the change against a real database to check the database behavior before release.

## Client addresses and rate limits

Limits are per minute (except sign-up, below) and configured by `RATE_LIMIT_GLOBAL_ANON_MAX` (100), `RATE_LIMIT_GLOBAL_USER_MAX` (200), `RATE_LIMIT_LOGIN_ACCOUNT_MAX` (10), `RATE_LIMIT_LOGIN_IP_MAX` (60), and `RATE_LIMIT_REFRESH_MAX` (20). Public sign-up is limited per address per hour by the owner setting `identity.register.perIpPerHour` (default 60; it replaced `RATE_LIMIT_REGISTER_IP_MAX`, which is no longer read), and per mobile number per day by `identity.register.perPhonePerDay`. Refresh is excluded from the global bucket. A connected Redis store shares counters; the in-memory fallback is local to the API process.

In the Compose nginx topology, nginx sets `X-Real-IP` to the connecting address and the frontend forwards it only to `INTERNAL_API_URL`; keep the backend port private. If a trusted proxy precedes nginx, configure nginx real-IP handling for that proxy's verified source ranges first. For a Vercel rewrite, the repository's nginx configuration currently reports the rewrite layer as the client. Configure and verify a trusted-source real-IP policy for the actual deployment before relying on per-address limits; do not trust forwarded headers from arbitrary sources. After deployment, send a request through each active topology and compare the logged address to the expected client address.

## Owner account operations

The startup seed creates the initial owner only when the default organization has no owner, including inactive owners. It does not change existing accounts; if the configured email belongs to another account it skips creation. Startup continues when the seed skips. The seed has no built-in credentials: it needs both `LMS_ADMIN_EMAIL` (a valid address) and `LMS_ADMIN_PASSWORD` (8 to 72 bytes), and the operator commands validate the address the same way.

Run the operator commands in an interactive container terminal. Passwords are entered without echo, or a generated password is shown once with `--generate`. Do not put passwords in command arguments.

```bash
docker compose exec -it backend node dist/scripts/owner-add.js --email owner@example.com
docker compose exec -it backend node dist/scripts/owner-reset-password.js --email owner@example.com
```

Add `--generate` to either command to generate a password. Add `--reactivate` to the reset command only when the owner account should also be reactivated. Reset ends every session of that account at once (it bumps the account's session version and revokes refresh tokens) and both commands record an audit event. `owner-add` refuses to create a co-owner beyond the registered `identity.maxOwners` (default 2, read from the organization's settings). Role changes and staff deactivations ask the owner to confirm with their own password in the app (step-up, `ACTOR_PASSWORD_INVALID` when wrong); a leaving teacher's classes are handed over in the same step (doc 19, D-IDENTITY-6).

### Creating staff accounts

The owner adds teachers, front-desk staff and markers under **Users, Add staff**. The owner enters the person's name, email, optional phone, role and the owner's own password. The system creates the account with a one-time temporary password, shown once on screen. Give it to the new person in person; they must choose their own password at the first sign-in. If the screen is closed before the password is noted, reset the new account's password (below). A new owner is added only with the operator command above.

### Staff-assisted password reset

The owner may reset any other non-owner account; front-desk staff may reset student accounts only. A reset sets a one-time temporary password, shown once to the person who performed it, ends the account's sessions at once and forces a password change at the next sign-in. The temporary password is never written to the audit log, the request log or the stored idempotency record; if the response is lost, reset again. Resetting a staff account asks the acting owner to re-enter their own password. Limits are per actor per day and per target per 24 hours (`identity.reset.*` settings), counted from audit rows, and a hit returns 429. Owner accounts are reset only with the operator command above.

## Fee reminders

Front desk and owner open **Payments, Who owes** to see enrollments with no paid fee for a month (default: the current one), tick students and press **Remind selected**, or choose a course and **Remind everyone in this course**. Students inside the grace days are never reminded, and each student gets at most `fees.reminderMaxPerStudentPerMonth` reminders (default 1) per month, from day `fees.reminderFromDay` (default 11). Every reminder creates an in-app notification. The **SMS** channel for `FEE_DUE` is seeded **off**: after a trial week the owner turns it on under **Notification settings**. SMS quiet hours (21:00-07:00) are not enforced yet, so send SMS reminders in the daytime only. Only the owner can export the list as CSV; each export and each reminder run is written to the audit log (counts only, no student data). To stop reminders entirely set `fees.reminderMaxPerStudentPerMonth` to 0.

## End-of-day cash count

Cash is the money front desk takes through **Collect payment** (method `ENTRANCE`). At the end of the day each collector opens **Payments, Cash**, types the cash they counted for each branch they collected at and presses **Count**. The system amount is computed at that moment from their own payments of that Colombo day (refunded payments still count, since the cash was taken); the screen shows the difference. Counting again the same day updates the row. Cash taken after the count does not change the stored figures: the row shows **Cash changed after the count** so the owner can see it. The branch is chosen once per device on the collect form (**Collecting at**); cash taken with no branch chosen is its own group, which is why every desk should pick one.

The owner sees every collector, filters by day range and branch, ticks **Needs review** for counted days not reconciled yet, and presses **Reconcile** once the cash and the count agree. A reconciled day cannot be counted again; if it needs correcting, the correction is an owner override of the payment (which then shows as stale). A difference beyond `tally.varianceFlagAmount` (default 0, meaning any difference) shows **Needs a look**. Setting `tally.enabled` to false turns the count off (counts are refused, the strip and buttons disappear); the cash list stays. Collecting a month that is already paid is refused (`ALREADY_PAID`); correcting a paid month is the owner's override. Every count and reconcile is in the audit log (`CASH_DAY_CLOSED`, `CASH_TALLY_RECONCILED`).

Rollback: revert the PR. `Payment.collectedAt` and the `CashTally` table stay, unused; the migration only adds. The collect guard is code, so the old overwrite behaviour returns on revert.

## Organization settings

Owners can change registered settings under **Access rules and fees**. Changes are audited and apply to future decisions. The billing month uses the organization timezone. Set `fees.graceDays` to 0 to restore a strict current-month content gate; the default is 10 days with a successful previous-month payment. The settings table is additive and remains unused if this feature is reverted. Settings for later work are registered but do not take effect until their corresponding feature is implemented.
