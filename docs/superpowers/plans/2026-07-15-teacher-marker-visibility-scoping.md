# Teacher/Marker Visibility Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a real privilege-scoping gap: a `TEACHER` can currently list/read another
teacher's exam content (incl. paper PDF + MCQ answers), recordings, submissions, and session
schedule, because `assertCourseAccess` — the repo's one established course-ownership gate — is
missing from 8 read paths across four services.

**Architecture:** No new helper, no new error code. Every fix reuses the existing
`assertCourseAccess(courseId, actor)` (`class.service.ts:59-77`), which already throws
`FORBIDDEN_COURSE` (403) for a non-owning `TEACHER` and passes `ADMIN`/`SUPER_ADMIN` through
unconditionally. Single-resource reads call it directly (throw style, same as `createExam`/
`deleteVideo`); the one cross-course list (`listExams`, which can span every course when no
`courseId` filter is given) gets a silent `where`-clause scope instead, mirroring the existing
STUDENT-enrollment filter already in that same function.

**Tech Stack:** Express + Prisma (Postgres) + Zod + Vitest (backend only — no frontend or schema
changes in this plan).

## Global Constraints

- Three-tier: `routes` → `controllers` (zero Prisma imports) → `services` (only layer importing
  `@/config/database`'s `prisma`). Copied verbatim from CLAUDE.md. This plan only touches
  `services/` (plus two one-line controller call-site updates where a service signature changes).
- Known failures throw `AppError(code, statusCode, message)` from `@/utils/app-error`.
- Every new implementation/behavioral change is backed by a Vitest unit test (§3.4) in addition to
  live-stack verification.
- Backend tests mock `@/config/database`'s `prisma` export and any other service the code under
  test calls — **every file this plan touches (`exam.service.ts`, `class-session.service.ts`,
  `submission.service.ts`) imports `@/services/stream.service`; `submission.service.ts` also
  imports `@/services/notification.service`. Both MUST be mocked to `{}`/`{ dispatch: vi.fn() }`
  in the new test files, or importing the service under test pulls in a real Redis/BullMQ
  connection at test load and hangs.** `video.service.ts` does not import either, but does import
  `@/utils/bunny` — mock that instead.
- Conventional Commits; branch is `feature/teacher-marker-visibility-scoping` (already created off
  `dev`; the design spec is already committed to it).
- `noUncheckedIndexedAccess` is on — index access needs `?.`/`!`.
- **Indentation is per-file, not per-repo — match each file's existing style exactly:**
  `exam.service.ts` uses **tabs**; `video.service.ts`, `submission.service.ts`, and
  `class-session.service.ts` use **2 spaces**. Every `.test.ts` file in this directory (including
  the four new ones this plan creates) uses **tabs**, regardless of its corresponding service
  file's own indentation — confirmed by inspecting `class.service.test.ts` (tabs) next to
  `class-session.service.ts` (spaces). Copy the exact whitespace from the code blocks below.
- Test-file convention for mocking a same-layer dependency (not the file under test): mock the
  whole module and assert on the mock, don't re-test the dependency's own internals. Precedent:
  `upload-confirm.service.test.ts:44` does `vi.mock('@/services/class.service', () => ({
  assertCourseAccess }))` — this plan's four new test files follow the exact same pattern.

---

### Task 1: `exam.service.ts` — `listExams` + `getExamById`

**Files:**
- Modify: `backend/src/services/exam.service.ts:231-303`
- Create: `backend/src/services/exam.service.test.ts`

**Interfaces:**
- Consumes: `assertCourseAccess(courseId: string, actor: AuthenticatedUser): Promise<{ id: string; teacherId: string }>` (already imported at `exam.service.ts:5`).
- Produces: no signature changes — `listExams`/`getExamById` keep their existing parameter lists.

- [ ] **Step 1: Write the failing tests.** Create `backend/src/services/exam.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	examFindMany,
	examFindUnique,
	assertStudentContentAccess,
	assertCourseAccess,
	createR2PresignedGetUrl,
} = vi.hoisted(() => ({
	examFindMany: vi.fn(),
	examFindUnique: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
	createR2PresignedGetUrl: vi.fn().mockResolvedValue('https://signed.example/paper.pdf'),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		exam: { findMany: examFindMany, findUnique: examFindUnique },
	},
}));

vi.mock('@/services/access.service', () => ({ assertStudentContentAccess }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/utils/r2', () => ({
	createR2PresignedGetUrl,
	createR2PresignedPutUrl: vi.fn(),
	r2HeadObject: vi.fn(),
}));

import { listExams, getExamById } from './exam.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER } as const;
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER } as const;
const superAdmin = { userId: 'admin-1', role: Role.SUPER_ADMIN } as const;
const forbidden = new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');

const examRow = {
	id: 'exam-1',
	title: 'Midterm',
	type: 'WRITTEN',
	startTime: new Date('2026-07-01T00:00:00.000Z'),
	endTime: new Date('2026-07-01T02:00:00.000Z'),
	totalMarks: 100,
	isPublished: false,
	allowTypedAnswers: true,
	allowPdfUpload: false,
	courseId: 'course-1',
	deletedAt: null,
	createdAt: new Date('2026-06-01T00:00:00.000Z'),
	updatedAt: new Date('2026-06-01T00:00:00.000Z'),
	paperPdfUrl: null,
	mcqPayload: null,
};

beforeEach(() => {
	vi.clearAllMocks();
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	createR2PresignedGetUrl.mockResolvedValue('https://signed.example/paper.pdf');
});

describe('listExams — TEACHER course-ownership scoping', () => {
	it("scopes the query to the acting TEACHER's own courses", async () => {
		examFindMany.mockResolvedValueOnce([]);

		await listExams({ status: 'all' }, teacher);

		const call = examFindMany.mock.calls[0]![0];
		expect(call.where.course).toEqual({ teacherId: 'teacher-1' });
	});

	it('does not scope by teacherId for SUPER_ADMIN', async () => {
		examFindMany.mockResolvedValueOnce([]);

		await listExams({ status: 'all' }, superAdmin);

		const call = examFindMany.mock.calls[0]![0];
		expect(call.where.course).toBeUndefined();
	});

	it('keeps an explicit courseId filter alongside the TEACHER ownership scope', async () => {
		examFindMany.mockResolvedValueOnce([]);

		await listExams({ status: 'all', courseId: 'course-9' }, teacher);

		const call = examFindMany.mock.calls[0]![0];
		expect(call.where.courseId).toBe('course-9');
		expect(call.where.course).toEqual({ teacherId: 'teacher-1' });
	});
});

describe('getExamById — TEACHER course-ownership scoping', () => {
	it("calls assertCourseAccess with the exam's courseId and the acting TEACHER", async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		await getExamById('exam-1', teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a TEACHER who does not own the course with FORBIDDEN_COURSE', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(getExamById('exam-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
	});

	it('SUPER_ADMIN reads any course\'s exam unaffected', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		const result = await getExamById('exam-1', superAdmin);

		expect(result.id).toBe('exam-1');
		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', superAdmin);
	});
});
```

- [ ] **Step 2: Run it to confirm it fails (no scoping yet).**

Run: `cd backend && npm run test -- exam.service`
Expected: FAIL — `listExams`'s `where.course` is `undefined` for a TEACHER; `getExamById` never
calls `assertCourseAccess` (the mock's call count is 0).

- [ ] **Step 3: Fix `listExams`.** In `exam.service.ts`, the `where` object (currently lines
247-256) — add a `course` branch right after the existing STUDENT branch:

```ts
	const where: Prisma.ExamWhereInput = {
		...(query.courseId ? { courseId: query.courseId } : {}),
		...(query.type ? { type: query.type } : {}),
		...(role === Role.SUPER_ADMIN ? {} : { deletedAt: null }),
		// Students only see exams for courses they are actively enrolled in.
		...(role === Role.STUDENT
			? { course: { enrollments: { some: { userId: actor.userId, isActive: true } } } }
			: {}),
		// Teachers only see exams for courses they teach — a list filter, not a
		// throw, mirroring the STUDENT scoping directly above.
		...(role === Role.TEACHER ? { course: { teacherId: actor.userId } } : {}),
		...timeFilter,
	};
```

- [ ] **Step 4: Fix `getExamById`.** Add the new check right after the existing `deletedAt` guard
(currently lines 272-277):

```ts
	if (exam.deletedAt && role !== Role.SUPER_ADMIN) {
		throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
	}

	// Teachers may only read exams for courses they teach.
	await assertCourseAccess(exam.courseId, actor);

	// Students may only read exams for courses they are enrolled in.
	await assertStudentContentAccess(actor, exam.courseId, { requirePaid: false });
```

- [ ] **Step 5: Run the tests to green.**

Run: `cd backend && npm run test -- exam.service`
Expected: PASS (all 6 new cases).

- [ ] **Step 6: Typecheck + full backend test run (confirm no other exam.service consumer broke).**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS (all suites — this also re-confirms `upload-confirm.service.test.ts`'s
`confirmExamPaper` cases, which mock `class.service`/`access.service` independently and are
unaffected).

- [ ] **Step 7: Commit.**

```bash
git add backend/src/services/exam.service.ts backend/src/services/exam.service.test.ts
git commit -m "fix(exams): scope listExams/getExamById to a TEACHER's own courses"
```

---

### Task 2: `video.service.ts` — `listVideosByClass` + `getVideoById` (+ `generateStreamUrl`)

**Files:**
- Modify: `backend/src/services/video.service.ts:207-309`
- Modify: `backend/src/controllers/video.controller.ts:125-137`
- Create: `backend/src/services/video.service.test.ts`

**Interfaces:**
- Consumes: `assertCourseAccess` (already imported at `video.service.ts:12`).
- Produces: `getVideoById(videoId: string, actor: AuthenticatedUser): Promise<VideoRecordWithSession>`
  — **signature change**, second parameter added. Both call sites (`generateStreamUrl` and
  `video.controller.ts`'s `getVideo` handler) must be updated in this task.

- [ ] **Step 1: Write the failing tests.** Create `backend/src/services/video.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role, VideoStatus } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	courseFindUnique,
	videoFindMany,
	videoCount,
	videoFindUnique,
	userFindUnique,
	assertStudentContentAccess,
	assertCourseAccess,
	getSignedBunnyEmbedUrl,
} = vi.hoisted(() => ({
	courseFindUnique: vi.fn(),
	videoFindMany: vi.fn(),
	videoCount: vi.fn(),
	videoFindUnique: vi.fn(),
	userFindUnique: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
	getSignedBunnyEmbedUrl: vi.fn().mockReturnValue({
		embedUrl: 'https://iframe.mediadelivery.net/embed/1/vid-1?token=x',
		expiresAt: 1234567890,
	}),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		course: { findUnique: courseFindUnique },
		videoRecording: { findMany: videoFindMany, count: videoCount, findUnique: videoFindUnique },
		user: { findUnique: userFindUnique },
	},
}));

vi.mock('@/services/access.service', () => ({ assertStudentContentAccess }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/utils/bunny', () => ({
	createBunnyVideo: vi.fn(),
	generateBunnyTusUpload: vi.fn(),
	getSignedBunnyEmbedUrl,
	resolveBunnyWebhookStatus: vi.fn(),
}));

import { listVideosByClass, getVideoById, generateStreamUrl } from './video.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER } as const;
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER } as const;
const superAdmin = { userId: 'admin-1', role: Role.SUPER_ADMIN } as const;
const forbidden = new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');

const videoRow = {
	id: 'vid-1',
	title: 'Lecture 1',
	bunnyVideoId: 'bunny-1',
	durationSeconds: 600,
	status: VideoStatus.READY,
	classSessionId: 'sess-1',
	createdAt: new Date('2026-06-01T00:00:00.000Z'),
	updatedAt: new Date('2026-06-01T00:00:00.000Z'),
	classSession: {
		id: 'sess-1',
		title: 'Session 1',
		date: new Date('2026-06-01T00:00:00.000Z'),
		courseId: 'course-1',
	},
};

beforeEach(() => {
	vi.clearAllMocks();
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	getSignedBunnyEmbedUrl.mockReturnValue({
		embedUrl: 'https://iframe.mediadelivery.net/embed/1/vid-1?token=x',
		expiresAt: 1234567890,
	});
});

describe('listVideosByClass — TEACHER course-ownership scoping', () => {
	it('calls assertCourseAccess with the courseId and acting TEACHER', async () => {
		courseFindUnique.mockResolvedValueOnce({ id: 'course-1' });
		videoFindMany.mockResolvedValueOnce([]);
		videoCount.mockResolvedValueOnce(0);

		await listVideosByClass('course-1', { page: 1, limit: 20 }, teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE, never reaching the query', async () => {
		courseFindUnique.mockResolvedValueOnce({ id: 'course-1' });
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(
			listVideosByClass('course-1', { page: 1, limit: 20 }, otherTeacher),
		).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
		expect(videoFindMany).not.toHaveBeenCalled();
	});

	it("SUPER_ADMIN lists any course's videos unaffected", async () => {
		courseFindUnique.mockResolvedValueOnce({ id: 'course-1' });
		videoFindMany.mockResolvedValueOnce([videoRow]);
		videoCount.mockResolvedValueOnce(1);

		const result = await listVideosByClass('course-1', { page: 1, limit: 20 }, superAdmin);

		expect(result.total).toBe(1);
		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', superAdmin);
	});
});

describe('getVideoById — TEACHER course-ownership scoping', () => {
	it("calls assertCourseAccess with the video's classSession.courseId", async () => {
		videoFindUnique.mockResolvedValueOnce(videoRow);

		await getVideoById('vid-1', teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE', async () => {
		videoFindUnique.mockResolvedValueOnce(videoRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(getVideoById('vid-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
	});
});

describe("generateStreamUrl — inherits getVideoById's course-ownership check", () => {
	it('rejects a non-owning TEACHER before minting a signed embed URL', async () => {
		videoFindUnique.mockResolvedValueOnce(videoRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(generateStreamUrl('vid-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(getSignedBunnyEmbedUrl).not.toHaveBeenCalled();
	});

	it('an enrolled+paid STUDENT is unaffected — assertCourseAccess is a no-op for STUDENT', async () => {
		videoFindUnique.mockResolvedValueOnce(videoRow);
		userFindUnique.mockResolvedValueOnce({ name: 'Nimal Perera', indexNumber: 42 });
		const student = { userId: 'student-1', role: Role.STUDENT } as const;

		const result = await generateStreamUrl('vid-1', student);

		expect(result.embedUrl).toContain('vid-1');
		expect(assertStudentContentAccess).toHaveBeenCalledWith(student, 'course-1', {
			requirePaid: true,
		});
	});
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd backend && npm run test -- video.service`
Expected: FAIL — `getVideoById` doesn't accept a second argument yet, and neither it nor
`listVideosByClass` calls `assertCourseAccess`.

- [ ] **Step 3: Fix `listVideosByClass`.** Add the new check right after the existing
`assertStudentContentAccess` call (currently `video.service.ts:221-222`):

```ts
  // Students must be enrolled to see a course's video list.
  await assertStudentContentAccess(actor, courseId, { requirePaid: false });

  // Teachers may only list videos for courses they teach.
  await assertCourseAccess(courseId, actor);
```

- [ ] **Step 4: Fix `getVideoById`.** Replace the function (currently lines 251-262):

```ts
export const getVideoById = async (
  videoId: string,
  actor: AuthenticatedUser,
): Promise<VideoRecordWithSession> => {
  const video = await prisma.videoRecording.findUnique({
    where: { id: videoId },
    select: videoWithSessionSelect,
  });

  if (!video) {
    throw new AppError('VIDEO_NOT_FOUND', 404, 'Video recording not found.');
  }

  await assertCourseAccess(video.classSession.courseId, actor);

  return video;
};
```

- [ ] **Step 5: Update `generateStreamUrl`'s call site.** Change (currently line 282):

```ts
  const video = await getVideoById(videoId);
```

to:

```ts
  const video = await getVideoById(videoId, actor);
```

- [ ] **Step 6: Update the controller call site.** In `video.controller.ts`, the `getVideo` handler
(currently lines 127-137) — change:

```ts
export const getVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = videoIdParamSchema.parse(req.params);
    const video = await VideoService.getVideoById(id);

    res.status(200).json({
      status: 'success',
      data: video,
    });
  },
);
```

to:

```ts
export const getVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = videoIdParamSchema.parse(req.params);
    const video = await VideoService.getVideoById(id, req.user!);

    res.status(200).json({
      status: 'success',
      data: video,
    });
  },
);
```

- [ ] **Step 7: Run the tests to green.**

Run: `cd backend && npm run test -- video.service`
Expected: PASS (all 7 new cases).

- [ ] **Step 8: Typecheck + full backend test run.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS (all suites).

- [ ] **Step 9: Commit.**

```bash
git add backend/src/services/video.service.ts backend/src/services/video.service.test.ts backend/src/controllers/video.controller.ts
git commit -m "fix(videos): scope listVideosByClass/getVideoById/generateStreamUrl to a TEACHER's own courses"
```

---

### Task 3: `submission.service.ts` — `listSubmissions`

**Files:**
- Modify: `backend/src/services/submission.service.ts:1-16` (imports), `:397-408` (function)
- Modify: `backend/src/controllers/submission.controller.ts:70-87`
- Create: `backend/src/services/submission.service.test.ts`

**Interfaces:**
- Consumes: `assertCourseAccess` — **not yet imported in this file**, added in Step 3.
- Produces: `listSubmissions(examId: string, query: ListSubmissionsQuery, actor: AuthenticatedUser): Promise<SubmissionListItem[]>`
  — **signature change**: the old `(examId, query, userId: string, role: Role)` collapses to a
  single `actor` parameter. The one call site (`submission.controller.ts`) is updated in this task.

- [ ] **Step 1: Write the failing tests.** Create `backend/src/services/submission.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const { examFindUnique, markerAssignmentFindUnique, submissionFindMany, assertCourseAccess } =
	vi.hoisted(() => ({
		examFindUnique: vi.fn(),
		markerAssignmentFindUnique: vi.fn(),
		submissionFindMany: vi.fn(),
		assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
	}));

vi.mock('@/config/database', () => ({
	prisma: {
		exam: { findUnique: examFindUnique },
		markerAssignment: { findUnique: markerAssignmentFindUnique },
		submission: { findMany: submissionFindMany },
	},
}));

vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/services/notification.service', () => ({ dispatch: vi.fn() }));
vi.mock('@/utils/r2', () => ({
	createR2PresignedGetUrl: vi.fn().mockResolvedValue('https://signed.example/answer.pdf'),
	createR2PresignedPutUrl: vi.fn(),
	r2HeadObject: vi.fn(),
}));

import { listSubmissions } from './submission.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER } as const;
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER } as const;
const marker = { userId: 'marker-1', role: Role.MARKER } as const;
const superAdmin = { userId: 'admin-1', role: Role.SUPER_ADMIN } as const;
const forbidden = new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');

const examRow = {
	id: 'exam-1',
	title: 'Midterm',
	type: 'WRITTEN',
	startTime: new Date('2026-07-01T00:00:00.000Z'),
	endTime: new Date('2026-07-01T02:00:00.000Z'),
	totalMarks: 100,
	isPublished: false,
	deletedAt: null,
	mcqPayload: null,
	allowTypedAnswers: true,
	allowPdfUpload: false,
	courseId: 'course-1',
};

const query = { status: 'all' as const, graded: 'all' as const };

beforeEach(() => {
	vi.clearAllMocks();
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	submissionFindMany.mockResolvedValue([]);
});

describe('listSubmissions — TEACHER course-ownership scoping', () => {
	it("calls assertCourseAccess with the exam's courseId for a TEACHER caller", async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		await listSubmissions('exam-1', query, teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE, never querying submissions', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(listSubmissions('exam-1', query, otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(submissionFindMany).not.toHaveBeenCalled();
	});

	it("SUPER_ADMIN reads any exam's submissions unaffected", async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		await listSubmissions('exam-1', query, superAdmin);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', superAdmin);
		expect(submissionFindMany).toHaveBeenCalled();
	});
});

describe('listSubmissions — MARKER assignment gate is unaffected by the new TEACHER check', () => {
	it('calls ensureMarkerAssigned for a MARKER and never calls assertCourseAccess', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		markerAssignmentFindUnique.mockResolvedValueOnce({ markerId: 'marker-1', examId: 'exam-1' });

		await listSubmissions('exam-1', query, marker);

		expect(markerAssignmentFindUnique).toHaveBeenCalledWith({
			where: { markerId_examId: { markerId: 'marker-1', examId: 'exam-1' } },
		});
		expect(assertCourseAccess).not.toHaveBeenCalled();
	});

	it('still rejects an unassigned MARKER with MARKER_NOT_ASSIGNED', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		markerAssignmentFindUnique.mockResolvedValueOnce(null);

		await expect(listSubmissions('exam-1', query, marker)).rejects.toMatchObject({
			code: 'MARKER_NOT_ASSIGNED',
			statusCode: 403,
		});
	});
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd backend && npm run test -- submission.service`
Expected: FAIL — `listSubmissions` doesn't accept a single `actor` object yet (TS will also error
if you run `tsc`, since the test calls it with the new 3-arg shape).

- [ ] **Step 3: Add the two missing imports.** In `submission.service.ts`, change the top of the
file from:

```ts
import { ExamType, NotificationType, Prisma, Role, SubmissionStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { ANSWER_PDF_KEY_PREFIX, ANSWER_PDF_URL_TTL_SECONDS } from '@/utils/constants';
import { createR2PresignedGetUrl, createR2PresignedPutUrl, r2HeadObject } from '@/utils/r2';
import { mcqPayloadSchema } from '@/schemas/exam.schema';
```

to:

```ts
import { ExamType, NotificationType, Prisma, Role, SubmissionStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import { ANSWER_PDF_KEY_PREFIX, ANSWER_PDF_URL_TTL_SECONDS } from '@/utils/constants';
import { createR2PresignedGetUrl, createR2PresignedPutUrl, r2HeadObject } from '@/utils/r2';
import { mcqPayloadSchema } from '@/schemas/exam.schema';
import { assertCourseAccess } from '@/services/class.service';
```

- [ ] **Step 4: Fix `listSubmissions`.** Replace the function signature and its opening lines
(currently lines 397-408):

```ts
export const listSubmissions = async (
  examId: string,
  query: ListSubmissionsQuery,
  actor: AuthenticatedUser,
): Promise<SubmissionListItem[]> => {
  const exam = await ensureExamActive(examId);

  // Markers can only view submissions for exams they're assigned to
  if (actor.role === Role.MARKER) {
    await ensureMarkerAssigned(actor.userId, examId);
  }

  // Teachers can only view submissions for their own courses' exams
  if (actor.role === Role.TEACHER) {
    await assertCourseAccess(exam.courseId, actor);
  }
```

(Everything below this — `statusFilter`, `gradedFilter`, the `findMany` call, the presigned-URL
loop, and the `return results;` — is unchanged.)

- [ ] **Step 5: Update the controller call site.** In `submission.controller.ts`, the
`listSubmissions` handler (currently lines 70-87) — change:

```ts
export const listSubmissions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { examId } = listSubmissionsParamsSchema.parse(req.params);
    const query = listSubmissionsQuerySchema.parse(req.query);
    const submissions = await SubmissionService.listSubmissions(
      examId,
      query,
      req.user!.userId,
      req.user!.role,
    );

    res.status(200).json({
      status: 'success',
      data: submissions,
      count: submissions.length,
    });
  },
);
```

to:

```ts
export const listSubmissions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { examId } = listSubmissionsParamsSchema.parse(req.params);
    const query = listSubmissionsQuerySchema.parse(req.query);
    const submissions = await SubmissionService.listSubmissions(examId, query, req.user!);

    res.status(200).json({
      status: 'success',
      data: submissions,
      count: submissions.length,
    });
  },
);
```

- [ ] **Step 6: Run the tests to green.**

Run: `cd backend && npm run test -- submission.service`
Expected: PASS (all 5 new cases).

- [ ] **Step 7: Typecheck + full backend test run.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS (all suites — including `upload-confirm.service.test.ts`'s `completeSubmission`
cases, which don't call `listSubmissions` and are unaffected).

- [ ] **Step 8: Commit.**

```bash
git add backend/src/services/submission.service.ts backend/src/services/submission.service.test.ts backend/src/controllers/submission.controller.ts
git commit -m "fix(submissions): scope listSubmissions to a TEACHER's own courses' exams"
```

---

### Task 4: `class-session.service.ts` — `listClassSessions` + `getClassSessionById`

**Files:**
- Modify: `backend/src/services/class-session.service.ts:81-123`
- Create: `backend/src/services/class-session.service.test.ts`

**Interfaces:**
- Consumes: `assertCourseAccess` (already imported at `class-session.service.ts:10`).
- Produces: no signature changes.

- [ ] **Step 1: Write the failing tests.** Create `backend/src/services/class-session.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	courseFindUnique,
	classSessionFindMany,
	classSessionFindUnique,
	assertStudentContentAccess,
	assertCourseAccess,
} = vi.hoisted(() => ({
	courseFindUnique: vi.fn(),
	classSessionFindMany: vi.fn(),
	classSessionFindUnique: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		course: { findUnique: courseFindUnique },
		classSession: { findMany: classSessionFindMany, findUnique: classSessionFindUnique },
	},
}));

vi.mock('@/services/access.service', () => ({ assertStudentContentAccess }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({}));

import { listClassSessions, getClassSessionById } from './class-session.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER } as const;
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER } as const;
const superAdmin = { userId: 'admin-1', role: Role.SUPER_ADMIN } as const;
const forbidden = new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');

const sessionRow = {
	id: 'sess-1',
	title: 'Session 1',
	description: null,
	classType: 'PHYSICAL',
	date: new Date('2026-07-01T00:00:00.000Z'),
	durationMinutes: 60,
	zoomLink: null,
	zoomMeetingId: null,
	courseId: 'course-1',
	deletedAt: null,
	createdAt: new Date('2026-06-01T00:00:00.000Z'),
	updatedAt: new Date('2026-06-01T00:00:00.000Z'),
};

beforeEach(() => {
	vi.clearAllMocks();
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	courseFindUnique.mockResolvedValue({ id: 'course-1' });
});

describe('listClassSessions — TEACHER course-ownership scoping', () => {
	it('calls assertCourseAccess with the classId and acting TEACHER', async () => {
		classSessionFindMany.mockResolvedValueOnce([]);

		await listClassSessions('course-1', {}, teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE, never querying sessions', async () => {
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(listClassSessions('course-1', {}, otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(classSessionFindMany).not.toHaveBeenCalled();
	});

	it("SUPER_ADMIN lists any course's sessions unaffected", async () => {
		classSessionFindMany.mockResolvedValueOnce([sessionRow]);

		const result = await listClassSessions('course-1', {}, superAdmin);

		expect(result).toEqual([sessionRow]);
		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', superAdmin);
	});
});

describe('getClassSessionById — TEACHER course-ownership scoping', () => {
	it('calls assertCourseAccess with the classId and acting TEACHER', async () => {
		classSessionFindUnique.mockResolvedValueOnce(sessionRow);

		await getClassSessionById('course-1', 'sess-1', teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE, never querying the session', async () => {
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(getClassSessionById('course-1', 'sess-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(classSessionFindUnique).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd backend && npm run test -- class-session.service`
Expected: FAIL — neither function calls `assertCourseAccess` yet.

- [ ] **Step 3: Fix `listClassSessions`.** Add the new check right after the existing
`assertStudentContentAccess` call (currently `class-session.service.ts:88-89`):

```ts
  // Students may only see the schedule of courses they are enrolled in.
  await assertStudentContentAccess(actor, classId, { requirePaid: false });

  // Teachers may only see the schedule of courses they teach.
  await assertCourseAccess(classId, actor);
```

- [ ] **Step 4: Fix `getClassSessionById`.** Add the same check right after its own
`assertStudentContentAccess` call (currently `class-session.service.ts:111-112`):

```ts
  await ensureClassExists(classId);
  await assertStudentContentAccess(actor, classId, { requirePaid: false });

  // Teachers may only see the schedule of courses they teach.
  await assertCourseAccess(classId, actor);
```

- [ ] **Step 5: Run the tests to green.**

Run: `cd backend && npm run test -- class-session.service`
Expected: PASS (all 5 new cases).

- [ ] **Step 6: Typecheck + full backend test run.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS (all suites).

- [ ] **Step 7: Commit.**

```bash
git add backend/src/services/class-session.service.ts backend/src/services/class-session.service.test.ts
git commit -m "fix(class-sessions): scope listClassSessions/getClassSessionById to a TEACHER's own courses"
```

---

### Task 5: Endpoint docs + architecture/CLAUDE.md notes

**Files:**
- Modify: `context/api_endpoints/exams.endpoints.md`
- Modify: `context/api_endpoints/video.endpoints.md`
- Modify: `context/api_endpoints/submissions.endpoints.md`
- Modify: `context/api_endpoints/classes.endpoints.md`
- Modify: `context/documents/02-architecture.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `exams.endpoints.md`.** In the `### GET `/`` section (line 170), change:

```markdown
List exams. Non-admin users only see non-deleted exams.
```

to:

```markdown
List exams. Non-admin users only see non-deleted exams. A `TEACHER` caller only ever sees exams
for courses they teach — other teachers' courses are silently excluded from the list (not a 403,
since this is a list filter, not a single-resource fetch).
```

In the `### GET `/:id`` section (line 195-212), add a new line to the **Errors** list:

```markdown
- 403 `FORBIDDEN_COURSE` (a `TEACHER` calling for an exam whose course they don't teach)
```

- [ ] **Step 2: `video.endpoints.md`.** In both the `### `GET /class/:classId`` (line 200) and
`### `GET /:id`` (line 240) sections, add a line right after each section's intro sentence:

```markdown
A `TEACHER` caller gets `403 FORBIDDEN_COURSE` if the video's course isn't one they teach.
```

In the `### `GET /:id/stream`` section (line 264), add the same line — a non-owning `TEACHER` is
rejected before a signed embed URL is ever minted.

- [ ] **Step 3: `submissions.endpoints.md`.** In the "List Submissions" section (around line 195),
add a line right after its intro sentence:

```markdown
A `TEACHER` caller gets `403 FORBIDDEN_COURSE` if the exam's course isn't one they teach — distinct
from a `MARKER`'s `403 MARKER_NOT_ASSIGNED`, which checks assignment rather than course ownership.
```

- [ ] **Step 4: `classes.endpoints.md`.** In both the `### GET `/:classId/sessions`` (line 316) and
`### GET `/:classId/sessions/:sessionId`` (line 339) sections, add a line right after each
section's intro sentence:

```markdown
A `TEACHER` caller gets `403 FORBIDDEN_COURSE` if the class isn't one they teach.
```

- [ ] **Step 5: `context/documents/02-architecture.md`.** In the §7 "Security Model" table
(currently lines 227-240), change the `Authorization` row from:

```markdown
| Authorization | Role-based middleware guard (`requireRole('SUPER_ADMIN', 'ADMIN')`), plus optional per-user `Permission` overrides (see 08) |
```

to:

```markdown
| Authorization | Role-based middleware guard (`requireRole('SUPER_ADMIN', 'ADMIN')`) gates by the **caller's** role only; course-scoped content (exams/videos/submissions/sessions) additionally requires `assertCourseAccess` in the service layer so a `TEACHER` is scoped to courses they actually teach — see CLAUDE.md's "Auth & authorization" section. Optional per-user `Permission` overrides also exist (see 08) |
```

- [ ] **Step 6: `CLAUDE.md`.** In the "Auth & authorization" section, add a new paragraph right
after the existing actor-vs-target paragraph (currently ending "...check whether it needs the same
guard.") and before the "Role enum:" paragraph:

```markdown
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
```

- [ ] **Step 7: Commit.**

```bash
git add context/api_endpoints/exams.endpoints.md context/api_endpoints/video.endpoints.md context/api_endpoints/submissions.endpoints.md context/api_endpoints/classes.endpoints.md context/documents/02-architecture.md CLAUDE.md
git commit -m "docs: TEACHER course-ownership scoping on exam/video/submission/session reads"
```

---

### Task 6: Live-stack verification + progress-tracker update + PR

**Files:**
- Modify: `context/documents/06-progress-tracker.md`
- Modify: `docs/superpowers/specs/2026-07-15-teacher-marker-visibility-scoping-design.md`

- [ ] **Step 1: Full backend suite one more time, clean.**

Run: `cd backend && npx tsc --noEmit && npm run test`
Expected: PASS — all suites, including the 4 new files from Tasks 1-4 (23 new test cases total).

- [ ] **Step 2: Rebuild and bring up the live stack.**

```bash
docker compose build backend
docker compose up -d
docker compose logs backend --tail 50
```

Expected: backend starts clean, no crash from the env/schema validation at boot (this plan makes
no schema or env changes, so this should be a non-event — treat any crash as a signal something
in Tasks 1-4 broke an import, not a pre-existing issue).

- [ ] **Step 3: Live smoke — set up two teachers with different courses.** Using the running
stack's API (or `docker compose exec backend` + a one-off script/psql, matching how earlier
sessions in this repo seeded fixture data), create or identify two `TEACHER` accounts each owning
at least one course with an exam, a video recording, a submission, and a class session. Log in as
Teacher A and confirm:

- `GET /api/exams?courseId=<Teacher B's course>` excludes Teacher B's exam from the list.
- `GET /api/exams/<Teacher B's exam id>` → `403 FORBIDDEN_COURSE`.
- `GET /api/videos/class/<Teacher B's course id>` → `403 FORBIDDEN_COURSE`.
- `GET /api/videos/<Teacher B's video id>` → `403 FORBIDDEN_COURSE`.
- `GET /api/submissions/<Teacher B's exam id>` → `403 FORBIDDEN_COURSE`.
- `GET /api/classes/<Teacher B's course id>/sessions` → `403 FORBIDDEN_COURSE`.
- The same six calls against Teacher A's **own** course/exam/video/submission/session all succeed
  as before (regression check — this is the part that's easy to silently break).
- Log in as `SUPER_ADMIN` and confirm all six calls against Teacher B's resources still succeed
  unaffected.

- [ ] **Step 4: Update the spec's status.** In
`docs/superpowers/specs/2026-07-15-teacher-marker-visibility-scoping-design.md`, change:

```markdown
**Status:** Design — awaiting review
```

to:

```markdown
**Status:** Implemented — all 6 plan tasks done, unit + live-stack smoke verified (2026-07-15)
```

- [ ] **Step 5: Update the progress tracker.** In `context/documents/06-progress-tracker.md`, find
the line (added during the 2026-07-15 gap-audit pass):

```markdown
- [x] Teacher-scoped read gaps found (2026-07-15, spec written, **implementation not yet started**): `assertCourseAccess` is missing from `exam.service.ts` (`listExams`/`getExamById`), `video.service.ts` (`listVideosByClass`/`getVideoById`/`generateStreamUrl`), `submission.service.ts` (`listSubmissions`), and `class-session.service.ts` (`listClassSessions`/`getClassSessionById`) — any TEACHER can currently view another teacher's exam content (incl. answers), recordings, submissions, and session schedule. `MARKER` scoping (`ensureMarkerAssigned`) and front-desk `ADMIN` route-gating were both independently verified correct — not part of the gap. See `docs/superpowers/specs/2026-07-15-teacher-marker-visibility-scoping-design.md`.
```

and change `**implementation not yet started**` to `**implemented 2026-07-15**`.

- [ ] **Step 6: Commit the doc updates.**

```bash
git add docs/superpowers/specs/2026-07-15-teacher-marker-visibility-scoping-design.md context/documents/06-progress-tracker.md
git commit -m "docs: mark teacher-marker-visibility-scoping implemented"
```

- [ ] **Step 7: Push and open the PR into `dev`.**

```bash
git push -u origin feature/teacher-marker-visibility-scoping
gh pr create --base dev --head feature/teacher-marker-visibility-scoping \
  --title "fix(access): scope teacher reads to their own courses (exams/videos/submissions/sessions)" \
  --body "$(cat <<'EOF'
## Summary
- A TEACHER could previously list/read another teacher's exam content (incl. paper PDF + MCQ
  answers), video recordings, submissions, and session schedule — assertCourseAccess (the repo's
  existing course-ownership gate) was missing from 8 read paths across 4 services.
- Fixed by reusing assertCourseAccess everywhere: a throw (403 FORBIDDEN_COURSE) for
  single-resource reads, a silent where-clause filter for the one cross-course list (listExams).
- MARKER scoping (ensureMarkerAssigned) and front-desk ADMIN route-gating were both independently
  verified correct during the investigation — not part of this fix.

## Test plan
- [x] Backend unit: 23 new cases across 4 new test files (exam/video/submission/class-session
  .service.test.ts), full suite green
- [x] tsc --noEmit clean
- [x] Live-stack smoke: two teachers, cross-course reads on all 6 endpoints now 403 (or filtered),
  same-course reads unaffected, SUPER_ADMIN unaffected

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Do not delete `feature/teacher-marker-visibility-scoping` after merge** — this repo's convention
(`context/documents/11-git-and-naming.md`) is to keep branches around post-merge.
