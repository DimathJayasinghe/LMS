# Shared Exams and Scoped Marking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owning teacher create separate or shared course-exam instances for selected physical centers and online groups, maintain a frozen student roster, restrict marker access by audience when needed, and record physical-paper results safely in each student's online record.

**Architecture:** Preserve `Exam` as the result/publication instance and introduce immutable paper revisions for reusable content. Add explicit exam audiences and participants rather than inferring a center from a barcode, timetable, or payment. Resolve reusable marker groups into immutable per-exam/per-audience grants; every marker read or grade checks the exact grant and every consequential academic mutation writes transactional evidence.

**Tech Stack:** Next.js 16/React 19/TypeScript frontend; Express/TypeScript/Prisma 7/PostgreSQL backend; Redis idempotency locks; R2 direct PDF transfer; Vitest/RTL; Docker Compose.

**Spec:** [`2026-09-06-customizable-exam-marking-design.md`](../specs/2026-09-06-customizable-exam-marking-design.md)

## Global Constraints

- Land green, independently reviewed PR #79 before rebasing implementation work on `dev`; never weaken its enrollment, INCLASS, upload or unpublished-result protections.
- Branch each task from current `dev`; one task/PR, Conventional Commit, green local/CI gates and review before squash-merge into `dev`; preserve merged branches.
- Routes → controllers → services; only services import Prisma. All course-scoped reads and writes call `assertCourseAccess`; route role checks are not authorization proof.
- `SUPER_ADMIN` has global academic oversight; owning `TEACHER` manages owned-course groups/instances only; `ADMIN`, `MARKER`, and `STUDENT` cannot configure groups, rosters or allocations.
- For new scoped instances, missing participant/audience/grant is deny-by-default. Legacy exams retain legacy whole-course eligibility and legacy whole-exam assignment until explicitly migrated through a safe feature flow.
- Every consequential mutation requires `Idempotency-Key`, an actor/reason where the spec requires it, unit actor×target/state tests, and transactional academic evidence. Pino errors must exclude tokens, signed URLs and answer payloads.
- Use additive Prisma migrations. Prove fresh deploy, legacy adoption, upgrade, zero drift and rollback compatibility on isolated PostgreSQL. Never delete historical exams/submissions/results to roll back.
- Frontend changes require reading `frontend/AGENTS.md` and the installed Next.js documentation first. Follow existing API envelope, accessible controls, inline error/retry/loading/empty states, and direct-URL backend denial tests.

---

## File Map

| Area | Files | Responsibility |
|---|---|---|
| Marker groups | `backend/prisma/schema.prisma`, a new migration, `marker-group.{schema,service,controller,routes}.ts`, `access.service.ts` | Scoped reusable groups, active members, immutable events and ownership gates. |
| Paper/instance audiences | `exam-paper.*`, `exam-audience.*`, `exam.service.ts`, `exam.schema.ts`, `exam.routes.ts`, migration | Reusable pinned content, selected centers/online groups, reviewed frozen roster and student eligibility. |
| Marker allocation | `exam-marker-allocation.*`, `access.service.ts`, `submission.service.ts`, `exam.service.ts`, migration | Preview digest, effective per-audience marker grant, revisions and shared enforcement. |
| Physical marks/evidence | `submission.service.ts`, `submission.schema.ts`, `submission.routes.ts`, `submission.controller.ts`, migration | Staff-entry endpoint, submission origin, optimistic edits, academic-event records and publish interlock. |
| Staff/student UI | `frontend/app/(app)/exams/**`, `frontend/app/(app)/submissions/**`, `frontend/lib/types.ts`, focused RTL tests | Guided instance workflow, allocation preview, restricted marker roster and student venue/mode views. |
| Documentation/operations | `context/api_endpoints/*.md`, `06-progress-tracker.md`, Compose smoke fixture | Accurate contracts, release evidence and reproducible role-boundary proof. |

## Task 0: Establish the implementation baseline

**Files:**
- Modify: `context/documents/06-progress-tracker.md`
- Modify: GitHub issue #77
- Verify: PR #79 and `origin/dev`

**Consumes:** approved design and green PR #79.

