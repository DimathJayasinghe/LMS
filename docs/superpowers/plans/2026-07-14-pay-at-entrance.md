# Pay-at-Entrance + Payment Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let front-desk (`ADMIN`) and `SUPER_ADMIN` collect a cash/in-person payment at the
physical center in real time, correctly set `Payment.method`/`collectedById` everywhere (a
pre-existing gap), and give every payment a printable receipt with a QR/reference code that
resolves to the transaction's full detail — including *where* it was collected and *which
barcode* identified the student.

**Architecture:** `payment.service.ts` gains `collectEntrancePayment` (mirrors the existing
`overridePayment`/`bulkUploadPayments` shape); a new `resolveStudentByBarcode` lives in
`user.service.ts` since it's a user-lookup concern, not a payment concern. Frontend adds a
`CollectPayment` card to the existing `/payments` admin view and a new `/payments/[id]` receipt
page (doubles as the QR/reference lookup target, reusing the existing `GET /payments/:id`
authorization — no new public surface).

**Tech Stack:** Express + Prisma (Postgres) + Zod + Vitest (backend); Next.js 16 App Router +
React Testing Library (frontend); `qrcode.react` (already a dependency) for the receipt QR.

## Global Constraints

- Three-tier: `routes` → `controllers` (zero Prisma imports) → `services` (only layer importing
  `@/config/database`'s `prisma`). Copied verbatim from CLAUDE.md.
- Response envelope: `{ "status": "success", "data": {}, "message"? }` / `{ "status": "success", "data": [], "count": 0 }` / `{ "status": "error", "message", "code" }`.
- Known failures throw `AppError(code, statusCode, message)` from `@/utils/app-error`.
- Soft deletes only; never hard-delete a model with relations. FK `onDelete` is `Restrict`/`SetNull`, never `Cascade`.
- High-stakes POSTs require an `Idempotency-Key` header (`checkIdempotency` middleware).
- Every new implementation/behavioral change is backed by a Vitest unit test (§3.4) in addition to live-stack verification.
- Backend tests mock `@/config/database`'s `prisma` export and any other service the code under test calls.
- Conventional Commits; branch is `feature/pay-at-entrance` (already created off `dev`).
- `noUncheckedIndexedAccess` is on — index access needs `?.`/`!`.
- **This repo's DB applies schema changes via `prisma db push` on container start, not `prisma migrate deploy`** — there is no `_prisma_migrations` table. Do not run `prisma migrate dev`/`migrate reset` against it (it will offer to drop the schema). See Task 1.
- Frontend: read `node_modules/next/dist/docs/` before writing Next.js code (this is Next 16, not training-data Next). Backend/frontend files use tabs and 2-space indent respectively — match each existing file's style exactly, as shown in the code blocks below.

---

### Task 1: Schema + constants

**Files:**
- Modify: `backend/prisma/schema.prisma` (`Payment` model, `Institute` model)
- Modify: `backend/src/utils/constants.ts` (`AUDIT_ACTION`)

**Interfaces:**
- Produces: `Payment.collectedAtInstituteId`, `Payment.collectedAtInstitute`, `Payment.collectedViaBarcode`; `Institute.payments`; `AUDIT_ACTION.PAYMENT_ENTRANCE_COLLECTED`.

- [ ] **Step 1: Add the two new `Payment` columns.** In `schema.prisma`, inside `model Payment`, right after the `collectedBy` relation block (after the line `collectedBy   User?   @relation("PaymentCollector", fields: [collectedById], references: [id], onDelete: SetNull)`), add:

```prisma
  collectedAtInstituteId String?
  collectedAtInstitute   Institute? @relation(fields: [collectedAtInstituteId], references: [id], onDelete: SetNull)
  collectedViaBarcode    String? // raw barcode value that identified the student — a
                                  // point-in-time snapshot, not a live FK, since
                                  // StudentBarcode rows can be hard-deleted later
                                  // and this must stay a stable audit fact
```

Then add a new index inside the same model's `@@index(...)` block (alongside the existing four):

```prisma
  @@index([collectedAtInstituteId])
```

- [ ] **Step 2: Add the inverse relation on `Institute`.** In `model Institute`, add `payments Payment[]` alongside the existing `studentBarcodes`/`timetableSlots` lines:

```prisma
  studentBarcodes StudentBarcode[]
  timetableSlots  TimetableSlot[]
  payments        Payment[]
```

- [ ] **Step 3: Add the audit action constant.** In `backend/src/utils/constants.ts`, inside the `AUDIT_ACTION` object's `// Payments` section, add a third entry after `PAYMENT_BULK_UPLOAD`:

```ts
	// Payments
	PAYMENT_OVERRIDDEN: 'PAYMENT_OVERRIDDEN',
	PAYMENT_BULK_UPLOAD: 'PAYMENT_BULK_UPLOAD',
	PAYMENT_ENTRANCE_COLLECTED: 'PAYMENT_ENTRANCE_COLLECTED',
```

- [ ] **Step 4: Regenerate the Prisma client.** This only reads `schema.prisma` — no DB connection needed, safe to run locally.

Run: `cd backend && npx prisma generate`
Expected: PASS, no DB connection attempted.

- [ ] **Step 5: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (new fields/constant compile; nothing references them yet so no new errors).

- [ ] **Step 6: Commit.**

```bash
git add backend/prisma/schema.prisma backend/src/utils/constants.ts
git commit -m "feat(payments): add collectedAtInstitute/collectedViaBarcode schema + audit action"
```

---

### Task 2: Zod schemas

**Files:**
- Modify: `backend/src/schemas/payment.schema.ts`
- Modify: `backend/src/schemas/user.schema.ts`

**Interfaces:**
- Produces: `collectEntrancePaymentSchema`/`CollectEntrancePaymentInput`; `resolveBarcodeQuerySchema`/`ResolveBarcodeQuery`.

- [ ] **Step 1: Add the entrance-collection schema.** In `payment.schema.ts`, append after `bulkPaymentRowSchema`'s `export type BulkPaymentRow = ...` line:

```ts
// ─── Entrance Collection (Admin/Staff) ─────────────────────
export const collectEntrancePaymentSchema = z.object({
	enrollmentId: z.string().uuid(),
	paymentMonth: paymentMonthSchema,
	amount: z.coerce.number().positive().optional(),
	collectedAtInstituteId: z.string().uuid().optional(),
	collectedViaBarcode: z.string().trim().min(1).max(50).optional(),
});

export type CollectEntrancePaymentInput = z.infer<typeof collectEntrancePaymentSchema>;
```

- [ ] **Step 2: Add the barcode-resolution query schema.** In `user.schema.ts`, append after `studentBarcodeIdParamSchema`:

```ts
// ─── Barcode Resolution (Admin/Staff) ───────────────────────
export const resolveBarcodeQuerySchema = z.object({
	code: z.string().trim().min(1).max(50),
});

export type ResolveBarcodeQuery = z.infer<typeof resolveBarcodeQuerySchema>;
```

- [ ] **Step 3: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add backend/src/schemas/payment.schema.ts backend/src/schemas/user.schema.ts
git commit -m "feat(payments): zod schemas for entrance collection + barcode resolution"
```

---

### Task 3: `paymentSelect` fix + `overridePayment`/`bulkUploadPayments` sibling fixes — TDD

**Files:**
- Modify: `backend/src/services/payment.service.ts`
- Modify: `backend/src/services/payment.service.test.ts`
- Modify: `backend/src/controllers/payment.controller.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `paymentSelect` now includes `method`, `collectedBy`, `collectedAtInstitute`,
  `collectedViaBarcode`; `PaymentSummary` interface gains matching fields;
  `overridePayment(paymentId, input, actingAdminId: string)` (signature change — third param
  added); `bulkUploadPayments` sets `method: BULK` on both its create and update branches.

- [ ] **Step 1: Write the failing tests.** In `payment.service.test.ts`, expand the `vi.mock('@/config/database', ...)` block to also stub `findUnique`, `update`, and `create`, and add a `notification.service` mock (both `overridePayment` and the later `collectEntrancePayment` call `NotificationService.dispatch`). Replace the top of the file (everything before `import { getPaymentsSummary } from './payment.service';`) with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const { paymentAggregate, paymentCount, paymentFindUnique, paymentUpdate, dispatch } = vi.hoisted(() => ({
	paymentAggregate: vi.fn(),
	paymentCount: vi.fn(),
	paymentFindUnique: vi.fn(),
	paymentUpdate: vi.fn(),
	dispatch: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		payment: {
			aggregate: paymentAggregate,
			count: paymentCount,
			findUnique: paymentFindUnique,
			update: paymentUpdate,
		},
	},
}));

vi.mock('@/services/notification.service', () => ({ dispatch }));

import { getPaymentsSummary, overridePayment } from './payment.service';

