# Idempotency-Key Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an `Idempotency-Key` header on the five high-stakes mutations that shipped without it, by wiring the existing `checkIdempotency` middleware onto them and updating the live frontend callers to send the key.

**Architecture:** Pure wiring + frontend-header + test change. The `checkIdempotency` middleware (`backend/src/middleware/idempotency.middleware.ts`) and the `IdempotencyRecord` schema already exist and are unchanged. Backend adds the middleware to 5 routes; frontend adds a per-call inline UUID header at 4 call sites; tests cover the previously-untested middleware and assert wiring + header presence.

**Tech Stack:** Express + TypeScript (backend), Next.js 16 App Router + React (frontend), Vitest (both), Redis (`ioredis`), Prisma/Postgres.

## Global Constraints

- Backend three-tier boundary: routes wire middleware only; **no Prisma imports outside `services/`**. This change touches only `routes/` — no controller/service edits.
- Response envelope: `{ status, data, message? }` / `{ status: 'error', message, code? }`.
- Idempotency key header name is the literal string `idempotency-key` (`IDEMPOTENCY_KEY_HEADER` in `backend/src/utils/constants.ts`); the frontend sends it as `"Idempotency-Key"` (HTTP headers are case-insensitive).
- Frontend key MUST be a per-call inline `crypto.randomUUID()` passed in the request options — never hoisted to a module/mount-level const.
- Test convention: mock `@/config/database`'s `prisma` and `@/config/redis`'s `redis`; colocated `*.test.ts` / `*.test.tsx`.
- Full test gate before PR: backend `npm run test` + `npm run build`; frontend `npm run test` + `npm run build`; then live-stack smoke.
- Commit style: Conventional Commits. Branch: `fix/idempotency-key-gaps` (already created off `dev`).

---

### Task 1: Backend — coverage test for the `checkIdempotency` middleware

The middleware exists but has **zero tests** (no `src/middleware/*.test.ts` file exists at all). These tests characterize its current behavior so the subsequent wiring can't silently regress it. They pass against the existing implementation — this task adds no production code.

**Files:**
- Create: `backend/src/middleware/idempotency.middleware.test.ts`

**Interfaces:**
- Consumes: `checkIdempotency(req, res, next)` from `./idempotency.middleware`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUnique, create, redisSet, redisDel } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: { idempotencyRecord: { findUnique, create } },
}));
vi.mock('@/config/redis', () => ({ redis: { set: redisSet, del: redisDel } }));
vi.mock('@/config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { checkIdempotency } from './idempotency.middleware';

const KEY = '11111111-1111-1111-1111-111111111111';

// Minimal Express req/res doubles. res.status/json are chainable and record state.
function mockRes(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
}
function mockReq(headers: Record<string, string> = {}): any {
  return { headers, originalUrl: '/api/payments/p1/override' };
}

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  redisSet.mockReset();
  redisDel.mockReset();
});

