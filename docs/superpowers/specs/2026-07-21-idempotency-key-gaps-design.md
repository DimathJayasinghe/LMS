# Design — Idempotency-Key hardening for high-stakes mutations

**Date:** 2026-07-21
**Branch:** `fix/idempotency-key-gaps` (off `dev`)
**Status:** Design approved, implementation pending
**Priority:** P1 security/correctness (found in the 2026-07-15 gap audit — tracker lines 97, 255, 400)

---

## Problem

`CLAUDE.md` states: *"High-stakes POSTs (payments, mark finalization, account activation)
require an `Idempotency-Key` header, backed by `IdempotencyRecord` + a Redis `SET NX` lock."*
The `checkIdempotency` middleware (`backend/src/middleware/idempotency.middleware.ts`) implements
exactly this and is already wired onto `/payments/initiate`, `/payments/payhere/checkout`,
`/payments/collect-entrance`, and mark finalization (`PATCH /submissions/:id/marks`).

Five high-stakes mutations were shipped **without** it:

| Route | Risk if replayed |
|---|---|
| `PATCH /payments/:id/override` | duplicate override → duplicate `PAYMENT_OVERRIDDEN` audit + re-fired SMS |
| `POST /payments/bulk-upload` | whole Excel batch applied twice |
| `PATCH /users/:id/role` | duplicate role-change audit; race on concurrent conflicting changes |
| `PATCH /users/:id/status` | double activate/deactivate → re-fired notifications/audit |
| `PATCH /users/:id/barcode` | duplicate barcode assignment |

### The real duplicate vector

Double-click is the obvious one, but the load-bearing vector is **`frontend/lib/api.ts`'s
401→refresh→retry** (`request()` replays with the *same* `opts` after a silent token refresh,
line ~96). Any of these mutations firing right as the 15-min access token expires gets replayed
verbatim. Without a per-call idempotency key in `opts.headers`, the retry re-executes the mutation.

---

## Approach

Reuse the existing `checkIdempotency` middleware unchanged — this is a **wiring + frontend-header +
test** change, not new middleware logic. Making the header mandatory (the middleware returns `400`
when it is absent) is consistent with how every other high-stakes route already behaves, and is a
deliberate breaking change for the live frontend callers, which are updated in the same PR.

### Backend — wire `checkIdempotency` onto 5 routes

`backend/src/routes/payment.routes.ts`:
- `PATCH /:id/override` — insert after `validateParams(paymentIdParamSchema)` +
  `validateBody(overridePaymentSchema)`, before `PaymentController.overridePayment`.
- `POST /bulk-upload` — insert **before `upload.single('file')` (multer)**. `checkIdempotency`
  reads only the header, not the body; placing it before multer means a replay (cache hit) or a
  missing-key request short-circuits *without* buffering the whole Excel file into memory.

`backend/src/routes/user.routes.ts`:
- `PATCH /:id/role`, `PATCH /:id/status`, `PATCH /:id/barcode` — insert after the existing
  `validateParams` + `validateBody`, before the controller. Matches the payment-route convention
  (idempotency check last, after validation).

No service-layer or controller changes. No schema changes (`IdempotencyRecord` already exists).

### Frontend — send a per-call UUID key at the 4 live call sites

Follow the existing inline pattern used by `lib/payhere.ts`, `CollectPayment.tsx`, and
`GradeSubmissionRow.tsx`: pass `{ headers: { "Idempotency-Key": crypto.randomUUID() } }` as the
options arg. Both `api.patch` and `api.upload` already spread `opts.headers` into the request.

| File | Call |
|---|---|
| `app/(app)/admin/users/_components/UsersTable.tsx` | `/users/:id/role`, `/users/:id/barcode`, `/users/:id/status` |
| `app/(app)/payments/_components/AdminPayments.tsx` | `/payments/bulk-upload` |

**Per-call, inline — never hoisted** to a mount-time or module-level const. Two reasons:
1. A hoisted key is stable across distinct user actions, so a legitimate deactivate→reactivate
   would send the *same* key and the second action would wrongly replay the first cached response.
