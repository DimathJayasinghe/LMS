# Exam-read authorization hardening — Design

**Date:** 2026-07-17
**Status:** Design — awaiting review
**Type:** Bugfix (P0 launch-blocking security — see `context/documents/13-system-assessment-and-roadmap.md` §3.1)

## Problem

`backend/src/routes/exam.routes.ts` gates every exam route with an explicit `requireRole(...)`
**except the two read routes**: `GET /` (`listExams`) and `GET /:id` (`getExamById`) carry only
`verifyToken` + validation. In the service layer, the existing gates fall through for the two roles
nobody wrote a branch for:

- `assertStudentContentAccess` (`access.service.ts:38`) is a no-op for any non-`STUDENT`.
- `assertCourseAccess` (`class.service.ts:59-77`) throws only for a non-owning `TEACHER`.
- `listExams`'s `where` filter is applied only for `STUDENT` and `TEACHER`.

**Result:** a `MARKER` or a front-desk `ADMIN` can:
- **List every course's exams** (`listExams` returns unfiltered — metadata only, since `examListSelect`
  omits `mcqPayload`/`paperPdfUrl`, but still leaks the full exam catalog); and
- **Fetch any exam's detail** (`getExamById`) — which *does* include the **paper-PDF presigned URL**
  and the **full MCQ payload with correct answers** (`allowPaper` is true for any non-student;
  `mcqPayload` is stripped only for `STUDENT`) — for exams they have no relationship to.

This directly breaks the "secure exam delivery / MCQ answers hidden until publish" goal pillar
(`01-project-overview.md` §2, objective #3). It is **pre-existing** and was surfaced during the
`teacher-marker-visibility-scoping` final review (2026-07-15).

## Root cause (why this class of bug keeps happening)

The codebase's authorization idiom is **default-allow**: "gate the one role that should be
restricted; let every other role fall through." A role nobody wrote a branch for sees everything.
This same idiom produced the teacher-cross-course leaks fixed on 2026-07-15. The fix here closes the
exam-read instance **and** demonstrates the corrective pattern (`13` §4.1): **default-deny at two
independent layers** so safety is never coupled to a single check. (The broader sweep making *all*
content gates default-deny is tracked as a separate P0 spec; this one stays tight on exam reads.)

## Policy decisions (owner, 2026-07-17)

- **Front-desk `ADMIN`: no exam access at all.** ADMIN is the non-academic front-desk role
  (attendance + payments); it has no reason to see exam metadata, papers, or answers.
- **`MARKER`: assigned exams only, MCQ answer key stripped.** A marker grades written/typed answers
  (MCQ is auto-graded), so they need the **question paper** but never the **MCQ answer key**. They
  see only exams they are assigned to (`MarkerAssignment`).

Resulting per-role contract for exam reads:

| Role | `listExams` | `getExamById` |
|---|---|---|
| `SUPER_ADMIN` | all exams | full detail (paper + MCQ answers) |
| `TEACHER` | own courses' exams | own courses only (403 otherwise); full detail |
| `MARKER` | assigned exams only | assigned only (403 otherwise); paper **yes**, MCQ **answers stripped** |
| `STUDENT` | enrolled courses' exams | enrolled only; time-gated paper + answer-stripped MCQ (unchanged) |
| `ADMIN` | **403 — no access** | **403 — no access** |

## Design

### Layer 1 — route edge (allowlist / default-deny at the boundary)
Add `requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT)` to both `GET /` and
`GET /:id` in `exam.routes.ts`. This drops `ADMIN` entirely and makes the two read routes consistent
with every other route in the file.

### Layer 2 — service (explicit per-role, no fall-through)
The route is not the only guard — if it were ever misconfigured (which is exactly what happened
here), the service must still be safe.

**New shared gate — extract to `access.service.ts`:**
```ts
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
This is the exact logic currently private in `submission.service.ts` as `ensureMarkerAssigned`.
Move it to `access.service.ts` (the authz-gate module — already home to `assertStudentContentAccess`)
and have **both** `submission.service.ts` and `exam.service.ts` import it. DRY, centralizes authz per
`13` §4.1, and it lands under the new `access.service` tests (roadmap P0.6). `submission.service.ts`'s
`listSubmissions` swaps its private `ensureMarkerAssigned(userId, examId)` call for
`assertMarkerAssignedToExam(userId, examId)`; the private helper is deleted.

**New service-level allowlist guard** — a small module-private constant + check at the top of both
read functions:
```ts
const EXAM_READER_ROLES: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT,
]);
// at the top of listExams and getExamById, after resolving `role`:
if (!EXAM_READER_ROLES.has(role)) {
  throw new AppError('FORBIDDEN', 403, 'You do not have access to exam content.');
}
```
So `ADMIN` (and any hypothetical future role) is denied *in the service*, independent of the route.

**`listExams`** — add the missing `MARKER` branch to the `where`, alongside the existing STUDENT and
TEACHER branches:
```ts
...(role === Role.MARKER
  ? { markerAssignments: { some: { markerId: actor.userId } } }
  : {}),