**Produces:** a documented SHA from which every implementation branch begins.

- [ ] **Step 1: Verify the prerequisite before integration**

Run:

```bash
gh pr view 79 --json state,mergeStateStatus,statusCheckRollup
git fetch origin dev
git log -1 --format='%H %s' origin/dev
```

Expected: PR #79 has Backend, Frontend and Quality Gate success; it must be reviewed and squash-merged by the authorized integrator before feature work branches from its resulting `dev` SHA.

- [ ] **Step 2: Reconcile the tracker without copying stale evidence**

Record the merge SHA, PR number and the fact that its 295 backend/105 frontend tests apply only to the merged commit. Keep provider, recovery, retention and capacity gates open.

- [ ] **Step 3: Create the first feature branch from merged `dev`**

```bash
git switch dev
git pull --ff-only origin dev
git switch -c feature/marker-groups
```

Expected: a clean branch with no unrelated dashboard or notification work.

## Task 1: Deliver reusable marker groups with immutable membership history (E1)

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/index.ts`, `backend/src/services/access.service.ts`, `backend/src/utils/constants.ts`
- Create: `backend/prisma/migrations/<timestamp>_marker_groups/migration.sql`
- Create: `backend/src/schemas/marker-group.schema.ts`, `backend/src/services/marker-group.service.ts`, `backend/src/controllers/marker-group.controller.ts`, `backend/src/routes/marker-group.routes.ts`, `backend/src/services/marker-group.service.test.ts`
- Modify: `context/api_endpoints/exams.endpoints.md`, `context/documents/06-progress-tracker.md`

**Consumes:** course ownership gate and current exact `MarkerAssignment` behavior.

**Produces:** `MarkerGroup`, current `MarkerGroupMember`, append-only `MarkerGroupMembershipEvent`, and authenticated group APIs. No group membership grants answer access in this task.

- [ ] **Step 1: Write failing service tests for the authorization matrix**

Cover: super-admin any course/subject/center group; owner teacher only course-scoped group for own course; cross-course teacher 403; ADMIN/MARKER/STUDENT 403; inactive/deleted/wrong-role marker rejected; duplicate IDs deduplicated; missing/repeated group behavior; required reason; read history scope; and transaction rollback when one requested member is invalid.

```ts
await expect(replaceMarkerGroupMembers('group-a', {
  markerIds: ['marker-a', 'not-a-marker'], reason: 'Semester allocation',
}, teacher)).rejects.toMatchObject({ code: 'INVALID_MARKER_IDS' });
expect(tx.markerGroupMember.update).not.toHaveBeenCalled();
expect(tx.markerGroupMembershipEvent.create).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the focused test and confirm it fails before implementation**

Run:

```bash
cd backend && npm test -- marker-group.service.test.ts
```

Expected: FAIL because the service/module does not exist.

- [ ] **Step 3: Add additive schema and migration constraints**

Define `MarkerGroupScope` (`COURSE`, `SUBJECT`, `INSTITUTE`) and membership-event action enum. `MarkerGroup` carries exactly one nullable foreign key selected by scope; the SQL migration adds a PostgreSQL `CHECK` tying scope to exactly one FK. `MarkerGroupMember` has unique `(groupId, markerId)`, `removedAt`, `addedById`, `removedById`; events have group, marker, action, actor, reason and timestamp. Add immutable trigger rejecting event update/delete.

```sql
ALTER TABLE "MarkerGroup"
  ADD CONSTRAINT "marker_group_scope_matches_target"
  CHECK (
    ("scope" = 'COURSE' AND "courseId" IS NOT NULL AND "subjectId" IS NULL AND "instituteId" IS NULL)
    OR ("scope" = 'SUBJECT' AND "courseId" IS NULL AND "subjectId" IS NOT NULL AND "instituteId" IS NULL)
    OR ("scope" = 'INSTITUTE' AND "courseId" IS NULL AND "subjectId" IS NULL AND "instituteId" IS NOT NULL)
  );
```

- [ ] **Step 4: Implement one scoped service and route/controller layer**