2. Inline `crypto.randomUUID()` is computed once into `opts` and the 401-retry reuses that same
   `opts` object — so the retry correctly carries the *same* key (dedup works), while a fresh user
   action gets a *fresh* key (not deduped). This is exactly the behavior we want.

`PATCH /payments/:id/override` has **no frontend UI yet** (tracker line 260), so there is no caller
to update — but the endpoint doc records the new requirement for whoever builds that UI.

---

## Edge cases

- **Deterministic 4xx caching.** `checkIdempotency` caches 2xx/3xx/4xx and replays them; only 5xx
  releases the lock for retry. So a first override that 404s (payment not found) caches the 404 and
  replays it on the same key — correct: the outcome is deterministic for that key.
- **bulk-upload before multer.** Confirmed safe: the middleware never touches `req.body`/`req.file`.
  On a cache hit it returns the stored response and the controller (hence multer's parsed file) is
  never reached. On a fresh request it calls `next()` and multer runs normally.
- **Privileged-target guard interaction (`/users/:id/role|status`).** These already run
  `assertCanManagePrivilegedTarget` in the service, which can throw `403`. That 403 is a 4xx →
  cached and replayed on the same key. Deterministic and correct.
- **Redis down.** Existing middleware behavior: degrades to "proceed without atomic guard" (the
  Postgres unique constraint on `IdempotencyRecord.key` remains the last line of defense). No change.

---

## Out of scope (on record)

- **`POST /users/me/nic/confirm` (`setupCompleted` flip).** Although "account activation" is named
  in `CLAUDE.md`, this route is **already idempotent by construction** — it upserts and its own doc
  comment states re-confirming is safe. It carries no double-charge / double-side-effect risk, so it
  does not need the `Idempotency-Key` machinery. No separate `/accounts/activate` route exists; the
  admin `PATCH /users/:id/status` toggle *is* the "account activation" surface and is in scope above.
- No changes to the `checkIdempotency` middleware itself, `IdempotencyRecord` schema, or the Redis
  lock strategy.

---

## Testing

Per `04-ai-workflow-rules.md §3.4`, the behavioral change here lives in the middleware + route
wiring (the services are untouched), so the tests target exactly that.

**Backend — new `backend/src/middleware/idempotency.middleware.test.ts`** (none exists today):
- missing `Idempotency-Key` header → `400`.
- malformed (non-UUID) key → `400`.
- cache hit (a prior `IdempotencyRecord` for the key) → stored `responseCode`/`responseBody` replayed,
  handler NOT called.
- concurrent lock held (Redis `SET NX` returns non-`OK`) → `409`, handler NOT called.
- 5xx response path → lock released (`redis.del` called), record NOT written.
- happy path (no existing record, lock acquired) → `next()` called; on 2xx the record is written.

Mock `@/config/database`'s `prisma` and `@/config/redis`'s `redis` per the repo's test convention.

**Backend — route wiring assertions:** verify each of the 5 routes has `checkIdempotency` in its
handler stack (e.g. inspect the router layer stack, or a focused supertest that a keyless request
gets `400`).

**Frontend — extend existing component tests:** `UsersTable` and `AdminPayments` tests assert the
mutating calls are made with a `Idempotency-Key` header (mirror `CollectPayment.test.tsx:127`'s
`expect.objectContaining({ "Idempotency-Key": expect.any(String) })`).

**Full test gate before PR:** backend `npm run test` + `npm run build`; frontend `npm run test` +
`npm run build`; live-stack smoke (deactivate→reactivate a user via the admin UI, and a bulk-upload)
against the running Docker stack.

---

## Docs to update alongside the code

- `context/api_endpoints/payments.endpoints.md` — `/:id/override` and `/bulk-upload` now require
  `Idempotency-Key`.
- `context/api_endpoints/users.endpoints.md` — `/:id/{role,status,barcode}` now require
  `Idempotency-Key`.
- `context/documents/06-progress-tracker.md` — flip lines 97 (Phase S follow-up), 255 (Phase 5
  idempotency task), and the "New 2026-07-15: Idempotency-Key missing…" Known-Risks row (line ~400).