```
(`Exam.markerAssignments` is the existing relation; `MarkerAssignment` has `@@unique([markerId, examId])`.)

**`getExamById`** — two additions:
1. After the `deletedAt` guard, assert marker assignment for markers:
   ```ts
   if (role === Role.MARKER) {
     await assertMarkerAssignedToExam(actor.userId, examId);
   }
   ```
2. Strip the MCQ answer key for markers too — change the payload branch:
   ```ts
   // before: role === Role.STUDENT ? stripMcqAnswers(parsed) : parsed
   mcqPayload = (role === Role.STUDENT || role === Role.MARKER)
     ? stripMcqAnswers(parsed)
     : parsed;
   ```
   The paper PDF already reaches markers via the existing `allowPaper = role !== Role.STUDENT || …`
   — correct and unchanged (markers need the question paper to grade written answers). The STUDENT
   time-gate (`mcqPayload = null` when `!isWithinWindow`) is unchanged and remains STUDENT-only.

### No schema, route-shape, or response-envelope changes
Only `requireRole` is added to two routes; the service signatures are unchanged. `MARKER_NOT_ASSIGNED`
and `FORBIDDEN` are existing `AppError` codes.

## Edge cases → tests (Vitest, per `04-ai-workflow-rules.md` §3.4)

Extend `backend/src/services/exam.service.test.ts` (exists from the teacher-scoping work; mock
`@/config/database` prisma + `@/services/class.service` + `@/services/access.service` — note the
marker gate now lives in `access.service`, so mock `assertMarkerAssignedToExam` there):
- `listExams`, `MARKER`: `where.markerAssignments` scopes to `{ some: { markerId } }`; a
  non-assigned marker's list comes back filtered.
- `listExams`, `ADMIN`: `403 FORBIDDEN` (service guard) — never reaches `findMany`.
- `getExamById`, `MARKER` assigned: `assertMarkerAssignedToExam` called; `mcqPayload` is
  answer-stripped (no `isCorrect` fields); paper PDF still present.
- `getExamById`, `MARKER` not assigned: `403 MARKER_NOT_ASSIGNED`, before any presigned-URL work.
- `getExamById`, `ADMIN`: `403 FORBIDDEN` (service guard).
- Regression: `SUPER_ADMIN`/`TEACHER` still get the full `mcqPayload` (with answers); `STUDENT`
  path (enrolled, time-gate, strip) unchanged.

For `access.service.ts` — add its **first** test file (`access.service.test.ts`, roadmap P0.6
partially satisfied) covering `assertMarkerAssignedToExam`: assigned → resolves; unassigned → `403
MARKER_NOT_ASSIGNED`. (The `assertStudentContentAccess` coverage is broader and can be its own task;
this spec adds at least the marker gate's tests since it introduces that function's new home.)

For `submission.service.ts` — its existing `listSubmissions` tests must still pass after swapping the
private `ensureMarkerAssigned` for the shared `assertMarkerAssignedToExam`. Since those tests mock
`prisma.markerAssignment.findUnique` (which the shared function also calls) and do **not** mock
`@/services/access.service`, the real shared function runs against the same mock — no test change
needed, but this must be verified, not assumed.

## Verification
Unit (backend) + `tsc --noEmit` + full `npm run test` green, then a live Docker-stack smoke: log in
as a MARKER assigned to exam A but not exam B, and a front-desk ADMIN, and confirm:
- ADMIN → `403` on `GET /exams` and `GET /exams/:id` (route-level).
- MARKER → `GET /exams` returns only exam A; `GET /exams/B` → `403 MARKER_NOT_ASSIGNED`;
  `GET /exams/A` returns the paper but an MCQ payload with **no `isCorrect`**.
- SUPER_ADMIN/TEACHER(own)/STUDENT(enrolled) unchanged (regression).

## Definition of done
- `requireRole` on both exam read routes (ADMIN excluded).
- `assertMarkerAssignedToExam` in `access.service.ts`; `submission.service.ts` uses it; its private
  `ensureMarkerAssigned` deleted.
- `EXAM_READER_ROLES` service guard on both read functions; `MARKER` scoping in `listExams`; marker
  assignment + MCQ-strip in `getExamById`.
- Vitest: exam.service cases above + `access.service.test.ts` for the marker gate; full suite green.
- Live-stack smoke confirms the per-role contract table.
- `context/api_endpoints/exams.endpoints.md` updated with the corrected per-role read contract.
