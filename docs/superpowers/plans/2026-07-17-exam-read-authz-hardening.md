# Exam-read Authorization Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a P0 security hole where any `MARKER` or front-desk `ADMIN` can read any exam's
paper PDF + full MCQ answer key (`exam.routes.ts` `GET /` and `GET /:id` have no `requireRole`, and
the service gates fall through for those roles).

**Architecture:** Default-deny at two independent layers (route allowlist + a service-level role
guard), reusing the codebase's existing gate patterns. The marker-assignment check is extracted from
`submission.service.ts` into a shared `assertMarkerAssignedToExam` in `access.service.ts` (the authz
module) so it lives in one place and both services use it.

**Tech Stack:** Express + Prisma (Postgres) + Vitest (backend only — no frontend, no schema change).

## Global Constraints

- Three-tier: `routes` → `controllers` (zero Prisma imports) → `services` (only layer importing
  `@/config/database`'s `prisma`). This plan touches `routes/` (one-line `requireRole` additions) and
  `services/` only.
- Known failures throw `AppError(code, statusCode, message)` from `@/utils/app-error`. `FORBIDDEN`
  (403) and `MARKER_NOT_ASSIGNED` (403) are existing codes — do not invent new ones.
- Every behavioral change is backed by a Vitest unit test (§3.4) plus the live-stack smoke in Task 4.
- Backend tests mock `@/config/database`'s `prisma` and any service the code under test calls.
  **`submission.service.ts` imports `@/services/stream.service` and `@/services/notification.service`
  — both must stay mocked in its existing test file (they already are); do not remove those mocks.**
  `access.service.ts` imports only `@prisma/client`, `@/config/database`, `@/utils/app-error`, and a
  type — so its new test only needs to mock `@/config/database` (no redis/bullmq risk).
- **Indentation is per-file:** `exam.service.ts` and `exam.routes.ts` use **tabs**;
  `access.service.ts` and `submission.service.ts` use **2 spaces**. **Every `.test.ts` file uses
  tabs**, regardless of its service file's own style. Copy the exact whitespace from the blocks below.
- `noUncheckedIndexedAccess` is on — index access needs `?.`/`!`.
- Conventional Commits; branch is `fix/exam-read-authz-hardening` (already off `dev`, spec committed).
- Per-role read contract this plan must produce (from the spec):
  `SUPER_ADMIN` full · `TEACHER` own-courses+full · `MARKER` assigned-only + paper yes + **MCQ
  answers stripped** · `STUDENT` enrolled + time-gated + stripped (unchanged) · `ADMIN` **403**.

---

### Task 1: Extract the shared marker-assignment gate into `access.service.ts`

**Files:**
- Modify: `backend/src/services/access.service.ts` (add `assertMarkerAssignedToExam`)
- Create: `backend/src/services/access.service.test.ts`
- Modify: `backend/src/services/submission.service.ts` (import it; swap both call sites at ~408 and
  ~526; delete the private `ensureMarkerAssigned` at ~176)

**Interfaces:**
- Produces: `assertMarkerAssignedToExam(markerId: string, examId: string): Promise<void>` — resolves
  if a `MarkerAssignment` row exists for `(markerId, examId)`, else throws
  `AppError('MARKER_NOT_ASSIGNED', 403, …)`. Consumed by Task 2 (`exam.service`) and by
  `submission.service` here.

- [ ] **Step 1: Write the failing test.** Create `backend/src/services/access.service.test.ts`
(tabs):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { markerAssignmentFindUnique } = vi.hoisted(() => ({
	markerAssignmentFindUnique: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		markerAssignment: { findUnique: markerAssignmentFindUnique },
	},
}));

import { assertMarkerAssignedToExam } from './access.service';

beforeEach(() => {
	markerAssignmentFindUnique.mockReset();
});

describe('assertMarkerAssignedToExam', () => {
	it('resolves when the marker is assigned to the exam', async () => {
		markerAssignmentFindUnique.mockResolvedValueOnce({ markerId: 'm1', examId: 'e1' });

		await expect(assertMarkerAssignedToExam('m1', 'e1')).resolves.toBeUndefined();
		expect(markerAssignmentFindUnique).toHaveBeenCalledWith({
			where: { markerId_examId: { markerId: 'm1', examId: 'e1' } },
		});
	});

	it('throws 403 MARKER_NOT_ASSIGNED when there is no assignment', async () => {
		markerAssignmentFindUnique.mockResolvedValueOnce(null);

		await expect(assertMarkerAssignedToExam('m1', 'e1')).rejects.toMatchObject({
			code: 'MARKER_NOT_ASSIGNED',
			statusCode: 403,
		});
	});
});
```

- [ ] **Step 2: Run it to confirm it fails (export not found).**

Run: `cd backend && npm run test -- access.service`
Expected: FAIL — `assertMarkerAssignedToExam` is not exported yet.

- [ ] **Step 3: Add the function to `access.service.ts`.** Append at the end of the file (2-space
indent):

```ts