beforeEach(() => {
	paymentAggregate.mockReset();
	paymentCount.mockReset();
	paymentFindUnique.mockReset();
	paymentUpdate.mockReset();
	dispatch.mockReset();
});
```

(Leave the existing `describe('getPaymentsSummary', ...)` block untouched below this.) Then append a new describe block at the end of the file:

```ts

describe('overridePayment — method/collectedById', () => {
	const existingPayment = { id: 'pay-1', status: 'PENDING' };
	const updatedPayment = {
		id: 'pay-1',
		amount: new Prisma.Decimal('2500'),
		status: 'SUCCESS',
		method: 'MANUAL',
		collectedById: 'admin-1',
		paymentMonth: '2026-07',
		enrollment: { userId: 'u1', course: { name: 'Physics' } },
	};

	it('sets method: MANUAL and collectedById to the acting admin', async () => {
		paymentFindUnique.mockResolvedValueOnce(existingPayment);
		paymentUpdate.mockResolvedValueOnce(updatedPayment);

		await overridePayment('pay-1', { status: 'SUCCESS' as const, amount: 2500 }, 'admin-1');

		expect(paymentUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ method: 'MANUAL', collectedById: 'admin-1' }),
			}),
		);
	});
});
```

- [ ] **Step 2: Run the tests to confirm the new one fails (signature mismatch).**

Run: `cd backend && npm run test -- payment.service`
Expected: FAIL — `overridePayment` doesn't yet accept a third argument, and doesn't set `method`/`collectedById`.

- [ ] **Step 3: Fix `paymentSelect` and `PaymentSummary`.** In `payment.service.ts`, replace the `paymentSelect` constant with:

```ts
const paymentSelect = {
	id: true,
	amount: true,
	status: true,
	method: true,
	payhereId: true,
	paymentMonth: true,
	note: true,
	createdAt: true,
	updatedAt: true,
	collectedBy: {
		select: { id: true, name: true },
	},
	collectedAtInstitute: {
		select: { id: true, name: true, code: true },
	},
	collectedViaBarcode: true,
	enrollment: {
		select: {
			id: true,
			classType: true,
			userId: true,
			user: {
				select: {
					id: true,
					name: true,
					email: true,
					indexNumber: true,
					phone: true,
					address: true,
					city: true,
				},
			},
			course: {
				select: {
					id: true,
					name: true,
					year: true,
					monthlyFee: true,
				},
			},
		},
	},
} satisfies Prisma.PaymentSelect;
```

And replace the `PaymentSummary` interface with:

```ts
interface PaymentSummary {
	id: string;
	amount: Prisma.Decimal;
	status: PaymentStatus;
	method: PaymentMethod;
	payhereId: string | null;
	paymentMonth: string;
	note: string | null;
	createdAt: Date;
	updatedAt: Date;
	collectedBy: { id: string; name: string } | null;
	collectedAtInstitute: { id: string; name: string; code: string } | null;
	collectedViaBarcode: string | null;
	enrollment: {
		id: string;
		classType: ClassType;
		userId: string;
		user: {
			id: string;
			name: string;
			email: string;
			indexNumber: number;
			phone: string | null;
			address: string | null;
			city: string | null;
		};
		course: {
			id: string;
			name: string;
			year: number;
			monthlyFee: Prisma.Decimal;
		};
	};
}
```

- [ ] **Step 4: Fix `overridePayment`.** Replace the function with:

```ts
export const overridePayment = async (
	paymentId: string,
	input: OverridePaymentInput,
	actingAdminId: string,
): Promise<PaymentSummary> => {
	const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

	if (!payment) {
		throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found.');
	}

	const updated = await prisma.payment.update({
		where: { id: paymentId },
		data: {
			status: input.status,
			amount: input.amount,
			note: input.note,
			method: PaymentMethod.MANUAL,
			collectedById: actingAdminId,
		},
		select: paymentSelect,
	});

	void NotificationService.dispatch({
		type: NotificationType.PAYMENT_OVERRIDDEN,
		userId: updated.enrollment.userId,
		link: '/payments',
		params: {
			courseName: updated.enrollment.course.name,
			paymentMonth: updated.paymentMonth,
			status: updated.status,
		},
	});

	return updated;
};
```

- [ ] **Step 5: Fix `bulkUploadPayments`.** In the same file, inside `bulkUploadPayments`, add `method: PaymentMethod.BULK,` to both the `update` and `create` data objects:

```ts
			if (existing) {
				await prisma.payment.update({
					where: { id: existing.id },
					data: {
						amount,
						status: PaymentStatus.SUCCESS,
						method: PaymentMethod.BULK,
						note: normalized.note ?? existing.note,
					},
				});
				result.updated += 1;
				continue;
			}

			await prisma.payment.create({
				data: {
					enrollmentId: enrollment.id,
					paymentMonth: normalized.paymentMonth,
					amount,
					status: PaymentStatus.SUCCESS,
					method: PaymentMethod.BULK,
					note: normalized.note ?? 'Bulk upload',
				},
			});
```

- [ ] **Step 6: Update the controller call site.** In `payment.controller.ts`, in the `overridePayment` handler, change the call to pass the acting admin's id:

```ts
		const payment = await PaymentService.overridePayment(id, input, req.user!.userId);
```

- [ ] **Step 7: Run the tests to green.**

Run: `cd backend && npm run test -- payment.service`
Expected: PASS (both `getPaymentsSummary` cases and the new `overridePayment` case).

- [ ] **Step 8: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add backend/src/services/payment.service.ts backend/src/services/payment.service.test.ts backend/src/controllers/payment.controller.ts
git commit -m "fix(payments): paymentSelect exposes method/collectedBy/institute/barcode; override sets method:MANUAL, bulk upload sets method:BULK"
```

---

### Task 4: `resolveStudentByBarcode` — write tests first, then implement

**Files:**
- Modify: `backend/src/services/user.service.ts`
- Modify: `backend/src/services/user.service.test.ts`
- Modify: `backend/src/controllers/user.controller.ts`
- Modify: `backend/src/routes/user.routes.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `resolveStudentByBarcode(code: string): Promise<{ user: { id: string; name: string; indexNumber: number }; instituteId: string | null; matchedBarcode: string }>`; route `GET /api/users/resolve-barcode?code=`.

- [ ] **Step 1: Write the failing tests.** In `user.service.test.ts`, extend the top-of-file mock to add `studentBarcode.findMany`:

```ts
const { findUnique, update, studentBarcodeFindMany } = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
	studentBarcodeFindMany: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		user: { findUnique, update },
		studentBarcode: { findMany: studentBarcodeFindMany },
	},
}));
```

(This replaces the existing `vi.hoisted`/`vi.mock` pair at the top — keep everything else, including `import { updateStatus, assignBarcode } from './user.service';`, unchanged, but add `resolveStudentByBarcode` to that import.) Then also reset the new mock in `beforeEach`:

```ts
beforeEach(() => {
	findUnique.mockReset();
	update.mockReset();
	studentBarcodeFindMany.mockReset();
});
```

Append a new describe block at the end of the file:

```ts

describe('resolveStudentByBarcode', () => {
	const stuUser = { id: 'u1', name: 'Nimal Perera', indexNumber: 42 };

	it('resolves via a single institute-scoped StudentBarcode match', async () => {
		studentBarcodeFindMany.mockResolvedValueOnce([{ instituteId: 'inst-1', user: stuUser }]);

		const result = await resolveStudentByBarcode('NUG-001');

		expect(result).toEqual({ user: stuUser, instituteId: 'inst-1', matchedBarcode: 'NUG-001' });
		expect(findUnique).not.toHaveBeenCalled();
	});

	it('falls through to the global User.barcode when no StudentBarcode matches', async () => {
		studentBarcodeFindMany.mockResolvedValueOnce([]);
		findUnique.mockResolvedValueOnce(stuUser);

		const result = await resolveStudentByBarcode('LMS-042');

		expect(result).toEqual({ user: stuUser, instituteId: null, matchedBarcode: 'LMS-042' });
	});

	it('falls through (does not guess an institute) when the code matches more than one institute', async () => {
		studentBarcodeFindMany.mockResolvedValueOnce([
			{ instituteId: 'inst-1', user: stuUser },
			{ instituteId: 'inst-2', user: { id: 'u2', name: 'Other', indexNumber: 7 } },
		]);
		findUnique.mockResolvedValueOnce(stuUser);

		const result = await resolveStudentByBarcode('AMBIGUOUS');

		expect(result).toEqual({ user: stuUser, instituteId: null, matchedBarcode: 'AMBIGUOUS' });
	});

	it('404s when the code matches nothing anywhere', async () => {
		studentBarcodeFindMany.mockResolvedValueOnce([]);
		findUnique.mockResolvedValueOnce(null);

		await expect(resolveStudentByBarcode('NOPE')).rejects.toMatchObject({
			code: 'BARCODE_NOT_FOUND',
			statusCode: 404,
		});
	});
});
```

- [ ] **Step 2: Run it to confirm it fails (export not found).**

Run: `cd backend && npm run test -- user.service`
Expected: FAIL — `resolveStudentByBarcode` is not exported yet.

- [ ] **Step 3: Implement `resolveStudentByBarcode`.** In `user.service.ts`, append after `deleteMyInstituteBarcode`:

```ts