`createMarkerGroup`, `listMarkerGroups`, `getMarkerGroup`, `updateMarkerGroup`, `replaceMarkerGroupMembers`, and `listMarkerGroupHistory` must first resolve group/course ownership. Replacement executes validation, member activate/deactivate, event append and durable group revision update inside `prisma.$transaction`; it returns a minimal marker directory only. Mount `/api/marker-groups`; every mutation validates a Zod body and uses `checkIdempotency`.

```ts
await tx.markerGroupMembershipEvent.create({
  data: { groupId, markerId, action: 'REMOVED', actorId: actor.userId, reason: input.reason },
});
```

- [ ] **Step 5: Prove the tests and migration behavior**

Run:

```bash
cd backend && npm test -- marker-group.service.test.ts && npm run lint && npx tsc --noEmit
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: role/state tests pass, migration applies and drift is zero. Attempting direct event update/delete in an isolated DB must fail.

- [ ] **Step 6: Commit and open a focused PR**

```bash
git add backend context
git commit -m 'feat(markers): add scoped reusable groups'
git push -u origin feature/marker-groups
gh pr create --base dev --title 'feat(markers): add scoped reusable groups'
```

## Task 2: Add reusable paper revisions, explicit audiences and frozen participant rosters

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/services/exam.service.ts`, `backend/src/schemas/exam.schema.ts`, `backend/src/routes/exam.routes.ts`, `backend/src/controllers/exam.controller.ts`, `backend/src/services/access.service.ts`
- Create: migration `..._exam_papers_audiences.sql`, `exam-paper.{schema,service,controller,routes}.ts`, `exam-audience.{schema,service,controller,routes}.ts`, `exam-paper.service.test.ts`, `exam-audience.service.test.ts`
- Modify: `context/api_endpoints/exams.endpoints.md`, tracker

**Consumes:** E1 group model and existing `Exam`/`Submission` records.

**Produces:** pinned reusable paper revisions, selected center/online audiences, explicit participant roster, and a single student eligibility gate for new scoped attempts.

- [ ] **Step 1: Pin contract tests before schema work**

Write failing tests for paper ownership/version immutability, teacher cross-course denial, duplicate participant across selected audiences, inactive/non-enrolled participant rejection, online audience without `instituteId`, physical audience with an active institute, roster lock at start, and legacy exam behavior.

```ts
await expect(replaceExamParticipants('exam-a', {
  assignments: [
    { userId: 'student-a', audienceId: 'center-a' },
    { userId: 'student-a', audienceId: 'online' },
  ], reason: 'Final roster', expectedRevision: 3,
}, teacher)).rejects.toMatchObject({ code: 'DUPLICATE_PARTICIPANT' });
```

- [ ] **Step 2: Add compatible paper/audience/participant tables**

Create `ExamPaper`, `ExamPaperRevision`, `ExamAudience` and `ExamParticipant`. Add nullable `paperRevisionId` and `audienceRevision`/`rosterRevision` to `Exam`; retain legacy content fields and legacy submissions. `ExamAudience` owns delivery mode `ONLINE|PHYSICAL`, optional physical `instituteId`, and a unique `(id, examId)` relation key. `ExamParticipant` references `(audienceId, examId)` and has unique `(examId, userId)`.

```prisma
model ExamParticipant {
  id         String @id @default(uuid())
  examId     String
  audienceId String
  userId     String
  audience   ExamAudience @relation(fields: [audienceId, examId], references: [id, examId], onDelete: Restrict)
  @@unique([examId, userId])
}
```

- [ ] **Step 3: Implement paper revision and roster services**

Only an owning teacher/super-admin creates paper revisions and instances. New scoped instances pin one revision. `replaceExamAudiences` and `replaceExamParticipants` require reason + expected revision, reject started/published/deleted instances, run serializable transactions, return 409 `EXAM_CONFIGURATION_STALE` on revision mismatch and write transactional academic events. Selection APIs return paginated minimal eligible students; they never resolve a center from barcode/timetable/payment.

- [ ] **Step 4: Wire student access to roster without breaking legacy exams**

Extend the exam/submission access helper: if `paperRevisionId` is null, retain the existing active-course enrollment behavior; if non-null, require matching `ExamParticipant`, matching audience delivery mode and active enrollment for new online submission starts. A cancelled enrollment never erases historical participant/result reads. Add direct tests for tampered audience, duplicate enrollment modes and unlisted enrolled student.