describe('checkIdempotency middleware', () => {
  it('rejects a request with no Idempotency-Key (400) and does not call next', async () => {
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({}), res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID key (400)', async () => {
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({ 'idempotency-key': 'not-a-uuid' }), res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('replays the stored response on a cache hit and never runs the handler', async () => {
    findUnique.mockResolvedValue({
      responseCode: 201,
      responseBody: { status: 'success', data: { id: 'p1' } },
    });
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ status: 'success', data: { id: 'p1' } });
    expect(next).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('returns 409 when the lock is already held (SET NX misses)', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue(null); // ioredis SET ... NX returns null when the key exists
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(res.statusCode).toBe(409);
    expect(next).not.toHaveBeenCalled();
  });

  it('acquires the lock (SET NX) and calls next on a fresh key', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringContaining(KEY),
      expect.any(String),
      'PX',
      expect.any(Number),
      'NX',
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('caches an IdempotencyRecord when the wrapped handler responds 2xx', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    create.mockResolvedValue({});
    const res = mockRes();
    const next = vi.fn(() => {
      res.status(201).json({ status: 'success' });
    });
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: KEY, responseCode: 201 }),
      }),
    );
  });

  it('releases the lock and does not cache on a 5xx response', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    redisDel.mockResolvedValue(1);
    const res = mockRes();
    const next = vi.fn(() => {
      res.status(500).json({ status: 'error' });
    });
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(redisDel).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests, expect all pass (characterizing existing behavior)**

Run: `cd backend && npx vitest run src/middleware/idempotency.middleware.test.ts`
Expected: PASS (7 tests). If any fails, the middleware behaves differently than documented — stop and reconcile before wiring.

- [ ] **Step 3: Commit**

```bash
git add backend/src/middleware/idempotency.middleware.test.ts
git commit -m "test(idempotency): cover checkIdempotency middleware behavior"
```

---

### Task 2: Backend — wire `checkIdempotency` into the two payment routes

**Files:**
- Create: `backend/src/routes/payment.routes.test.ts`
- Modify: `backend/src/routes/payment.routes.ts`

**Interfaces:**
- Consumes: `checkIdempotency` from `@/middleware/idempotency.middleware`; `paymentRoutes` express Router from `./payment.routes`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing wiring test**

The test imports the real router with controllers + config mocked (so the service graph is never pulled), then inspects the Express layer stack. `checkIdempotency` is compared by reference — the router and the test import the same mocked-deps module, so the reference is identical.

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/database', () => ({ prisma: {} }));
vi.mock('@/config/redis', () => ({ redis: {} }));
vi.mock('@/config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/controllers/payment.controller', () => ({
  initiatePayherePayment: vi.fn(),
  collectEntrancePayment: vi.fn(),
  handlePayhereNotify: vi.fn(),
  getPayhereStatus: vi.fn(),
  listPayments: vi.fn(),
  listMyPayments: vi.fn(),
  getPaymentsSummary: vi.fn(),
  getFinancialReport: vi.fn(),
  getPaymentById: vi.fn(),
  overridePayment: vi.fn(),
  bulkUploadPayments: vi.fn(),
}));

import { paymentRoutes } from './payment.routes';
import { checkIdempotency } from '@/middleware/idempotency.middleware';

// Returns the ordered handler stack registered for a given method+path on a router.
function handlesFor(router: any, method: string, path: string): unknown[] {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack.map((s: any) => s.handle);
}

describe('payment routes — idempotency wiring', () => {
  it('PATCH /:id/override carries checkIdempotency', () => {
    expect(handlesFor(paymentRoutes, 'patch', '/:id/override')).toContain(checkIdempotency);
  });

  it('POST /bulk-upload carries checkIdempotency', () => {
    expect(handlesFor(paymentRoutes, 'post', '/bulk-upload')).toContain(checkIdempotency);
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

Run: `cd backend && npx vitest run src/routes/payment.routes.test.ts`
Expected: FAIL — both assertions fail with the stack not containing `checkIdempotency`.

- [ ] **Step 3: Wire the middleware into the override route**

In `backend/src/routes/payment.routes.ts`, the `/:id/override` handler currently is:

```typescript
// ─── Override Payment (Admin) ─────────────────────────────
paymentRoutes.patch(
	'/:id/override',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateParams(paymentIdParamSchema),
	validateBody(overridePaymentSchema),
	PaymentController.overridePayment,
);
```

Change it to insert `checkIdempotency` after `validateBody`, before the controller:

```typescript
// ─── Override Payment (Admin) ─────────────────────────────
paymentRoutes.patch(
	'/:id/override',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateParams(paymentIdParamSchema),
	validateBody(overridePaymentSchema),
	checkIdempotency,
	PaymentController.overridePayment,
);
```

- [ ] **Step 4: Wire the middleware into the bulk-upload route (before multer)**

The `/bulk-upload` handler currently is:

```typescript
// ─── Bulk Upload (Admin/Staff) ────────────────────────────
paymentRoutes.post(
	'/bulk-upload',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	upload.single('file'),
	PaymentController.bulkUploadPayments,
);
```

Insert `checkIdempotency` **before** `upload.single('file')` — a cache hit or missing-key request then short-circuits without multer buffering the whole Excel file:

```typescript
// ─── Bulk Upload (Admin/Staff) ────────────────────────────
paymentRoutes.post(
	'/bulk-upload',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	checkIdempotency,
	upload.single('file'),
	PaymentController.bulkUploadPayments,
);
```

The import already exists at the top of the file:
`import { checkIdempotency } from '@/middleware/idempotency.middleware';` — no import change needed.

- [ ] **Step 5: Run the test, expect it to pass**

Run: `cd backend && npx vitest run src/routes/payment.routes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/payment.routes.ts backend/src/routes/payment.routes.test.ts
git commit -m "fix(payments): require Idempotency-Key on override + bulk-upload"
```

---

### Task 3: Backend — wire `checkIdempotency` into the three user mutation routes

**Files:**
- Create: `backend/src/routes/user.routes.test.ts`
- Modify: `backend/src/routes/user.routes.ts`

**Interfaces:**
- Consumes: `checkIdempotency` from `@/middleware/idempotency.middleware`; `userRoutes` express Router from `./user.routes`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing wiring test**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/database', () => ({ prisma: {} }));
vi.mock('@/config/redis', () => ({ redis: {} }));
vi.mock('@/config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/controllers/user.controller', () => ({
  listUsers: vi.fn(),
  getMe: vi.fn(),
  getNicUploadUrl: vi.fn(),
  confirmNicUpload: vi.fn(),
  listMyInstituteBarcodes: vi.fn(),
  createMyInstituteBarcode: vi.fn(),
  deleteMyInstituteBarcode: vi.fn(),
  resolveBarcode: vi.fn(),
  getUserById: vi.fn(),
  updateRole: vi.fn(),
  updateStatus: vi.fn(),
  assignBarcode: vi.fn(),
}));
vi.mock('@/controllers/profile.controller', () => ({
  updateProfile: vi.fn(),
  getAvatarUploadUrl: vi.fn(),
  confirmAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
}));

import { userRoutes } from './user.routes';
import { checkIdempotency } from '@/middleware/idempotency.middleware';

function handlesFor(router: any, method: string, path: string): unknown[] {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack.map((s: any) => s.handle);
}

describe('user routes — idempotency wiring', () => {
  it('PATCH /:id/role carries checkIdempotency', () => {
    expect(handlesFor(userRoutes, 'patch', '/:id/role')).toContain(checkIdempotency);
  });

  it('PATCH /:id/status carries checkIdempotency', () => {
    expect(handlesFor(userRoutes, 'patch', '/:id/status')).toContain(checkIdempotency);
  });

  it('PATCH /:id/barcode carries checkIdempotency', () => {
    expect(handlesFor(userRoutes, 'patch', '/:id/barcode')).toContain(checkIdempotency);
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

Run: `cd backend && npx vitest run src/routes/user.routes.test.ts`
Expected: FAIL — all three assertions fail.

- [ ] **Step 3: Add the import and wire all three routes**

In `backend/src/routes/user.routes.ts`, add the import after the existing middleware imports (below the `validate.middleware` import line):

```typescript
import { checkIdempotency } from '@/middleware/idempotency.middleware';
```

Then insert `checkIdempotency` after `validateBody(...)`, before the controller, on each of the three routes. Role:

```typescript
// PATCH /api/users/:id/role — Update role (Admin only)
userRoutes.patch(
    '/:id/role',
    verifyToken,
    requireRole(Role.SUPER_ADMIN),
    validateParams(userIdParamSchema),
    validateBody(updateRoleSchema),
    checkIdempotency,
    UserController.updateRole,
);
```

Status:

```typescript
// PATCH /api/users/:id/status — Activate/deactivate (Admin + Staff)
userRoutes.patch(
    '/:id/status',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    validateBody(updateStatusSchema),
    checkIdempotency,
    UserController.updateStatus,
);
```

Barcode:

```typescript
// PATCH /api/users/:id/barcode — Assign barcode (Admin + Staff)
userRoutes.patch(
    '/:id/barcode',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    validateBody(assignBarcodeSchema),
    checkIdempotency,
    UserController.assignBarcode,
);
```

- [ ] **Step 4: Run the test, expect it to pass**

Run: `cd backend && npx vitest run src/routes/user.routes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole backend suite + build**

Run: `cd backend && npm run test && npm run build`
Expected: all tests pass (141 prior + 12 new = 153), build green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/user.routes.ts backend/src/routes/user.routes.test.ts
git commit -m "fix(users): require Idempotency-Key on role/status/barcode mutations"
```

---

### Task 4: Frontend — send `Idempotency-Key` from `UsersTable` (role/status/barcode)

**Files:**
- Create: `frontend/app/(app)/admin/users/_components/UsersTable.test.tsx`
- Modify: `frontend/app/(app)/admin/users/_components/UsersTable.tsx` (3 `api.patch` calls at lines ~81, ~111, ~153)

**Interfaces:**
- Consumes: `api.patch(path, body, opts)` from `@/lib/api` — `opts.headers` is spread into the fetch.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UsersTable } from "./UsersTable";
import type { Role, User } from "@/lib/types";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { patch, get: vi.fn(), post: vi.fn(), upload: vi.fn(), del: vi.fn() } };
});

const roles: Role[] = ["SUPER_ADMIN", "TEACHER", "ADMIN", "MARKER", "STUDENT"];

const nimal = {
  id: "u1",
  name: "Nimal",
  email: "nimal@x.lk",
  role: "STUDENT",
  indexNumber: 42,
  barcode: "LMS-0001",
  deletedAt: null,
} as User;

const baseProps = { users: [nimal], canChangeRole: true, viewerId: "admin-1", roles };

// Every mutation must carry a UUID Idempotency-Key in the request options.
const IDEM = expect.objectContaining({
  headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
});

beforeEach(() => {
  patch.mockReset().mockResolvedValue({});
  refresh.mockReset();
});

describe("UsersTable — Idempotency-Key on mutations", () => {
  it("sends an Idempotency-Key on role change", () => {
    render(<UsersTable {...baseProps} />);
    fireEvent.change(screen.getByLabelText("Role for Nimal"), { target: { value: "MARKER" } });
    expect(patch).toHaveBeenCalledWith("/users/u1/role", { role: "MARKER" }, IDEM);
  });

  it("sends an Idempotency-Key on status toggle", () => {
    render(<UsersTable {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(patch).toHaveBeenCalledWith("/users/u1/status", { isActive: false }, IDEM);
  });

  it("sends an Idempotency-Key on barcode save", () => {
    render(<UsersTable {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "LMS-0001" })); // enter edit mode
    fireEvent.change(screen.getByPlaceholderText("LMS-0001"), { target: { value: "LMS-0002" } });
    fireEvent.click(screen.getByRole("button", { name: "Save code" }));
    expect(patch).toHaveBeenCalledWith("/users/u1/barcode", { barcode: "LMS-0002" }, IDEM);
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

Run: `cd frontend && npx vitest run "app/(app)/admin/users/_components/UsersTable.test.tsx"`
Expected: FAIL — `patch` is called with only 2 args (no options object), so the `IDEM` matcher misses.

- [ ] **Step 3: Add the header to all three `api.patch` calls**

In `UsersTable.tsx`, the role `onChange` (line ~81):

```tsx
onChange={(e) => mutate(u.id, () => api.patch(`/users/${u.id}/role`, { role: e.target.value }, { headers: { "Idempotency-Key": crypto.randomUUID() } }))}
```

The barcode save `onClick` (line ~111):

```tsx
onClick={() => mutate(u.id, () => api.patch(`/users/${u.id}/barcode`, { barcode: draft.trim() }, { headers: { "Idempotency-Key": crypto.randomUUID() } }))}
```

The status toggle `onClick` (line ~153):

```tsx
onClick={() => mutate(u.id, () => api.patch(`/users/${u.id}/status`, { isActive: !active }, { headers: { "Idempotency-Key": crypto.randomUUID() } }))}
```

- [ ] **Step 4: Run the test, expect it to pass**

Run: `cd frontend && npx vitest run "app/(app)/admin/users/_components/UsersTable.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(app)/admin/users/_components/UsersTable.tsx" "frontend/app/(app)/admin/users/_components/UsersTable.test.tsx"
git commit -m "fix(users-ui): send Idempotency-Key on role/status/barcode mutations"
```

---

### Task 5: Frontend — send `Idempotency-Key` from `AdminPayments` bulk upload

**Files:**
- Modify: `frontend/app/(app)/payments/_components/AdminPayments.tsx:68`
- Modify: `frontend/app/(app)/payments/_components/AdminPayments.test.tsx:103`

**Interfaces:**
- Consumes: `api.upload(path, form, opts)` from `@/lib/api` — `opts.headers` is spread into the fetch.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Tighten the existing upload assertion to require the header (failing)**

In `AdminPayments.test.tsx`, replace the current assertion (line ~103):

```tsx
    expect(upload).toHaveBeenCalledWith("/payments/bulk-upload", expect.any(FormData));
```

with:

```tsx
    expect(upload).toHaveBeenCalledWith(
      "/payments/bulk-upload",
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
```

- [ ] **Step 2: Run the test, expect it to fail**

Run: `cd frontend && npx vitest run "app/(app)/payments/_components/AdminPayments.test.tsx"`
Expected: FAIL — `upload` is called with 2 args, matcher expects a 3rd options object.

- [ ] **Step 3: Add the header to the upload call**

In `AdminPayments.tsx` (line ~68), change:

```tsx
      const res = await api.upload<ApiSuccess<BulkUploadResult>>("/payments/bulk-upload", form);
```

to:

```tsx
      const res = await api.upload<ApiSuccess<BulkUploadResult>>("/payments/bulk-upload", form, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
```

- [ ] **Step 4: Run the test, expect it to pass**

Run: `cd frontend && npx vitest run "app/(app)/payments/_components/AdminPayments.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Run the whole frontend suite + build**

Run: `cd frontend && npm run test && npm run build`
Expected: all tests pass, build green.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(app)/payments/_components/AdminPayments.tsx" "frontend/app/(app)/payments/_components/AdminPayments.test.tsx"
git commit -m "fix(payments-ui): send Idempotency-Key on bulk-upload"
```

---

### Task 6: Docs — endpoint docs + progress tracker

**Files:**
- Modify: `context/api_endpoints/payments.endpoints.md`
- Modify: `context/api_endpoints/users.endpoints.md`
- Modify: `context/documents/06-progress-tracker.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update `payments.endpoints.md`**

Find the sections documenting `PATCH /payments/:id/override` and `POST /payments/bulk-upload`. Add to each a required-header note, matching how `/initiate` / `/collect-entrance` document it. Example line to add under each of the two endpoints:

```markdown
**Required header:** `Idempotency-Key: <uuid>` — a fresh v4 UUID per request. Missing → `400`; a
malformed (non-UUID) value → `400`; a replay of the same key → the original stored response.
```

If `/override` currently notes "no UI yet", keep that but add: *"When the override UI is built it must send a per-action `Idempotency-Key`."*

- [ ] **Step 2: Update `users.endpoints.md`**

Add the same required-header note under `PATCH /users/:id/role`, `PATCH /users/:id/status`, and `PATCH /users/:id/barcode`.

- [ ] **Step 3: Update `06-progress-tracker.md`**

Three edits:

1. Line ~97 (Phase S follow-up bullet, `Idempotency-Key missing on…`): mark it done — change the bullet to note that `/payments/:id/override`, `/payments/bulk-upload`, and `/users/:id/{role,status,barcode}` now carry `checkIdempotency` (2026-07-21), leaving only the `nic/confirm` route consciously excluded (already idempotent by upsert).

2. Line ~255 (Phase 5 idempotency task): update the "**not** on `/override` or `/bulk-upload`" clause to state they now have it.

3. The "New 2026-07-15: `Idempotency-Key` missing on…" Known-Risks row (line ~400): change status from `⬜ To implement` to `✅ Done (2026-07-21)`.

- [ ] **Step 4: Commit**

```bash
git add context/api_endpoints/payments.endpoints.md context/api_endpoints/users.endpoints.md context/documents/06-progress-tracker.md
git commit -m "docs: mark Idempotency-Key hardening implemented; note new required header"
```

---

## Final Verification (before PR)

- [ ] `cd backend && npm run test && npm run build` — all green.
- [ ] `cd frontend && npm run test && npm run build` — all green.
- [ ] Live-stack smoke (`docker compose up -d`, rebuild backend if needed):
  - Admin UI: deactivate then reactivate a user → both succeed, distinct keys, no error; Network tab shows `Idempotency-Key` on each `PATCH /users/:id/status`.
  - Admin UI: bulk-upload an Excel file → succeeds; a keyless `curl` to `PATCH /users/:id/status` (with a valid cookie) returns `400 Missing required header: idempotency-key`.
- [ ] Open PR `fix/idempotency-key-gaps` → `dev`; merge only once CI/tests are green.