interface ResolvedBarcodeStudent {
	user: { id: string; name: string; indexNumber: number };
	instituteId: string | null;
	matchedBarcode: string;
}

/**
 * Resolves a scanned code to a student for staff-facing flows (payment collection today;
 * a natural future fit for the entrance attendance scanner too, which currently only checks
 * `User.barcode` — see 06-progress-tracker.md). Tries the institute-scoped `StudentBarcode`
 * first; a code that matches more than one institute (barcode uniqueness is only enforced
 * *per institute*, not globally) is treated as unresolved rather than guessed.
 */
export const resolveStudentByBarcode = async (code: string): Promise<ResolvedBarcodeStudent> => {
	const instituteMatches = await prisma.studentBarcode.findMany({
		where: { barcode: code },
		select: { instituteId: true, user: { select: { id: true, name: true, indexNumber: true } } },
	});

	if (instituteMatches.length === 1) {
		const match = instituteMatches[0]!;
		return { user: match.user, instituteId: match.instituteId, matchedBarcode: code };
	}

	const user = await prisma.user.findUnique({
		where: { barcode: code },
		select: { id: true, name: true, indexNumber: true },
	});

	if (!user) {
		throw new AppError(
			'BARCODE_NOT_FOUND',
			404,
			'No student found with this barcode. Please verify the barcode is assigned.',
		);
	}

	return { user, instituteId: null, matchedBarcode: code };
};
```

- [ ] **Step 4: Wire the controller.** In `user.controller.ts`, change the `@/schemas/user.schema` import block from:

```ts
import {
	listUsersQuerySchema,
	userIdParamSchema,
	nicUploadUrlSchema,
	nicConfirmSchema,
	createStudentBarcodeSchema,
	studentBarcodeIdParamSchema,
	type AssignBarcodeInput,
	type UpdateRoleInput,
	type UpdateStatusInput,
} from '@/schemas/user.schema';
```

to:

```ts
import {
	listUsersQuerySchema,
	userIdParamSchema,
	nicUploadUrlSchema,
	nicConfirmSchema,
	createStudentBarcodeSchema,
	studentBarcodeIdParamSchema,
	resolveBarcodeQuerySchema,
	type AssignBarcodeInput,
	type UpdateRoleInput,
	type UpdateStatusInput,
} from '@/schemas/user.schema';
```

Then append at the end of the file:

```ts

export const resolveBarcode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { code } = resolveBarcodeQuerySchema.parse(req.query);
	const data = await UserService.resolveStudentByBarcode(code);

	res.status(200).json({
		status: 'success',
		data,
	});
});
```

- [ ] **Step 5: Wire the route.** In `user.routes.ts`, change the `@/schemas/user.schema` import block from:

```ts
import {
    assignBarcodeSchema,
    createStudentBarcodeSchema,
    listUsersQuerySchema,
    nicUploadUrlSchema,
    nicConfirmSchema,
    studentBarcodeIdParamSchema,
    updateRoleSchema,
    updateStatusSchema,
    userIdParamSchema,
} from '@/schemas/user.schema';
```

to:

```ts
import {
    assignBarcodeSchema,
    createStudentBarcodeSchema,
    listUsersQuerySchema,
    nicUploadUrlSchema,
    nicConfirmSchema,
    resolveBarcodeQuerySchema,
    studentBarcodeIdParamSchema,
    updateRoleSchema,
    updateStatusSchema,
    userIdParamSchema,
} from '@/schemas/user.schema';
```

Then insert a new route right before the `// GET /api/users/:id` comment (so `resolve-barcode` isn't swallowed by `/:id`):

```ts
// GET /api/users/resolve-barcode — Resolve a scanned barcode to a student (Admin + Staff)
userRoutes.get(
    '/resolve-barcode',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateQuery(resolveBarcodeQuerySchema),
    UserController.resolveBarcode,
);

// GET /api/users/:id — Get user by id (Admin + Staff)
```

- [ ] **Step 6: Run the tests to green.**

Run: `cd backend && npm run test -- user.service`
Expected: PASS (all 4 new cases, plus the existing `updateStatus`/`assignBarcode` suites unaffected).

- [ ] **Step 7: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add backend/src/services/user.service.ts backend/src/services/user.service.test.ts backend/src/controllers/user.controller.ts backend/src/routes/user.routes.ts
git commit -m "feat(payments): resolveStudentByBarcode (StudentBarcode-then-global) + GET /users/resolve-barcode"
```

---

### Task 5: `collectEntrancePayment` — write tests first, then implement

**Files:**
- Modify: `backend/src/services/payment.service.ts`
- Modify: `backend/src/services/payment.service.test.ts`
- Modify: `backend/src/controllers/payment.controller.ts`
- Modify: `backend/src/routes/payment.routes.ts`

**Interfaces:**
- Consumes: `getCurrentPaymentMonth` (`@/services/access.service`); `paymentSelect` (Task 3).
- Produces: `collectEntrancePayment(collectedById: string, input: CollectEntrancePaymentInput): Promise<PaymentSummary>`; route `POST /api/payments/collect-entrance`.

- [ ] **Step 1: Write the failing tests.** In `payment.service.test.ts`, extend the mocked `prisma` object (from Task 3) to add `enrollment.findUnique` and `payment.create`, and add an `access.service` mock for a deterministic "current month":

```ts
const { paymentAggregate, paymentCount, paymentFindUnique, paymentUpdate, paymentCreate, enrollmentFindUnique, dispatch, getCurrentPaymentMonth } = vi.hoisted(() => ({
	paymentAggregate: vi.fn(),
	paymentCount: vi.fn(),
	paymentFindUnique: vi.fn(),
	paymentUpdate: vi.fn(),
	paymentCreate: vi.fn(),
	enrollmentFindUnique: vi.fn(),
	dispatch: vi.fn(),
	getCurrentPaymentMonth: vi.fn(() => '2026-07'),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		payment: {
			aggregate: paymentAggregate,
			count: paymentCount,
			findUnique: paymentFindUnique,
			update: paymentUpdate,
			create: paymentCreate,
		},
		enrollment: { findUnique: enrollmentFindUnique },
	},
}));

vi.mock('@/services/notification.service', () => ({ dispatch }));
vi.mock('@/services/access.service', () => ({ getCurrentPaymentMonth }));

import { getPaymentsSummary, overridePayment, collectEntrancePayment } from './payment.service';

beforeEach(() => {
	paymentAggregate.mockReset();
	paymentCount.mockReset();
	paymentFindUnique.mockReset();
	paymentUpdate.mockReset();
	paymentCreate.mockReset();
	enrollmentFindUnique.mockReset();
	dispatch.mockReset();
	getCurrentPaymentMonth.mockReturnValue('2026-07');
});
```

(This replaces the `vi.hoisted`/`vi.mock`/`import`/`beforeEach` block from Task 3 — the `overridePayment` test from Task 3 keeps working unchanged since its mocks are a subset of this superset.) Append a new describe block at the end of the file:

```ts