- [ ] **Step 5: Verify fresh and upgrade paths**

Run focused tests, all backend lint/type/build, fresh migration deploy and a legacy fixture upgraded from the six existing migrations. Confirm legacy exam IDs/submissions/marks read unchanged and new scoped instance creation cannot fall back to course-wide enrollment.

- [ ] **Step 6: Commit and PR**

```bash
git commit -am 'feat(exams): add paper revisions and rosters'
git push -u origin feature/exam-audiences
```

## Task 3: Resolve marker groups into immutable scoped assignment revisions (E2)

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/services/access.service.ts`, `backend/src/services/exam.service.ts`, `backend/src/schemas/exam.schema.ts`, `backend/src/routes/exam.routes.ts`, `backend/src/controllers/exam.controller.ts`
- Create: migration `..._exam_marker_allocations.sql`, `exam-marker-allocation.service.ts`, `exam-marker-allocation.service.test.ts`
- Modify: `backend/src/services/submission.service.ts`, `context/api_endpoints/exams.endpoints.md`, `context/api_endpoints/submissions.endpoints.md`, tracker

**Consumes:** marker groups and scoped audiences.

**Produces:** preview digest, resolved grants, assignment revisions and one shared `assertMarkerAssignedToExamAudience` gate.

- [ ] **Step 1: Write failing allocation tests**

Cover direct marker + group sources, group-member deduplication, group changes after confirmation, broad + narrow overlap, empty selected audience, marker deactivation, stale digest, cross-teacher/cross-exam audience ID, exact removal, historical revision content and idempotent retry.

```ts
await expect(confirmMarkerAllocation('exam-a', {
  previewDigest: staleDigest,
  selections: [{ source: { groupId: 'group-a' }, audienceIds: ['center-a'] }],
  reason: 'Split marking by center',
}, teacher)).rejects.toMatchObject({ code: 'STALE_MARKER_ALLOCATION' });
```

- [ ] **Step 2: Model effective grants and immutable revisions**

Keep `MarkerAssignment` for legacy whole-exam compatibility. Add `ExamMarkerAssignmentRevision`, immutable source/diff JSON, and `MarkerAssignmentAudience` keyed to assignment + audience. An explicit `allAudiences` flag is stored on the revision/grant rather than treating an empty row set as broad access. The migration backfills legacy assignments as explicit all-audience legacy grants only for legacy exams; it does not grant new scoped audiences through missing rows.

- [ ] **Step 3: Implement preview and confirm endpoints**

Add `POST /api/exams/:id/markers/preview`, scoped `PUT /api/exams/:id/markers`, and `GET /api/exams/:id/markers/history`. Preview returns minimal marker identity, effective audiences, ungraded-work count, current diff and SHA-256 digest over current group/member/audience/configuration versions. Confirmation repeats all validation in one serializable transaction, increments revision, writes immutable event records and replaces grants atomically.

- [ ] **Step 4: Replace binary marker checks across every answer-bearing path**

```ts
export const assertMarkerAssignedToExamAudience = async (
  markerId: string, examId: string, audienceId: string,
): Promise<void> => {
  const grant = await prisma.markerAssignmentAudience.findFirst({
    where: { assignment: { markerId, examId }, audienceId }, select: { id: true },
  });
  if (!grant) throw new AppError('MARKER_NOT_ASSIGNED_TO_AUDIENCE', 403, 'You are not assigned to this exam group.');
};
```

Use it in submission list/detail/download/grade, physical-entry roster and marker exam detail. Query-level scope must match the service assertion. Existing marker routes keep exact whole-exam behavior only for legacy instances.

- [ ] **Step 5: Verify revocation and privacy**

Run unit tests then isolated HTTP tests with two centers and one online audience: restricted marker sees only assigned rows/counts and cannot sign/download/grade another audience; removing a grant immediately denies fresh reads. Confirm answer-key and unpublished-grade redactions remain intact.

- [ ] **Step 6: Commit and PR**

```bash
git commit -am 'feat(markers): scope exam allocations by audience'
git push -u origin feature/scoped-marker-allocations
```

## Task 4: Add staff-entered physical-paper results and immutable academic evidence

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/services/submission.service.ts`, `backend/src/schemas/submission.schema.ts`, `backend/src/routes/submission.routes.ts`, `backend/src/controllers/submission.controller.ts`, `backend/src/utils/constants.ts`
- Create: migration `..._physical_results_academic_events.sql`, `submission.physical-results.test.ts`
- Modify: `context/api_endpoints/submissions.endpoints.md`, tracker

