# Teacher/marker visibility scoping — Design

**Date:** 2026-07-15
**Status:** Implemented — all 6 plan tasks done, unit + live-stack smoke verified (2026-07-15)
**Type:** Bugfix (behavioral change, closes a privilege-scoping gap)

## Problem

`assertCourseAccess` (`backend/src/services/class.service.ts:59-77`) is the repo's
established course-ownership gate: it throws `FORBIDDEN_COURSE` when
`actor.role === TEACHER && course.teacherId !== actor.userId`, and lets
`ADMIN`/`SUPER_ADMIN` through unconditionally. It is called correctly from every
course-scoped **mutation** (`createExam`, `deleteVideo`, `updateExam`, etc.) and from
the attendance read-paths fixed in `8baa069`.

It is **missing from several read paths**, so a TEACHER can currently see another
teacher's course content in full, not just metadata:

- `exam.service.ts` `listExams` (line 231) / `getExamById` (line 265) — any TEACHER
  can list or open any course's exam, including the paper PDF presigned URL and the
  full MCQ payload with answers.
- `video.service.ts` `listVideosByClass` (207) / `getVideoById` (251) /
  `generateStreamUrl` (273) — any TEACHER can list another course's recordings and
  mint a signed, watermarked Bunny playback URL for them.
- `submission.service.ts` `listSubmissions` (397) — a TEACHER (not just an
  unassigned `MARKER`, which is already correctly gated via `ensureMarkerAssigned`)
  can view any exam's submissions and get presigned answer-PDF URLs.
- `class-session.service.ts` `listClassSessions` (81) / `getClassSessionById` (104)
  — any TEACHER can list/read another course's session schedule.

**Investigated and confirmed non-issues, out of scope:**
- `MARKER` scoping is already correct (`ensureMarkerAssigned` in
  `submission.service.ts:404-408`, checked against the `MarkerAssignment` table).
- Front-desk `ADMIN` cannot reach exam/submission endpoints at all — those routes
  only grant `SUPER_ADMIN`/`TEACHER`(/`MARKER`), never bare `ADMIN`.
- `timetable.service.ts` `listSlots` is intentionally institute-wide (any role sees
  the full schedule) — left untouched, not a content-exposure concern.

## Design

Reuse `assertCourseAccess` everywhere — no new helper, no new error code (reuses
the existing `FORBIDDEN_COURSE`). Two shapes, both already precedented in the
codebase:

1. **Single-resource reads** (a `courseId`/`classId` is already pinned to one
   value): call `await assertCourseAccess(courseId, actor)`, which throws for a
   non-owning TEACHER. Same shape as `createExam`, `deleteVideo`, and the `8baa069`
   attendance fix.
2. **Cross-course list reads** (`listExams` takes an *optional* `courseId` filter
   and can span every course): add a silent `where`-clause scope by
   `course.teacherId === actor.userId` for `role === TEACHER`, the same style
   already used in that function for the STUDENT-enrollment filter a few lines
   above. No throw — a list just returns fewer rows, exactly like it already does
   for STUDENT.

### File-by-file changes

| File | Function | Change |
|---|---|---|
| `exam.service.ts:231` | `listExams` | Add `...(role === Role.TEACHER ? { course: { teacherId: actor.userId } } : {})` to the `where` object, next to the existing STUDENT filter. |
| `exam.service.ts:265` | `getExamById` | Add `await assertCourseAccess(exam.courseId, actor)` after `ensureExamExists`. |
| `video.service.ts:207` | `listVideosByClass` | Add `await assertCourseAccess(courseId, actor)` alongside the existing `assertStudentContentAccess` call (courseId is a single pinned param here, not a cross-course list). |
| `video.service.ts:251` | `getVideoById` | Add an `actor: AuthenticatedUser` parameter; add `await assertCourseAccess(video.classSession.courseId, actor)` before returning. Update both call sites: `generateStreamUrl` (`video.service.ts:282`) and `video.controller.ts:130`. |
| `video.service.ts:273` | `generateStreamUrl` | No direct change — covered once `getVideoById` enforces the check it now calls into. |
| `submission.service.ts:397` | `listSubmissions` | Change signature from `(examId, query, userId, role)` to `(examId, query, actor: AuthenticatedUser)`. Keep the existing `role === MARKER` → `ensureMarkerAssigned` branch; add `role === TEACHER` → `await assertCourseAccess(exam.courseId, actor)`. Update the controller call site (`submission.controller.ts:74`). |
| `class-session.service.ts:81` | `listClassSessions` | Add `await assertCourseAccess(classId, actor)` alongside the existing `assertStudentContentAccess` call. |
| `class-session.service.ts:104` | `getClassSessionById` | Same as above. |

No route or schema changes — all affected functions already receive `actor`/role
information; this only tightens what they do with it.

## Error handling

All new checks reuse `AppError('FORBIDDEN_COURSE', 403, ...)` — no new error code.
List-scoping functions never throw; they filter, matching the existing
STUDENT-enrollment precedent in the same functions. `ADMIN`/`SUPER_ADMIN` are
unaffected in every case (`assertCourseAccess` passes them through unconditionally).

## Testing (Vitest, per CLAUDE.md §3.4 — behavioral bugfix requires unit tests)

For each of the 8 changed spots, backend unit tests (mock `@/config/database`'s
`prisma`) covering:

- Owning TEACHER: unchanged success (regression guard).
- Non-owning TEACHER: `403 FORBIDDEN_COURSE` (single-resource) or filtered/empty
  result (list reads), per the table above.
- `SUPER_ADMIN`/`ADMIN`: unaffected (regression guard) — for `listSubmissions` and
  `listExams`, this also re-confirms the route/role gates found during
  investigation still apply (`ADMIN` can't reach exam/submission endpoints at all;
  this is a `requireRole` concern outside this file, not re-tested here).
- `listSubmissions` `MARKER` path: still gated by `ensureMarkerAssigned`, unaffected
  by the new TEACHER branch (regression guard).

System: backend `tsc --noEmit` + build clean, `npm run test` green. No frontend
changes, so no frontend test/build impact. Live-stack smoke: two teacher accounts
teaching different courses, confirm cross-course exam/video/submission/session
reads now 403 (or come back empty for `listExams`) where they previously
succeeded.

## Definition of done

- All 8 read paths scoped as above; `getVideoById`/`listSubmissions` signatures
  updated at both call sites.
- Backend Vitest covering owning/non-owning/privileged-role/MARKER-regression
  cases for each of the 8 spots.
- `tsc --noEmit` + build + existing test suite green.
- Live-stack smoke with two real teacher accounts confirms the fix.
- `context/api_endpoints/*.md` docs for exam/video/submission/class-session
  updated if any documented behavior (e.g. "any TEACHER may...") changes.