describe('collectEntrancePayment', () => {
	const activeEnrollment = {
		id: 'e1',
		isActive: true,
		userId: 'u1',
		course: { name: 'Physics', monthlyFee: new Prisma.Decimal('2500') },
	};
	const created = {
		id: 'pay-new',
		amount: new Prisma.Decimal('2500'),
		status: 'SUCCESS',
		method: 'ENTRANCE',
		paymentMonth: '2026-07',
		enrollment: { userId: 'u1', course: { name: 'Physics' } },
	};

	it('creates a new SUCCESS/ENTRANCE payment when none exists, defaulting the amount to monthlyFee', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce(null);
		paymentCreate.mockResolvedValueOnce(created);

		const result = await collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' });

		expect(paymentCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					enrollmentId: 'e1',
					paymentMonth: '2026-07',
					amount: 2500,
					status: 'SUCCESS',
					method: 'ENTRANCE',
					collectedById: 'admin-1',
				}),
			}),
		);
		expect(result).toEqual(created);
	});

	it('updates an existing PENDING/FAILED row instead of creating a duplicate', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce({ id: 'pay-old', status: 'FAILED', payhereId: null });
		paymentUpdate.mockResolvedValueOnce(created);

		await collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' });

		expect(paymentUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'pay-old' } }),
		);
		expect(paymentCreate).not.toHaveBeenCalled();
	});

	it('rejects with ALREADY_PAID_ONLINE when the month is already a confirmed online payment', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce({ id: 'pay-online', status: 'SUCCESS', payhereId: 'payhere_1' });

		await expect(
			collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' }),
		).rejects.toMatchObject({ code: 'ALREADY_PAID_ONLINE', statusCode: 409 });
		expect(paymentUpdate).not.toHaveBeenCalled();
		expect(paymentCreate).not.toHaveBeenCalled();
	});

	it('rejects ENROLLMENT_NOT_ACTIVE before touching Payment', async () => {
		enrollmentFindUnique.mockResolvedValueOnce({ ...activeEnrollment, isActive: false });

		await expect(
			collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' }),
		).rejects.toMatchObject({ code: 'ENROLLMENT_NOT_ACTIVE', statusCode: 400 });
		expect(paymentFindUnique).not.toHaveBeenCalled();
	});

	it('rejects FUTURE_MONTH', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);

		await expect(
			collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-08' }),
		).rejects.toMatchObject({ code: 'FUTURE_MONTH', statusCode: 400 });
		expect(paymentFindUnique).not.toHaveBeenCalled();
	});

	it('persists collectedAtInstituteId/collectedViaBarcode when passed', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce(null);
		paymentCreate.mockResolvedValueOnce(created);

		await collectEntrancePayment('admin-1', {
			enrollmentId: 'e1',
			paymentMonth: '2026-07',
			collectedAtInstituteId: 'inst-1',
			collectedViaBarcode: 'NUG-001',
		});

		expect(paymentCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					collectedAtInstituteId: 'inst-1',
					collectedViaBarcode: 'NUG-001',
				}),
			}),
		);
	});
});
```

- [ ] **Step 2: Run it to confirm it fails (export not found).**

Run: `cd backend && npm run test -- payment.service`
Expected: FAIL — `collectEntrancePayment` is not exported yet.

- [ ] **Step 3: Implement `collectEntrancePayment`.** In `payment.service.ts`, add a new import line right after the existing `import { formatPayhereAmount, ... } from '@/utils/payhere';` line:

```ts
import { getCurrentPaymentMonth } from '@/services/access.service';
```

Then change the `@/schemas/payment.schema` import block from:

```ts
import {
	bulkPaymentRowSchema,
	type BulkPaymentRow,
	type InitiatePaymentInput,
	type ListMyPaymentsQuery,
	type ListPaymentsQuery,
	type OverridePaymentInput,
	type PayhereNotifyInput,
} from '@/schemas/payment.schema';
```

to:

```ts
import {
	bulkPaymentRowSchema,
	type BulkPaymentRow,
	type CollectEntrancePaymentInput,
	type InitiatePaymentInput,
	type ListMyPaymentsQuery,
	type ListPaymentsQuery,
	type OverridePaymentInput,
	type PayhereNotifyInput,
} from '@/schemas/payment.schema';
```

Then append the function after `overridePayment`:

```ts

export const collectEntrancePayment = async (
	collectedById: string,
	input: CollectEntrancePaymentInput,
): Promise<PaymentSummary> => {
	const enrollment = await prisma.enrollment.findUnique({
		where: { id: input.enrollmentId },
		include: { course: true },
	});

	if (!enrollment) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
	}

	if (!enrollment.isActive) {
		throw new AppError('ENROLLMENT_NOT_ACTIVE', 400, 'This enrollment is not active.');
	}

	if (input.paymentMonth > getCurrentPaymentMonth()) {
		throw new AppError('FUTURE_MONTH', 400, 'Cannot collect a payment for a future month.');
	}

	const resolvedAmount = input.amount ?? Number(enrollment.course.monthlyFee);

	const existing = await prisma.payment.findUnique({
		where: {
			enrollmentId_paymentMonth: {
				enrollmentId: input.enrollmentId,
				paymentMonth: input.paymentMonth,
			},
		},
	});

	if (existing?.status === PaymentStatus.SUCCESS && existing.payhereId) {
		throw new AppError('ALREADY_PAID_ONLINE', 409, 'This month is already paid online.');
	}

	const fields = {
		status: PaymentStatus.SUCCESS,
		method: PaymentMethod.ENTRANCE,
		amount: resolvedAmount,
		collectedById,
		collectedAtInstituteId: input.collectedAtInstituteId ?? null,
		collectedViaBarcode: input.collectedViaBarcode ?? null,
		note: 'Collected at entrance',
	};

	const payment = existing
		? await prisma.payment.update({
				where: { id: existing.id },
				data: fields,
				select: paymentSelect,
			})
		: await prisma.payment.create({
				data: { enrollmentId: input.enrollmentId, paymentMonth: input.paymentMonth, ...fields },
				select: paymentSelect,
			});

	void NotificationService.dispatch({
		type: NotificationType.PAYMENT_CONFIRMED,
		userId: enrollment.userId,
		link: '/payments',
		params: {
			courseName: enrollment.course.name,
			paymentMonth: input.paymentMonth,
		},
	});

	return payment;
};
```

- [ ] **Step 4: Wire the controller.** In `payment.controller.ts`, change the `@/schemas/payment.schema` import block from:

```ts
import {
	initiatePaymentSchema,
	listMyPaymentsQuerySchema,
	listPaymentsQuerySchema,
	overridePaymentSchema,
	payhereNotifySchema,
	paymentIdParamSchema,
	paymentsSummaryQuerySchema,
	financialReportQuerySchema,
} from '@/schemas/payment.schema';
```

to:

```ts
import {
	collectEntrancePaymentSchema,
	initiatePaymentSchema,
	listMyPaymentsQuerySchema,
	listPaymentsQuerySchema,
	overridePaymentSchema,
	payhereNotifySchema,
	paymentIdParamSchema,
	paymentsSummaryQuerySchema,
	financialReportQuerySchema,
} from '@/schemas/payment.schema';
```

Then append at the end of the file (before the `// ─── SMS Helpers` section):

```ts

export const collectEntrancePayment = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const input = collectEntrancePaymentSchema.parse(req.body);
		const payment = await PaymentService.collectEntrancePayment(req.user!.userId, input);

		void AuditService.log({
			action: AUDIT_ACTION.PAYMENT_ENTRANCE_COLLECTED,
			description: `Entrance payment collected for ${input.paymentMonth}`,
			targetType: 'Payment',
			targetId: payment.id,
			metadata: {
				enrollmentId: input.enrollmentId,
				paymentMonth: input.paymentMonth,
				amount: payment.amount.toString(),
				collectedAtInstituteId: input.collectedAtInstituteId,
				collectedViaBarcode: input.collectedViaBarcode,
			},
			context: extractAuditContext(req),
		});

		res.status(200).json({
			status: 'success',
			data: payment,
			message: 'Payment collected.',
		});
	},
);
```

- [ ] **Step 5: Wire the route.** In `payment.routes.ts`, change the `@/schemas/payment.schema` import block from:

```ts
import {
	initiatePaymentSchema,
	listMyPaymentsQuerySchema,
	listPaymentsQuerySchema,
	overridePaymentSchema,
	paymentIdParamSchema,
	paymentsSummaryQuerySchema,
	financialReportQuerySchema,
} from '@/schemas/payment.schema';
```

to:

```ts
import {
	collectEntrancePaymentSchema,
	initiatePaymentSchema,
	listMyPaymentsQuerySchema,
	listPaymentsQuerySchema,
	overridePaymentSchema,
	paymentIdParamSchema,
	paymentsSummaryQuerySchema,
	financialReportQuerySchema,
} from '@/schemas/payment.schema';
```

Then insert a new section right after the `/payhere/checkout` route:

```ts
// ─── Entrance Collection (Admin/Staff) ─────────────────────
paymentRoutes.post(
	'/collect-entrance',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateBody(collectEntrancePaymentSchema),
	checkIdempotency,
	PaymentController.collectEntrancePayment,
);
```

- [ ] **Step 6: Run the tests to green.**

Run: `cd backend && npm run test -- payment.service`
Expected: PASS (all `getPaymentsSummary`, `overridePayment`, and 6 new `collectEntrancePayment` cases).

- [ ] **Step 7: Typecheck + full backend test run.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS (all suites).

- [ ] **Step 8: Commit.**

```bash
git add backend/src/services/payment.service.ts backend/src/services/payment.service.test.ts backend/src/controllers/payment.controller.ts backend/src/routes/payment.routes.ts
git commit -m "feat(payments): collectEntrancePayment service + POST /payments/collect-entrance"
```

---

### Task 6: Backend endpoint docs

**Files:**
- Modify: `context/api_endpoints/payments.endpoints.md`
- Modify: `context/api_endpoints/users.endpoints.md`