**Consumes:** scoped roster, effective marker-audience gate and existing published-result correction rules.

**Produces:** staff-originated physical result records, versioned grade edits and transactionally persisted academic events.

- [ ] **Step 1: Write failing physical-result tests**

Cover assigned marker allowed only for PHYSICAL permitted participant; online audience denial; own-course teacher/super-admin allowed; ADMIN/STUDENT/other marker denied; duplicate entry conflict/replay; marks above total; unpublished/started/deleted checks; expected-version conflict; publish race; correction after publication requiring reason; and rolled-back mutation when academic-event write fails.

- [ ] **Step 2: Add origin/version/evidence schema with an append-only trigger**

Add `SubmissionOrigin` (`ONLINE`, `PHYSICAL`), nullable participant reference for legacy records, `enteredById`, `version`, and `AcademicEvent` with actor, action, target, reason, before/after JSON and timestamp. The migration defaults existing submissions to `ONLINE`, backfills version `1`, and rejects `UPDATE`/`DELETE` of `AcademicEvent` in PostgreSQL. Do not repurpose fire-and-forget `AuditLog` as academic evidence.

- [ ] **Step 3: Implement physical entry and pre-publication edit services**

Expose `POST /api/submissions/exam/:examId/physical-results` and `PATCH /api/submissions/:id/physical-result` with Zod schemas, role gate and idempotency middleware. In a serializable transaction, lock/recheck instance state, participant/audience grant, total marks and expected version; create/update the `Submission` and `AcademicEvent` together. Existing post-publication correction service remains owning teacher/super-admin only, requires reason, increments version and also appends academic evidence.

- [ ] **Step 4: Make publication aware of pending/voided uploads and entry races**

Refactor `publishResults` to recheck its state in the same transaction and reject while non-voided `UPLOADING` submissions exist. Add a staff-only audit-void operation for abandoned uploads after grace; record why and preserve the original submission. Publish cannot manufacture results for roster members without submissions.

- [ ] **Step 5: Verify and document**

Run focused tests plus full backend gates. In isolated PostgreSQL, prove academic-event update/delete fails and a forced event-write failure leaves no physical grade. Update endpoint docs with roles, idempotency, response masking and correction rules.

- [ ] **Step 6: Commit and PR**

```bash
git commit -am 'feat(submissions): record physical paper results'
git push -u origin feature/physical-paper-results
```

## Task 5: Build the guided staff workflow and scoped marker/student experiences (E3–E4)

**Files:**
- Modify: `frontend/app/(app)/exams/new/_components/ExamForm.tsx`, `frontend/app/(app)/exams/[examId]/**`, `frontend/app/(app)/submissions/[examId]/**`, `frontend/lib/types.ts`, `frontend/lib/nav.ts`
- Create: `frontend/app/(app)/marker-groups/**`, `ExamAudienceRosterStep.tsx`, `MarkerAllocationStep.tsx`, `PhysicalResultEntry.tsx`, focused `.test.tsx` files
- Modify: frontend pages that fetch the above, endpoint docs, tracker

**Consumes:** Tasks 1–4 APIs. Read `frontend/AGENTS.md` and local Next.js docs before changing frontend files.

**Produces:** a keyboard-accessible teacher workflow and no-leak marker/student views.

- [ ] **Step 1: Write RTL tests before components**

Test owner teacher can create a course group but cannot select another course; center/online audience labels, duplicate participant warning, mandatory allocation reason, broad-over-narrow effective-access warning, stale-preview retry, unsaved-change warning, marker row filtering, physical-entry error/version conflict, and student venue/mode presentation. Include hidden-control and direct backend denial coverage.