/**
 * Authorization gate: a MARKER may only act on an exam they are assigned to
 * (grade its submissions, read its detail). Extracted here — the authz-gate
 * module — so submission.service and exam.service share one definition instead
 * of each carrying its own copy. Throws 403 MARKER_NOT_ASSIGNED if unassigned.
 */
export const assertMarkerAssignedToExam = async (
  markerId: string,
  examId: string,
): Promise<void> => {
  const assignment = await prisma.markerAssignment.findUnique({
    where: { markerId_examId: { markerId, examId } },
  });
  if (!assignment) {
    throw new AppError('MARKER_NOT_ASSIGNED', 403, 'You are not assigned to mark this exam.');
  }
};
```

Also update the file's top comment (lines 5-6) so it no longer implies MARKER purely "bypasses" —
change:

```ts
// Privileged roles (SUPER_ADMIN, TEACHER, ADMIN, MARKER) bypass — they manage
// or oversee content. Only STUDENT access is gated on enrollment (+ payment).
```

to:

```ts
// assertStudentContentAccess gates STUDENT on enrollment (+ payment); privileged
// roles bypass it. This module also hosts assertMarkerAssignedToExam — the gate
// that scopes a MARKER to the exams they are actually assigned to.
```

- [ ] **Step 4: Run the test to green.**

Run: `cd backend && npm run test -- access.service`
Expected: PASS (both cases).

- [ ] **Step 5: Point `submission.service.ts` at the shared gate.** Add an import right after the
existing `import { assertCourseAccess } from '@/services/class.service';` (line 8):

```ts
import { assertMarkerAssignedToExam } from '@/services/access.service';
```

Delete the private helper (the whole `const ensureMarkerAssigned = async (markerId: string, examId:
string): Promise<void> => { … };` block, ~lines 174-186):

```ts
const ensureMarkerAssigned = async (markerId: string, examId: string): Promise<void> => {
  const assignment = await prisma.markerAssignment.findUnique({
    where: { markerId_examId: { markerId, examId } },
  });

  if (!assignment) {
    throw new AppError(
      'MARKER_NOT_ASSIGNED',
      403,
      'You are not assigned to mark this exam.',
    );
  }
};
```

Then update both call sites — in `listSubmissions` (~line 408):

```ts
  // was: await ensureMarkerAssigned(actor.userId, examId);
  await assertMarkerAssignedToExam(actor.userId, examId);
```

and in the grading path (~line 526):

```ts
  // was: await ensureMarkerAssigned(markerId, submission.exam.id);
  await assertMarkerAssignedToExam(markerId, submission.exam.id);
```

- [ ] **Step 6: Verify `submission.service` tests still pass unchanged.** The existing
`submission.service.test.ts` mocks `prisma.markerAssignment.findUnique` (which the shared gate calls)
and does **not** mock `@/services/access.service`, so the real shared gate runs against that mock —
no test edit needed, but confirm it:

Run: `cd backend && npm run test -- submission.service`
Expected: PASS (all existing cases, including the MARKER_NOT_ASSIGNED one).

- [ ] **Step 7: Typecheck + full backend test run.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS (all suites).

- [ ] **Step 8: Commit.**

```bash
git add backend/src/services/access.service.ts backend/src/services/access.service.test.ts backend/src/services/submission.service.ts
git commit -m "refactor(access): extract shared assertMarkerAssignedToExam into access.service"
```

---

### Task 2: Close the exam-read hole (route allowlist + service default-deny)

**Files:**
- Modify: `backend/src/routes/exam.routes.ts` (`GET /` and `GET /:id`)
- Modify: `backend/src/services/exam.service.ts` (imports; `EXAM_READER_ROLES`; `listExams`;
  `getExamById`)
- Modify: `backend/src/services/exam.service.test.ts`

**Interfaces:**
- Consumes: `assertMarkerAssignedToExam` (Task 1).
- Produces: no signature changes to `listExams`/`getExamById`.

- [ ] **Step 1: Write the failing tests.** In `exam.service.test.ts`, first extend the mock header so
`assertMarkerAssignedToExam` is mocked at the `access.service` boundary. Replace the `vi.hoisted`
block and the `access.service` mock line with:

```ts
const {
	examFindMany,
	examFindUnique,
	assertStudentContentAccess,
	assertMarkerAssignedToExam,
	assertCourseAccess,
	createR2PresignedGetUrl,
} = vi.hoisted(() => ({
	examFindMany: vi.fn(),
	examFindUnique: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	assertMarkerAssignedToExam: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
	createR2PresignedGetUrl: vi.fn().mockResolvedValue('https://signed.example/paper.pdf'),
}));
```

and:

```ts
vi.mock('@/services/access.service', () => ({ assertStudentContentAccess, assertMarkerAssignedToExam }));
```

No `beforeEach` change is needed — the file's `beforeEach` already calls `vi.clearAllMocks()`, which
resets the new `assertMarkerAssignedToExam` mock too (each test sets its own
`mockResolvedValueOnce`/`mockRejectedValueOnce`). Then append two new describe blocks at the end of
the file:

```ts