- [ ] **Step 1: Document the new payments endpoint.** In `payments.endpoints.md`, insert a new section after "### 7. Bulk Upload Payments (Admin)" (before the `## Sandbox testing` heading):

```markdown
### 8. Collect Entrance Payment (Admin/Staff)
Records a cash/in-person payment collected at the physical center, without going through
PayHere. Upserts: a missing or PENDING/FAILED row is written to `SUCCESS`/`ENTRANCE`; a
confirmed **online** `SUCCESS` (has a `payhereId`) is refused rather than overwritten — use
`/override` to correct an online payment.

- **URL:** `/collect-entrance`
- **Method:** `POST`
- **Auth:** Required (Role: `SUPER_ADMIN`, `ADMIN`)
- **Headers:** `Idempotency-Key: <uuid>` **required**.
- **Body:**
  ```json
  {
    "enrollmentId": "uuid",
    "paymentMonth": "YYYY-MM",
    "amount": 2500,
    "collectedAtInstituteId": "uuid",
    "collectedViaBarcode": "NUG-00123"
  }
  ```
  `amount` optional (defaults to the course's `monthlyFee`). `collectedAtInstituteId`/
  `collectedViaBarcode` optional — present only when the student was identified via
  `GET /users/resolve-barcode` (see `users.endpoints.md`) rather than a name/index search.
- **Success Response (200 OK):** the `Payment` (same shape as `/override`'s response).
- **Errors:** `404 ENROLLMENT_NOT_FOUND`, `400 ENROLLMENT_NOT_ACTIVE`, `400 FUTURE_MONTH`
  (cannot collect for a month after the current payment month), `409 ALREADY_PAID_ONLINE`.
```

Then update the note at the top of the file (right under `## Base URL: /api/payments`) that says *"A dedicated pay-at-entrance endpoint is a follow-up"* — delete that sentence; it's no longer a follow-up. Also amend the `### 6. Override Payment (Admin)` section to note it now sets `method: MANUAL` and `collectedById` to the acting admin, and `### 7. Bulk Upload Payments (Admin)` to note it now sets `method: BULK`.