- [ ] **Step 2: Add marker-group workspace**

Create a role-aware route linked only for owning teachers/super-admin. It lists scoped groups, supports create/edit/deactivate, member replacement with reason and history, and displays no private user fields. Failed mutations leave entered values intact and give a retry path.

- [ ] **Step 3: Convert exam authoring into explicit instance steps**

Use draft state for: paper/version → instance basics → centers/online audiences → roster → marker sources/scopes → preview/reason → review. Do not publish on save. Existing legacy create/edit stays available until the new workflow is feature-complete; neither path may create a scoped instance without a frozen roster.

- [ ] **Step 4: Scope marker and student surfaces**

Markers see assigned audience labels and only permitted submissions/counts. Physical result entry is shown only for authorized PHYSICAL roster members. Students see their assigned audience/venue/mode and the existing result privacy behavior. Do not put API keys/object keys/answer keys in rendered HTML.

- [ ] **Step 5: Run frontend verification**

Run:

```bash
cd frontend && npm test -- --maxWorkers=2 && npm run lint && npx tsc --noEmit && npm run build
```

Expected: existing 105 tests remain green plus new workflow coverage; build has no SSR access errors.

- [ ] **Step 6: Commit and PR**

```bash
git commit -am 'feat(exams): add scoped marking workflow'
git push -u origin feature/scoped-marking-workflow
```

## Task 6: Run the Phase E production gate and perform the dashboard audit (#81)

**Files:**
- Create: `docs/reports/2026-09-06-role-dashboard-workflow-audit.md`, isolated smoke script/Compose fixture
- Modify: endpoint docs, tracker and the individual frontend/backend files identified by evidence

**Consumes:** merged Tasks 1–5.

**Produces:** release evidence for the feature and a verified, issue-linked inventory of dashboard gaps; each confirmed gap becomes a focused PR rather than an unbounded redesign.

- [ ] **Step 1: Prove migrations and compiled stack**

Build fresh backend/frontend images, run migrations against fresh and legacy-adoption isolated PostgreSQL, assert zero drift, start disposable PostgreSQL/Redis/backend/frontend containers, and remove only those named disposable fixtures after testing. Cover all five roles, two centers, online audience, overlapping marker scopes, physical result entry, publication and direct-URL/API denial.

- [ ] **Step 2: Audit each role dashboard end to end**

For SUPER_ADMIN, TEACHER, ADMIN, MARKER and STUDENT, inventory every visible card/action/link. Trace UI request → route → Zod validation → service scope → database side effect → refreshed visible outcome. Record whether it is complete, missing, placeholder, incorrectly scoped or intentionally unavailable, with source/API evidence. Test loading, empty, error, retry, expired session, mobile and keyboard states.

- [ ] **Step 3: Split and implement only verified dashboard gaps**

For every non-complete item, create/associate a GitHub issue and one bounded branch/PR. A sparse dashboard is not grounds to expose another role's admin/financial/academic data. Repeat direct URL/API negative tests after every gap fix.

- [ ] **Step 4: Complete release evidence without overclaiming**

Run backend/frontend full gates, dependency audits, migration proof, compiled browser smoke and accessibility checks. Update the tracker with exact counts, image/tag/SHA and limits. Keep branch protection, provider readiness, restore drill, log-retention/export and representative 1,200-student capacity measurements open until actually proven.

## Plan Self-Review

- **Spec coverage:** Tasks 1–5 map respectively to marker groups, paper/audience/roster, restricted marker allocation, physical results/evidence, and guided UI. Task 6 maps to the requested role-dashboard audit and production verification.
- **Safety coverage:** Every new access decision is server-side and deny-by-default; legacy data stays compatible; migrations are additive; group edits cannot alter a confirmed exam grant; audit events are transactional rather than fire-and-forget.
- **Boundary coverage:** Tests explicitly include all roles, ownership, audience tampering, stale revision/digest, duplicate participants, revocation, publication races, privacy redaction, idempotency and direct routes.
- **Scope coverage:** Dashboard fixes are explicitly postponed until the exam/marking tasks are integrated and must be evidence-driven in separate PRs.