describe('listExams — MARKER + ADMIN authorization', () => {
	it("scopes the query to the marker's assigned exams", async () => {
		examFindMany.mockResolvedValueOnce([]);

		await listExams({ status: 'all' }, { userId: 'm1', role: Role.MARKER });

		const call = examFindMany.mock.calls[0]![0];
		expect(call.where.markerAssignments).toEqual({ some: { markerId: 'm1' } });
	});

	it('denies front-desk ADMIN with 403 FORBIDDEN, never querying', async () => {
		await expect(
			listExams({ status: 'all' }, { userId: 'a1', role: Role.ADMIN }),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(examFindMany).not.toHaveBeenCalled();
	});
});

describe('getExamById — MARKER + ADMIN authorization', () => {
	const mcqExamRow = {
		...examRow,
		paperPdfUrl: 'exam-papers/exam-1/paper.pdf',
		mcqPayload: {
			questions: [
				{
					id: 'q1',
					text: 'Q1',
					order: 1,
					marks: 2,
					options: [
						{ id: 'o1', text: 'A', isCorrect: true },
						{ id: 'o2', text: 'B', isCorrect: false },
					],
				},
			],
		},
	};

	it('lets an assigned MARKER read the exam but strips the MCQ answer key', async () => {
		examFindUnique.mockResolvedValueOnce(mcqExamRow);
		assertMarkerAssignedToExam.mockResolvedValueOnce(undefined);

		const result = await getExamById('exam-1', { userId: 'm1', role: Role.MARKER });

		expect(assertMarkerAssignedToExam).toHaveBeenCalledWith('m1', 'exam-1');
		const opts = (result.mcqPayload as { questions: { options: Record<string, unknown>[] }[] }).questions[0]!.options;
		expect(opts[0]).not.toHaveProperty('isCorrect');
		expect(result.paperPdfUrl).toBe('https://signed.example/paper.pdf'); // marker still gets the paper
	});

	it('rejects a MARKER not assigned to the exam with 403 MARKER_NOT_ASSIGNED', async () => {
		examFindUnique.mockResolvedValueOnce(mcqExamRow);
		assertMarkerAssignedToExam.mockRejectedValueOnce(
			new AppError('MARKER_NOT_ASSIGNED', 403, 'You are not assigned to mark this exam.'),
		);

		await expect(
			getExamById('exam-1', { userId: 'm2', role: Role.MARKER }),
		).rejects.toMatchObject({ code: 'MARKER_NOT_ASSIGNED', statusCode: 403 });
	});

	it('denies front-desk ADMIN with 403 FORBIDDEN before fetching the exam', async () => {
		await expect(
			getExamById('exam-1', { userId: 'a1', role: Role.ADMIN }),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(examFindUnique).not.toHaveBeenCalled();
	});

	it('SUPER_ADMIN still gets the full MCQ payload with answers', async () => {
		examFindUnique.mockResolvedValueOnce(mcqExamRow);

		const result = await getExamById('exam-1', superAdmin);

		const opts = (result.mcqPayload as { questions: { options: Record<string, unknown>[] }[] }).questions[0]!.options;
		expect(opts[0]).toHaveProperty('isCorrect', true);
	});
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd backend && npm run test -- exam.service`
Expected: FAIL — no `markerAssignments` branch in `listExams`; no ADMIN guard; MARKER not stripped in
`getExamById`.

- [ ] **Step 3: Add the `EXAM_READER_ROLES` constant + imports to `exam.service.ts`.** Change the
access-service import (line 6) from:

```ts
import { assertStudentContentAccess } from '@/services/access.service';
```

to:

```ts
import { assertStudentContentAccess, assertMarkerAssignedToExam } from '@/services/access.service';
```

Then add a module-level constant just above `export const listExams` (tabs):

```ts
// Roles permitted to read exams at all. Front-desk ADMIN is intentionally
// excluded (non-academic role). A service-level default-deny so the check does
// not depend solely on the route's requireRole (13-system-assessment §4.1).
const EXAM_READER_ROLES: ReadonlySet<Role> = new Set([
	Role.SUPER_ADMIN,
	Role.TEACHER,
	Role.MARKER,
	Role.STUDENT,
]);
```

- [ ] **Step 4: Guard + scope `listExams`.** Add the guard right after `const role = actor.role;`
and add the MARKER branch to the `where`:

```ts
	const role = actor.role;
	if (!EXAM_READER_ROLES.has(role)) {
		throw new AppError('FORBIDDEN', 403, 'You do not have access to exam content.');
	}
	const now = new Date();
```

and inside the `where` object, right after the existing TEACHER branch:

```ts
		// Teachers only see exams for courses they teach — a list filter, not a
		// throw, mirroring the STUDENT scoping directly above.
		...(role === Role.TEACHER ? { course: { teacherId: actor.userId } } : {}),
		// Markers only see exams they are assigned to.
		...(role === Role.MARKER
			? { markerAssignments: { some: { markerId: actor.userId } } }
			: {}),
		...timeFilter,
```

- [ ] **Step 5: Guard `getExamById` + assert marker assignment + strip MCQ for markers.** Add the
guard at the very top (before `ensureExamExists`, so ADMIN is denied without a DB fetch):

```ts
	const role = actor.role;
	if (!EXAM_READER_ROLES.has(role)) {
		throw new AppError('FORBIDDEN', 403, 'You do not have access to exam content.');
	}
	const exam = await ensureExamExists(examId);
```

Add the marker-assignment assertion right after the `deletedAt` guard:

```ts
	if (exam.deletedAt && role !== Role.SUPER_ADMIN) {
		throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
	}

	// Markers may only read exams they are assigned to.
	if (role === Role.MARKER) {
		await assertMarkerAssignedToExam(actor.userId, examId);
	}

	// Teachers may only read exams for courses they teach.
	await assertCourseAccess(exam.courseId, actor);
```

And strip MCQ answers for markers too — change the payload branch:

```ts
		if (role === Role.STUDENT && !isWithinWindow) {
			mcqPayload = null;
		} else {
			mcqPayload = (role === Role.STUDENT || role === Role.MARKER)
				? stripMcqAnswers(parsed)
				: parsed;
		}
```

(The paper PDF already reaches markers: `allowPaper = role !== Role.STUDENT || isWithinWindow` is
`true` for a marker. No change to `allowPaper`.)

- [ ] **Step 6: Add `requireRole` to the two read routes.** In `exam.routes.ts`, `GET /`:

```ts
examRoutes.get(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT),
	validateQuery(listExamsQuerySchema),
	ExamController.listExams,
);
```

and `GET /:id`:

```ts
examRoutes.get(
	'/:id',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT),
	validateParams(examIdParamSchema),
	ExamController.getExamById,
);
```

(`requireRole` and `Role` are already imported in this file — used by the other exam routes.)

- [ ] **Step 7: Run the exam tests to green.**

Run: `cd backend && npm run test -- exam.service`
Expected: PASS (existing teacher-scoping cases + the 6 new MARKER/ADMIN cases).

- [ ] **Step 8: Typecheck + full backend test run.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS (all suites).

- [ ] **Step 9: Commit.**

```bash
git add backend/src/routes/exam.routes.ts backend/src/services/exam.service.ts backend/src/services/exam.service.test.ts
git commit -m "fix(exams): close exam-read authz hole — deny ADMIN, scope MARKER to assigned + strip answers"
```

---

### Task 3: Endpoint docs

**Files:**
- Modify: `context/api_endpoints/exams.endpoints.md`

- [ ] **Step 1: Document the per-role read contract.** In `exams.endpoints.md`, in the `### GET `/``
section, replace the intro line describing who sees what with (keeping the surrounding query-param
and response docs):

```markdown
List exams, scoped by the caller's role: `SUPER_ADMIN` sees all; `TEACHER` sees only their own
courses' exams; `MARKER` sees only exams they are assigned to; `STUDENT` sees only exams for courses
they are actively enrolled in. Front-desk `ADMIN` has **no exam access** (`403`). Non-`SUPER_ADMIN`
callers never see soft-deleted exams.
```

In the `### GET `/:id`` section, add to the **Errors** list:

```markdown
- 403 `FORBIDDEN` (front-desk `ADMIN`, or any role without exam-read access)
- 403 `MARKER_NOT_ASSIGNED` (a `MARKER` requesting an exam they are not assigned to)
```

and add a line under its intro noting the content rules:

```markdown
A `MARKER` assigned to the exam receives the question paper but **not** the MCQ answer key (the
`isCorrect` flags are stripped, as they are for students). `TEACHER`/`SUPER_ADMIN` receive the full
payload.
```

- [ ] **Step 2: Commit.**

```bash
git add context/api_endpoints/exams.endpoints.md
git commit -m "docs(exams): per-role read authorization contract"
```

---

### Task 4: Live-stack verification + PR

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-exam-read-authz-hardening-design.md` (status line)

- [ ] **Step 1: Full backend suite one more time, clean.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS — all suites, incl. `access.service.test.ts` (new), `exam.service.test.ts` (extended),
`submission.service.test.ts` (unchanged, still green).

- [ ] **Step 2: Rebuild + bring up the live stack.**

```bash
docker compose build backend
docker compose up -d
docker compose logs backend --tail 40
```

Expected: backend boots clean (no schema/env change, so a non-event).

- [ ] **Step 3: Live smoke.** Using the running API (log in via `POST /api/auth/login`; if the demo
data lacks a suitable marker, seed a `MarkerAssignment` for a MARKER user against exam A but not exam
B via `docker compose exec -T postgres psql -U lms -d lms`, matching how earlier sessions seeded
fixtures). Confirm:

- Front-desk `ADMIN`: `GET /api/exams` → `403`; `GET /api/exams/<any id>` → `403` (route-level
  `requireRole`).
- `MARKER` assigned to exam A only: `GET /api/exams` returns exam A but **not** exam B;
  `GET /api/exams/<B>` → `403 MARKER_NOT_ASSIGNED`; `GET /api/exams/<A>` returns the paper PDF but an
  `mcqPayload` whose options have **no `isCorrect`** field.
- Regression: `SUPER_ADMIN` reads exam B fully (with `isCorrect`); a `TEACHER` reads their own
  course's exam; a `STUDENT` enrolled in the course reads it (answer-stripped) — all unchanged.

- [ ] **Step 4: Update the spec status.** In the spec, change:

```markdown
**Status:** Design — awaiting review
```

to:

```markdown
**Status:** Implemented — all 4 plan tasks done, unit + live-stack smoke verified (2026-07-17)
```

- [ ] **Step 5: Commit, push, open the PR into `dev`.**

```bash
git add docs/superpowers/specs/2026-07-17-exam-read-authz-hardening-design.md
git commit -m "docs: mark exam-read authz hardening implemented"
git push -u origin fix/exam-read-authz-hardening
gh pr create --base dev --head fix/exam-read-authz-hardening \
  --title "fix(exams): close exam-read authorization hole (deny ADMIN, scope MARKER)" \
  --body "$(cat <<'EOF'
## Summary
- `exam.routes.ts` `GET /` and `GET /:id` had no `requireRole` — any MARKER or front-desk ADMIN
  could list every exam and fetch any exam's paper PDF + full MCQ answer key. This closes it with
  default-deny at two layers: a route allowlist (SUPER_ADMIN/TEACHER/MARKER/STUDENT — ADMIN dropped)
  and a service-level `EXAM_READER_ROLES` guard so safety isn't coupled to the route alone.
- MARKER is now scoped to assigned exams (`listExams` filter + `getExamById` assignment assert) and
  the MCQ answer key is stripped for markers (they grade written answers; MCQ is auto-graded).
- Extracted the marker-assignment check into a shared `assertMarkerAssignedToExam` in
  `access.service.ts` (was private in `submission.service.ts`) — DRY, centralizes authz, and gives
  `access.service` its first test file.

## Test plan
- [x] Backend unit: new `access.service.test.ts` (marker gate) + extended `exam.service.test.ts`
  (MARKER/ADMIN cases) + `submission.service.test.ts` unchanged & green; full suite + `tsc` clean.
- [x] Live-stack smoke: ADMIN 403 on both read routes; MARKER sees only assigned exams, 403 on
  unassigned, answer-stripped MCQ on assigned; SUPER_ADMIN/TEACHER/STUDENT unchanged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Do not delete `fix/exam-read-authz-hardening` after merge** (repo convention).