- [ ] **Step 2: Document the new users endpoint.** In `users.endpoints.md`, add a row to the `## Endpoints Summary` table and a new `### GET /resolve-barcode` subsection (mirroring the existing `### GET /:id` section's structure) covering: roles (`SUPER_ADMIN`, `ADMIN`), query param `code`, the `StudentBarcode`-then-`User.barcode` resolution order, the `{ user, instituteId, matchedBarcode }` response shape, and the `404 BARCODE_NOT_FOUND` error.

- [ ] **Step 3: Commit.**

```bash
git add context/api_endpoints/payments.endpoints.md context/api_endpoints/users.endpoints.md
git commit -m "docs: entrance-collection + barcode-resolution endpoints"
```

---

### Task 7: Frontend types

**Files:**
- Modify: `frontend/lib/types.ts`

**Interfaces:**
- Produces: `Payment.method`, `Payment.collectedBy`, `Payment.collectedAtInstitute`, `Payment.collectedViaBarcode`; `ResolvedBarcodeStudent`.

- [ ] **Step 1: Extend the `Payment` interface.** Add `method` right after `status`, and the three new fields right after `note` (before `createdAt`):

```ts
export interface Payment {
  id: string;
  amount: string; // decimal as string
  status: PaymentStatus;
  method: PaymentMethod;
  payhereId?: string | null;
  paymentMonth: string; // "YYYY-MM"
  note?: string | null;
  collectedBy?: { id: string; name: string } | null;
  collectedAtInstitute?: { id: string; name: string; code: string } | null;
  collectedViaBarcode?: string | null;
  createdAt: string;
  updatedAt: string;
  enrollment: {
    id: string;
    classType: EnrollmentMode;
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
      indexNumber: number;
      phone?: string | null;
      address?: string | null;
      city?: string | null;
    };
    course: { id: string; name: string; year: number; monthlyFee: string };
  };
}
```

- [ ] **Step 2: Add the barcode-resolution result type.** Add near `AvatarUploadUrlResult`:

```ts
/** GET /users/resolve-barcode?code= result (see users.endpoints.md). */
export interface ResolvedBarcodeStudent {
  user: { id: string; name: string; indexNumber: number };
  instituteId: string | null;
  matchedBarcode: string;
}
```

- [ ] **Step 3: Typecheck.**

Run: `cd frontend && npx tsc --noEmit`
Expected: FAIL initially if `AdminPayments.tsx`/`StudentPayments.tsx` construct a `Payment` object anywhere without the new required `method` field in a way TS can't infer — in practice these components only *read* `Payment` fields (never construct one), so this should PASS. If it fails, the error will point at the exact non-conforming literal; fix it there.

- [ ] **Step 4: Commit.**

```bash
git add frontend/lib/types.ts
git commit -m "feat(payments): frontend types for method/collectedBy/institute/barcode + resolve-barcode result"
```

---

### Task 8: `QrCamera.tsx` relocation

**Files:**
- Move: `frontend/app/(app)/attendance/_components/QrCamera.tsx` → `frontend/components/custom/QrCamera.tsx`
- Modify: `frontend/app/(app)/attendance/_components/StaffScanner.tsx`
- Modify: `frontend/app/(app)/attendance/_components/StaffScanner.test.tsx`

- [ ] **Step 1: Move the file.**

```bash
git mv frontend/app/\(app\)/attendance/_components/QrCamera.tsx frontend/components/custom/QrCamera.tsx
```

No content changes — the file has no attendance-specific logic (confirmed: only `getUserMedia`/zxing).

- [ ] **Step 2: Update `StaffScanner.tsx`'s import.** Change:

```tsx
import { QrCamera } from "./QrCamera";
```

to:

```tsx
import { QrCamera } from "@/components/custom/QrCamera";
```

- [ ] **Step 3: Update the test's mock path.** In `StaffScanner.test.tsx`, change:

```ts
vi.mock("./QrCamera", () => ({ QrCamera: () => null }));
```

to:

```ts
vi.mock("@/components/custom/QrCamera", () => ({ QrCamera: () => null }));
```

- [ ] **Step 4: Run the attendance tests to confirm the move didn't break anything.**

Run: `cd frontend && npm run test -- StaffScanner`
Expected: PASS (all existing StaffScanner cases).

- [ ] **Step 5: Typecheck.**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add -A
git commit -m "refactor(frontend): move QrCamera to components/custom for reuse by payments"
```

---

### Task 9: `CollectPayment.tsx`

**Files:**
- Create: `frontend/app/(app)/payments/_components/CollectPayment.tsx`

**Interfaces:**
- Consumes: `api` (`get`/`post`), `QrCamera` (Task 8), `currentPaymentMonth` (`@/lib/payhere`), `formatCurrency` (`@/lib/utils`), `User`/`Enrollment`/`Payment`/`ResolvedBarcodeStudent`/`ApiList`/`ApiSuccess` (`@/lib/types`).
- Produces: `export function CollectPayment()` — no props, self-contained (mounted inside `AdminPayments.tsx` in Task 11).

- [ ] **Step 1: Write the component.**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, CameraOff, Loader2, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCamera } from "@/components/custom/QrCamera";
import { api, ApiError } from "@/lib/api";
import { currentPaymentMonth } from "@/lib/payhere";
import { formatCurrency } from "@/lib/utils";
import type { ApiList, ApiSuccess, Enrollment, Payment, ResolvedBarcodeStudent, User } from "@/lib/types";

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

type SelectedStudent = { id: string; name: string; indexNumber: number };

function monthsFrom(startMonth: string, endMonth: string): string[] {
  const [sy, sm] = startMonth.split("-").map(Number) as [number, number];
  const [ey, em] = endMonth.split("-").map(Number) as [number, number];
  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function CollectPayment() {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [student, setStudent] = useState<SelectedStudent | null>(null);
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [matchedBarcode, setMatchedBarcode] = useState<string | null>(null);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollmentId, setEnrollmentId] = useState("");

  const [history, setHistory] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  const [session, setSession] = useState<Payment[]>([]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<ApiList<User>>(`/users?search=${encodeURIComponent(term)}&role=STUDENT&limit=8`)
        .then((r) => setSearchResults(r.data))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const selectStudent = (
    s: SelectedStudent,
    resolvedInstituteId: string | null,
    resolvedBarcode: string | null,
  ): void => {
    setStudent(s);
    setInstituteId(resolvedInstituteId);
    setMatchedBarcode(resolvedBarcode);
    setSearchTerm("");
    setSearchResults([]);
    setScanError(null);
    setEnrollmentId("");
    setEnrollments([]);
    setHistory([]);
    setSubmitError(null);
    setLastReceiptId(null);

    api
      .get<ApiList<Enrollment>>(`/enrollments?userId=${s.id}&isActive=true&limit=50`)
      .then((r) => setEnrollments(r.data))
      .catch(() => setEnrollments([]));
  };

  const onDecode = (text: string): void => {
    setScanError(null);
    api
      .get<ApiSuccess<ResolvedBarcodeStudent>>(`/users/resolve-barcode?code=${encodeURIComponent(text)}`)
      .then((r) => selectStudent(r.data.user, r.data.instituteId, r.data.matchedBarcode))
      .catch((e) => setScanError(e instanceof ApiError ? e.message : "Couldn't resolve that code."));
  };

  const selectedEnrollment = useMemo(
    () => enrollments.find((e) => e.id === enrollmentId) ?? null,
    [enrollments, enrollmentId],
  );

  const outstandingMonths = useMemo(() => {
    if (!selectedEnrollment) return [];
    const paid = new Set(history.filter((p) => p.status === "SUCCESS").map((p) => p.paymentMonth));
    const start = selectedEnrollment.createdAt.slice(0, 7);
    const end = currentPaymentMonth();
    return monthsFrom(start, end).filter((m) => !paid.has(m));
  }, [selectedEnrollment, history]);

  const selectEnrollment = (id: string): void => {
    setEnrollmentId(id);
    setMonth("");
    setSubmitError(null);
    setHistoryLoading(true);
    api
      .get<ApiList<Payment>>(`/payments?enrollmentId=${id}&limit=12`)
      .then((r) => setHistory(r.data))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    if (outstandingMonths.length === 0) {
      setMonth("");
      return;
    }
    const current = currentPaymentMonth();
    setMonth(outstandingMonths.includes(current) ? current : outstandingMonths[0]!);
  }, [outstandingMonths]);

  useEffect(() => {
    if (selectedEnrollment && month) {
      setAmount(selectedEnrollment.course.monthlyFee);
    }
  }, [selectedEnrollment, month]);

  const submit = async (): Promise<void> => {
    if (!selectedEnrollment || !month) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post<ApiSuccess<Payment>>(
        "/payments/collect-entrance",
        {
          enrollmentId: selectedEnrollment.id,
          paymentMonth: month,
          amount: Number(amount),
          ...(instituteId ? { collectedAtInstituteId: instituteId } : {}),
          ...(matchedBarcode ? { collectedViaBarcode: matchedBarcode } : {}),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setLastReceiptId(res.data.id);
      setSession((prev) => [res.data, ...prev]);
      selectEnrollment(selectedEnrollment.id);
      router.refresh();
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Couldn't collect this payment. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const sessionTotal = session.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 print:border-none">
      <div className="print:hidden">
        <h2 className="text-sm font-semibold text-foreground">Collect payment</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Find a student by name/index or scan their barcode.
        </p>
      </div>

      <div className="print:hidden">
        {!student ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search student name or index…"
                  aria-label="Search student"
                  className={`${inputClass} w-full pl-9`}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  setCameraError(null);
                  setCameraOn((on) => !on);
                }}
                aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
              >
                {cameraOn ? (
                  <CameraOff className="size-4" aria-hidden />
                ) : (
                  <Camera className="size-4" aria-hidden />
                )}
              </Button>
            </div>

            {scanError && <p className="text-xs text-destructive">{scanError}</p>}

            {cameraOn && (
              <div>
                {cameraError ? (
                  <p className="text-sm text-destructive">{cameraError}</p>
                ) : (
                  <QrCamera
                    onDecode={onDecode}
                    onError={(m) => {
                      setCameraError(m);
                      setCameraOn(false);
                    }}
                  />
                )}
              </div>
            )}

            {searchTerm.trim().length >= 2 && searchResults.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {searchResults.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 bg-background p-2 text-sm">
                    <span>
                      {u.name} <span className="text-xs text-muted-foreground">#{u.indexNumber}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => selectStudent({ id: u.id, name: u.name, indexNumber: u.indexNumber }, null, null)}
                    >
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">{student.name}</p>
                <p className="text-xs text-muted-foreground">#{student.indexNumber}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStudent(null)}>
                Change
              </Button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Enrollment</span>
              <select
                value={enrollmentId}
                onChange={(e) => selectEnrollment(e.target.value)}
                aria-label="Select enrollment"
                className={`${inputClass} w-full`}
              >
                <option value="">
                  {enrollments.length === 0 ? "No active enrollments" : "Select a course…"}
                </option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.course.name} · {e.classType}
                  </option>
                ))}
              </select>
            </label>

            {enrollmentId && (
              <div className="space-y-3">
                {historyLoading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                ) : outstandingMonths.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing outstanding for this enrollment.</p>
                ) : (
                  <>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Month</span>
                      <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        aria-label="Select month to collect"
                        className={`${inputClass} w-full`}
                      >
                        {outstandingMonths.map((m) => (
                          <option key={m} value={m}>
                            {m}
                            {m === currentPaymentMonth() ? " (this month)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Amount</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        aria-label="Amount"
                        className={`${inputClass} w-full`}
                      />
                    </label>

                    <Button onClick={submit} disabled={submitting || !amount}>
                      {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                      Collect {amount ? formatCurrency(amount) : ""}
                    </Button>

                    {submitError && <p className="text-xs text-destructive">{submitError}</p>}

                    {lastReceiptId && (
                      <Link
                        href={`/payments/${lastReceiptId}`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        <Receipt className="size-3.5" aria-hidden />
                        Payment collected — view receipt
                      </Link>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {session.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Collected this session
            </h3>
            <Badge variant="outline" className="tabular-nums">
              {formatCurrency(String(sessionTotal))}
            </Badge>
          </div>
          <ul className="space-y-1 text-sm">
            {session.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="text-foreground">
                  {p.enrollment.user.name} · {p.paymentMonth}
                </span>
                <Link
                  href={`/payments/${p.id}`}
                  target="_blank"
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {formatCurrency(p.amount)}
                </Link>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
            Print session summary
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck.**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add "frontend/app/(app)/payments/_components/CollectPayment.tsx"
git commit -m "feat(payments): CollectPayment component (search/scan, outstanding months, session summary)"
```

---

### Task 10: `PaymentReceipt` component + `/payments/[id]` page

**Files:**
- Create: `frontend/app/(app)/payments/_components/PaymentReceipt.tsx`
- Create: `frontend/app/(app)/payments/[id]/page.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `Payment` (`@/lib/types`), `PaymentStatusBadge`, `formatCurrency`, `QRCodeSVG` (`qrcode.react`).
- Produces: `export function PaymentReceipt({ payment }: { payment: Payment })`; the `/payments/[id]` route.

- [ ] **Step 1: Read the Next 16 dynamic-route param convention.**

Run: `grep -rn "params: Promise" frontend/app/\(app\)/submissions/\[examId\]/page.tsx | head -5`
Expected: confirms `params` is a `Promise<{ ... }>` that must be `await`ed (Next 16, not older Next) — mirror it below.

- [ ] **Step 2: Write `PaymentReceipt.tsx`.**

```tsx
"use client";

import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { formatCurrency } from "@/lib/utils";
import type { Payment, PaymentMethod } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

const METHOD_LABELS: Record<PaymentMethod, string> = {
  ONLINE: "Online (PayHere)",
  ENTRANCE: "Cash at entrance",
  BULK: "Bulk upload",
  MANUAL: "Manual override",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}

export function PaymentReceipt({ payment }: { payment: Payment }) {
  const receiptUrl = typeof window !== "undefined" ? window.location.href : payment.id;

  return (
    <div className="mx-auto max-w-lg space-y-6 py-10 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold text-foreground">Payment receipt</h1>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          Print
        </Button>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 font-mono text-sm print:border-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-dashed border-border pb-4">
          <div>
            <p className="text-base font-semibold text-foreground">{payment.enrollment.user.name}</p>
            <p className="text-muted-foreground">#{payment.enrollment.user.indexNumber}</p>
          </div>
          <PaymentStatusBadge status={payment.status} />
        </div>

        <dl className="space-y-2">
          <Row label="Course">
            {payment.enrollment.course.name} · {payment.enrollment.course.year} · {payment.enrollment.classType}
          </Row>
          <Row label="Month">{payment.paymentMonth}</Row>
          <Row label="Amount">{formatCurrency(payment.amount)}</Row>
          <Row label="Method">{METHOD_LABELS[payment.method]}</Row>
          {payment.method !== "ONLINE" && payment.collectedBy && (
            <Row label="Collected by">{payment.collectedBy.name}</Row>
          )}
          {payment.collectedAtInstitute && (
            <Row label="Center">
              {payment.collectedAtInstitute.name} ({payment.collectedAtInstitute.code})
            </Row>
          )}
          {payment.collectedViaBarcode && <Row label="Barcode used">{payment.collectedViaBarcode}</Row>}
          {payment.method === "ONLINE" && payment.payhereId && <Row label="PayHere ref">{payment.payhereId}</Row>}
          <Row label="Date">{dateFmt.format(new Date(payment.createdAt))}</Row>
        </dl>

        <div className="flex flex-col items-center gap-2 border-t border-dashed border-border pt-4">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={receiptUrl} size={140} level="M" marginSize={0} />
          </div>
          <p className="text-xs tracking-widest text-muted-foreground">{payment.id}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `page.tsx`.**

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type { ApiSuccess, Payment } from "@/lib/types";
import { PaymentReceipt } from "../_components/PaymentReceipt";

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookie = (await cookies()).toString();

  let payment: Payment;
  try {
    payment = (await api.get<ApiSuccess<Payment>>(`/payments/${id}`, { cookie })).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/auth/login");
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {e instanceof ApiError ? e.message : "This receipt could not be found."}
        </p>
      </div>
    );
  }

  return <PaymentReceipt payment={payment} />;
}
```

- [ ] **Step 4: Typecheck + build.**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: PASS; `/payments/[id]` appears in the route manifest.

- [ ] **Step 5: Commit.**

```bash
git add "frontend/app/(app)/payments/_components/PaymentReceipt.tsx" "frontend/app/(app)/payments/[id]"
git commit -m "feat(payments): printable receipt page with QR (/payments/[id])"
```

---

### Task 11: Wire `CollectPayment` + receipt links into the existing payment views

**Files:**
- Modify: `frontend/app/(app)/payments/_components/AdminPayments.tsx`
- Modify: `frontend/app/(app)/payments/_components/StudentPayments.tsx`

- [ ] **Step 1: Add `CollectPayment` to `AdminPayments.tsx`.** Add the import:

```tsx
import { CollectPayment } from "./CollectPayment";
```

Then insert `<CollectPayment />` right before the `{/* Bulk upload */}` section's `<section>` tag:

```tsx
      {/* Collect at entrance */}
      <CollectPayment />

      {/* Bulk upload */}
      <section className="rounded-2xl border border-border bg-card p-4">
```

- [ ] **Step 2: Add a receipt link to `StudentPayments.tsx`.** Add the import:

```tsx
import Link from "next/link";
```

Add a "Receipt" column header in the history table's `<thead>`:

```tsx
                <tr>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Receipt</th>
                </tr>
```

And a matching cell in each row (right after the `PaymentStatusBadge` cell):

```tsx
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "SUCCESS" && (
                        <Link href={`/payments/${p.id}`} target="_blank" className="text-xs text-primary hover:underline">
                          View
                        </Link>
                      )}
                    </td>
