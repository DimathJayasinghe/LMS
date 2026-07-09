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
| **Durability** — data survives crashes | Postgres on Neon (WAL + PITR); Redis AOF for the queue |

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
6. **Migrations** — schema change reviewed as SQL (see `Guides_And_Summeries/database_migration_guide.md`); additive-first; test on a Neon branch.
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