```

- [ ] **Step 3: Typecheck + build.**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add "frontend/app/(app)/payments/_components/AdminPayments.tsx" "frontend/app/(app)/payments/_components/StudentPayments.tsx"
git commit -m "feat(payments): wire CollectPayment into /payments admin view + student receipt links"
```

---

### Task 12: Frontend tests

**Files:**
- Create: `frontend/app/(app)/payments/_components/CollectPayment.test.tsx`
- Create: `frontend/app/(app)/payments/_components/PaymentReceipt.test.tsx`

**Interfaces:**
- Consumes: the components from Tasks 9–10; mock `@/lib/api`, `next/navigation`, `@/components/custom/QrCamera` — mirror `StaffScanner.test.tsx`/`CredentialForms.test.tsx`.

- [ ] **Step 1: Write `CollectPayment.test.tsx`.**

```tsx
import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectPayment } from "./CollectPayment";
import { formatCurrency } from "@/lib/utils";
import type { Enrollment, Payment, ResolvedBarcodeStudent, User } from "@/lib/types";

const { get, post, push, refresh } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get, post, patch: vi.fn(), upload: vi.fn(), del: vi.fn() } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/components/custom/QrCamera", () => ({
  QrCamera: ({ onDecode }: { onDecode: (text: string) => void }) => {
    useEffect(() => onDecode("NUG-001"), [onDecode]);
    return null;
  },
}));

const student: User = {
  id: "u1",
  name: "Nimal Perera",
  email: "n@x.lk",
  role: "STUDENT",
  indexNumber: 42,
  createdAt: "",
};

const enrollment: Enrollment = {
  id: "e1",
  classType: "PHYSICAL",
  isActive: true,
  userId: "u1",
  courseId: "c1",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "",
  course: {
    id: "c1",
    name: "Physics",
    year: 2026,
    monthlyFee: "2500.00",
    isActive: true,
    subjectId: "s1",
    teacherId: "t1",
  },
};

const paymentFixture = (overrides: Partial<Payment> = {}): Payment => ({
  id: "p1",
  amount: "2500.00",
  status: "SUCCESS",
  method: "ENTRANCE",
  paymentMonth: "2026-07",
  createdAt: "",
  updatedAt: "",
  enrollment: {
    id: "e1",
    classType: "PHYSICAL",
    userId: "u1",
    user: { id: "u1", name: "Nimal Perera", email: "n@x.lk", indexNumber: 42 },
    course: { id: "c1", name: "Physics", year: 2026, monthlyFee: "2500.00" },
  },
  ...overrides,
});

function mockGet(paymentsHistory: Payment[] = []) {
  get.mockReset().mockImplementation((path: string) => {
    if (path.startsWith("/users?search=")) return Promise.resolve({ data: [student], count: 1 });
    if (path.startsWith("/enrollments?userId=")) return Promise.resolve({ data: [enrollment], count: 1 });
    if (path.startsWith("/payments?enrollmentId=")) return Promise.resolve({ data: paymentsHistory, count: paymentsHistory.length });
    if (path.startsWith("/users/resolve-barcode")) {
      const resolved: ResolvedBarcodeStudent = {
        user: { id: "u1", name: "Nimal Perera", indexNumber: 42 },
        instituteId: "inst-1",
        matchedBarcode: "NUG-001",
      };
      return Promise.resolve({ data: resolved });
    }
    return Promise.resolve({ data: [], count: 0 });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T00:00:00.000Z"));
  mockGet();
  post.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function selectStudentByName(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Search student"), "Nimal");
  const selectBtn = await screen.findByRole("button", { name: "Select" });
  await user.click(selectBtn);
}

describe("CollectPayment — search → select → collect", () => {
  it("collects the current outstanding month with the pre-filled amount", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null });
    render(<CollectPayment />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    const amountInput = await screen.findByLabelText<HTMLInputElement>("Amount");
    expect(amountInput.value).toBe("2500.00");

    await user.click(screen.getByRole("button", { name: /Collect/ }));

    expect(post).toHaveBeenCalledWith(
      "/payments/collect-entrance",
      { enrollmentId: "e1", paymentMonth: "2026-07", amount: 2500 },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(await screen.findByText("Payment collected — view receipt")).toBeInTheDocument();
  });

  it("lets staff edit the pre-filled amount before submitting", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture({ amount: "1000.00" }) });
    const user = userEvent.setup({ delay: null });
    render(<CollectPayment />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    const amountInput = await screen.findByLabelText("Amount");
    await user.clear(amountInput);
    await user.type(amountInput, "1000");
    await user.click(screen.getByRole("button", { name: /Collect/ }));

    expect(post).toHaveBeenCalledWith(
      "/payments/collect-entrance",
      expect.objectContaining({ amount: 1000 }),
      expect.anything(),
    );
  });
});

describe("CollectPayment — barcode scan resolution", () => {
  it("captures institute + barcode from a scan and includes them in the submit body", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null });
    render(<CollectPayment />);

    await user.click(screen.getByLabelText("Turn camera on"));
    await screen.findByText("Nimal Perera");

    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    await user.click(screen.getByRole("button", { name: /Collect/ }));

    expect(post).toHaveBeenCalledWith(
      "/payments/collect-entrance",
      {
        enrollmentId: "e1",
        paymentMonth: "2026-07",
        amount: 2500,
        collectedAtInstituteId: "inst-1",
        collectedViaBarcode: "NUG-001",
      },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });
});

describe("CollectPayment — already-paid months are excluded", () => {
  it("does not offer a month that already has a SUCCESS payment", async () => {
    mockGet([paymentFixture({ paymentMonth: "2026-07", method: "ONLINE", payhereId: "pay_1" })]);
    const user = userEvent.setup({ delay: null });
    render(<CollectPayment />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");

    await screen.findByLabelText("Select month to collect");
    expect(screen.queryByRole("option", { name: /2026-07/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /2026-06/ })).toBeInTheDocument();
  });
});

describe("CollectPayment — session summary", () => {
  it("accumulates each successful collection into the session list with a running total", async () => {
    post
      .mockResolvedValueOnce({ data: paymentFixture({ id: "p1" }) })
      .mockResolvedValueOnce({ data: paymentFixture({ id: "p2", paymentMonth: "2026-06" }) });
    const user = userEvent.setup({ delay: null });
    render(<CollectPayment />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    await user.click(screen.getByRole("button", { name: /Collect/ }));
    await screen.findByText("Payment collected — view receipt");

    await user.selectOptions(screen.getByLabelText("Select month to collect"), "2026-06");
    await user.click(screen.getByRole("button", { name: /Collect/ }));

    await screen.findByText("Collected this session");
    const list = screen.getByText("Collected this session").closest("div")!.parentElement!;
    expect(within(list).getAllByText(/Nimal Perera/)).toHaveLength(2);
    expect(within(list).getByText(formatCurrency(5000))).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write `PaymentReceipt.test.tsx`.**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentReceipt } from "./PaymentReceipt";
import type { Payment } from "@/lib/types";

const base: Payment = {
  id: "pay-123",
  amount: "2500.00",
  status: "SUCCESS",
  method: "ONLINE",
  payhereId: "payhere_abc",
  paymentMonth: "2026-07",
  createdAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "",
  enrollment: {
    id: "e1",
    classType: "PHYSICAL",
    userId: "u1",
    user: { id: "u1", name: "Nimal Perera", email: "n@x.lk", indexNumber: 42 },
    course: { id: "c1", name: "Physics", year: 2026, monthlyFee: "2500.00" },
  },
};

describe("PaymentReceipt", () => {
  it("shows the PayHere reference for an ONLINE payment, no collected-by/institute", () => {
    render(<PaymentReceipt payment={base} />);
    expect(screen.getByText("payhere_abc")).toBeInTheDocument();
    expect(screen.queryByText("Collected by")).not.toBeInTheDocument();
    expect(screen.queryByText("Center")).not.toBeInTheDocument();
  });

  it("shows collected-by, institute, and barcode for an ENTRANCE payment", () => {
    const entrance: Payment = {
      ...base,
      method: "ENTRANCE",
      payhereId: null,
      collectedBy: { id: "staff-1", name: "Front Desk" },
      collectedAtInstitute: { id: "inst-1", name: "Nugegoda Center", code: "NUG" },
      collectedViaBarcode: "NUG-001",
    };
    render(<PaymentReceipt payment={entrance} />);
    expect(screen.getByText("Front Desk")).toBeInTheDocument();
    expect(screen.getByText(/Nugegoda Center/)).toBeInTheDocument();
    expect(screen.getByText("NUG-001")).toBeInTheDocument();
    expect(screen.queryByText("payhere_abc")).not.toBeInTheDocument();
  });

  it("renders the receipt reference under the QR", () => {
    render(<PaymentReceipt payment={base} />);
    expect(screen.getByText("pay-123")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the frontend tests.**

Run: `cd frontend && npm run test`
Expected: PASS (all existing 61 + the 8 new cases here — 6 `CollectPayment` + 3 `PaymentReceipt`... verify the exact count in the summary line, not a hardcoded number).

- [ ] **Step 4: Commit.**

```bash
git add "frontend/app/(app)/payments/_components/CollectPayment.test.tsx" "frontend/app/(app)/payments/_components/PaymentReceipt.test.tsx"
git commit -m "test(payments): CollectPayment + PaymentReceipt RTL tests"
```

---

### Task 13: Live-stack verification + headless smoke

**Files:** none (verification only).

- [ ] **Step 1: Rebuild + bring up the stack.**

Run: `docker compose build backend frontend && docker compose up -d`
Expected: containers healthy. Per this repo's actual DB-sync mechanism (see Global Constraints), the entrypoint's `prisma db push` picks up the two new nullable `Payment` columns automatically on backend start — confirm via `docker compose logs backend --tail 20` showing `Running prisma db push...` then either `already in sync` or a successful apply. Do **not** run `prisma migrate deploy`/`migrate dev` here.

- [ ] **Step 2: API smoke (as a logged-in ADMIN or SUPER_ADMIN, via cookies), against a real enrollment + student:**
  - `GET /api/users/resolve-barcode?code=<a real StudentBarcode>` → 200 with the right `instituteId`; `code=<the student's global User.barcode>` → 200 with `instituteId: null`; `code=garbage` → 404 `BARCODE_NOT_FOUND`.
  - `POST /api/payments/collect-entrance { enrollmentId, paymentMonth }` (current month, no existing payment) → 200, `Payment.method === "ENTRANCE"`, `collectedById` set; repeat with a fresh `Idempotency-Key` for a month that already has a `SUCCESS`/`payhereId` PayHere payment → 409 `ALREADY_PAID_ONLINE`; repeat with `collectedAtInstituteId`/`collectedViaBarcode` from Step 1's scan resolution → confirm both persisted on the row.
  - `PATCH /api/payments/:id/override` on any payment → confirm the response now has `method: "MANUAL"` and `collectedBy` populated with the acting admin.
  - `POST /api/payments/bulk-upload` with a small test `.xlsx` → confirm the resulting `Payment` row(s) have `method: "BULK"`.
  - `GET /api/payments/:id` → confirm the response includes `method`, `collectedBy`, `collectedAtInstitute`, `collectedViaBarcode` (verifies the `paymentSelect` fix reaches every read path, not just `collect-entrance`'s own response).

- [ ] **Step 3: Headless UI drive** (Playwright-core against the cached Chromium, `waitUntil: "domcontentloaded"`, mirroring the driver script used for the profile feature's verification): log in as an admin → `/payments` → use the "Collect payment" card to search a student by name, select an enrollment, collect the current month → assert the "view receipt" link appears → click it (or navigate directly) → assert `/payments/[id]` renders the QR + all fields, including collected-by/institute when present → go back, use the camera-scan path (mock/QR test code) if a scan target is available in the dev environment, otherwise verify the resolve-barcode call shape via the network tab → print-preview the receipt page. Capture a screenshot of the receipt page.

- [ ] **Step 4: Final gate — run both suites once more.**

Run: `cd backend && npm run test && cd ../frontend && npm run test`
Expected: PASS. (Lint is intentionally not gating — backend has no eslint flat config; see CLAUDE.md.)

- [ ] **Step 5: Update the spec's status + open the PR** into `dev` once unit + system + smoke all pass (per the test-gate rule). Do not delete the branch after merge.

---

## Self-Review

**Spec coverage:**
- Entrance collection endpoint, upsert semantics, month scope, amount default, idempotency → Tasks 2, 5. ✅
- `overridePayment`/`bulkUploadPayments` `method`/`collectedById` sibling fix, `paymentSelect` fix → Task 3. ✅
- Barcode resolution (`StudentBarcode`-then-global, ambiguous-falls-through) → Task 4. ✅
- Schema: `collectedAtInstituteId`/`collectedAtInstitute`/`collectedViaBarcode`, `Institute.payments` → Task 1. ✅
- Receipt page + QR/reference (reusing existing `GET /payments/:id` auth, no public surface) → Task 10. ✅
- Batch/session receipt (client-side only) → Task 9 (`CollectPayment`'s session list + print). ✅
- `QrCamera` promotion for reuse → Task 8. ✅
- Frontend types, wiring into `AdminPayments`/`StudentPayments` → Tasks 7, 11. ✅
- Docs → Task 6. ✅
- Tests (backend Vitest ×3 files, frontend RTL ×2 files, live + headless) → Tasks 3–5, 12, 13. ✅
- Out-of-scope items (emailed receipts, batch API, outstanding-months backend endpoint, `/override` UI) — correctly not built anywhere in this plan. ✅

**Placeholder scan:** No "TBD"/"handle edge cases" left; every code step shows complete, real code (full component bodies, full service functions, full test files) rather than "mirror X" prose — this plan intentionally goes further than the profile plan's Task 9 did, since `CollectPayment`'s outstanding-month/scan-resolution logic is genuinely new, not a mirror of an existing form.

**Type consistency:** `collectEntrancePayment(collectedById, input)` name/signature matches between Task 5's definition and its controller call site; `resolveStudentByBarcode(code)` matches between Task 4's definition, controller, and the `ResolvedBarcodeStudent` shape used in Task 9's frontend; `PaymentSummary`'s new fields (`method`, `collectedBy`, `collectedAtInstitute`, `collectedViaBarcode`) match `paymentSelect`'s shape (Task 3) and the frontend `Payment` type (Task 7) and `PaymentReceipt`'s usage (Task 10) field-for-field; `CollectEntrancePaymentInput`'s optional `collectedAtInstituteId`/`collectedViaBarcode` match what `CollectPayment.tsx` conditionally sends.

**Open follow-up baked in:** none required — the plan is self-contained. The pre-existing, separate gap (entrance *attendance* scanner never checking `StudentBarcode`) is explicitly called out as out-of-scope in the spec and not touched here.
