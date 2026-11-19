# Phase E Plan — Marker Groups and Guided Exam Assignment

**Checkpoint:** 2026-08-22  
**Status:** planning complete; implementation has not started  
**Baseline commit:** `dev` at `77fd410`

This document is the restart point for the next development session. Phase D is complete, deployed,
production-Docker verified, pushed, and green in GitHub CI. Phase E must be delivered as small vertical
slices; do not create the whole schema and UI in one unverified change.

## 1. Existing behavior to preserve

- `MarkerAssignment` is the exact exam-specific authorization source. A marker can read/grade an exam
  only when an `(examId, markerId)` row exists.
- Owning `TEACHER` and `SUPER_ADMIN` can list and atomically replace the exact marker set through
  `GET/PUT /api/exams/:id/markers`.
- Marker candidates come from the minimal academic directory and expose no private account fields.
- Teachers are restricted by `assertCourseAccess`; super-admin has global oversight.
- A marker cannot change grades after results are released. Owning teachers and super-admin can make
  reasoned, audited corrections.
- Front-desk `ADMIN`, `STUDENT`, and `MARKER` must not configure groups or assignments.
- Every consequential mutation must be audited and replay-safe with an `Idempotency-Key`.

Do not authorize dynamically from current group membership. Changing a reusable group after an exam is
assigned must not silently add or remove access to that exam.

## 2. Problems Phase E must solve

1. Staff currently select individual markers repeatedly for every exam.
2. There is no reusable group configuration or membership history.
3. Assignment confirmation has no resolved-list preview or workload context.
4. Exact replacement records the resulting rows, but not the group sources, resolved snapshot, diff,
   actor reason, or revision history.
5. Exam creation, paper/MCQ setup, marker assignment, review, and publication are separate experiences.

## 3. Authorization and ethical boundaries

- `SUPER_ADMIN`: create/read/update/deactivate any marker group; preview and confirm any exam assignment;
  view all assignment history.
- Owning `TEACHER`: manage course-scoped groups for owned courses; use subject-scoped groups only for
  subjects they are approved to teach; preview/confirm assignments only for owned-course exams.
- `ADMIN`: no marker-group or exam-assignment access. Front-desk duties do not justify access to exam
  papers, answer keys, grading allocation, or marker workload.
- `MARKER`: see only their final exam assignments and assigned work. They cannot browse group membership
  or other markers' workloads.
- `STUDENT`: no access.
- Only active, non-deleted users with role `MARKER` may be active members or resolved assignees.
- Workload indicators are operational counts, not performance rankings. Do not expose grades, feedback,
  student identities, or comparative productivity in the assignment picker.
- Conflict-of-interest must not be guessed from names or personal data. Until declarations exist, the
  preview can report only objective validation conflicts (inactive/wrong-role member, empty group,
  duplicate resolution, scope mismatch, or assignment load warning).

## 4. Proposed domain design

Names remain provisional until Slice E1 tests pin the contracts.

### Reusable configuration

- `MarkerGroup`
  - `id`, `name`, optional `description`
  - exactly one supported scope: `courseId`, `subjectId`, or `instituteId`; a future global scope is
    super-admin-only
  - `createdById`, `isActive`, `createdAt`, `updatedAt`, optional `deletedAt`
- `MarkerGroupMember`
  - current active membership: `groupId`, `markerId`, `addedById`, `addedAt`
  - unique `(groupId, markerId)`
- `MarkerGroupMembershipEvent`
  - immutable `ADDED`/`REMOVED` event with group, marker, actor, reason, and timestamp
  - preserves membership history without using deleted membership rows as authorization

### Exam-specific snapshot

Keep `MarkerAssignment` as the exact authorization table. Add an immutable assignment revision model,
provisionally `ExamMarkerAssignmentRevision`, containing:

- `examId`, monotonically increasing `revision`, `createdById`, `createdAt`, required `reason`
- selected individual marker IDs
- selected group snapshots (`groupId`, group name/scope, and member IDs at confirmation time)
- resolved unique marker IDs
- added and removed marker IDs compared with the previous exact set

Confirmation must use one database transaction to validate the current exam/group/member state, replace
the exact `MarkerAssignment` rows, and append the revision. A preview token or digest should prevent a
stale preview from being confirmed after membership or assignment state changes.

### Workload definition for the first release

For each candidate marker, return only:

- active/upcoming assigned exam count;
- submitted-but-ungraded work count across assigned exams;
- whether the candidate is already assigned to this exam.

This is advisory. Phase E does not allocate individual submissions, rank markers, or implement
round-robin/second-marker behavior.

## 5. Planned API surface

All routes require authentication. Mutation routes require `Idempotency-Key`.

- `GET /api/marker-groups` — scoped list with member counts.
- `POST /api/marker-groups` — create an authorized reusable group.
- `GET /api/marker-groups/:id` — group details and current active members.
- `PATCH /api/marker-groups/:id` — rename/edit/deactivate within scope.
- `PUT /api/marker-groups/:id/members` — replace the exact active member set with required reason;
  append immutable membership events.
- `GET /api/marker-groups/:id/history` — super-admin or authorized owning teacher.
- `POST /api/exams/:id/markers/preview` — accept individual IDs and group IDs; return resolved unique
  markers, objective conflicts, workload counts, current diff, and a stale-state digest. Read-only.
- `PUT /api/exams/:id/markers` — extend the current exact replacement contract to accept the preview
  digest, group/individual sources, and required reason; replace rows plus append a revision atomically.
- `GET /api/exams/:id/markers/history` — assignment revision history for super-admin/owning teacher.

For scoped instances, confirmation materializes only exact marker/audience grants. The digest covers the pinned paper revision, audience/roster revisions and versions, group membership revisions, active marker state, explicit direct/group sources, broad-versus-selected choice, and the displayed current diff. Changed evidence produces `409 MARKER_ALLOCATION_STALE`; unavailable sources also fail fresh validation. No missing audience is a whole-exam fallback. Legacy null-paper-revision exams retain their historical whole-exam marker assignments.

Task 3 repair (2026-09-07): preview, scoped PUT, and history now follow the specified `/markers` routes.
Assignment and audience composite foreign keys share `examId`. Revisions retain source, before/after,
version evidence and actor/exam-scoped idempotency keys; retries recheck ownership. Marker grade
responses recheck exact audience access before replay and use actor/resource-bound cache keys.
Allocation and isolated HTTP tests cover source/version staleness, replacement, revocation, counts,
new signed URLs, and answer redaction. Live PostgreSQL constraint/immutable-evidence proof remains a
CI gate; no local Docker run is attempted.

The legacy `POST /api/exams/:id/assign-markers` should be deprecated after all callers migrate; do not
remove it in the same change unless repository-wide usage and compatibility tests prove it safe.

## 6. Frontend plan

### Marker-group workspace

- Add a discoverable staff page linked from the exam/academic navigation.
- Show only groups the actor may manage.
- Create/edit/deactivate groups and replace members using the minimal marker directory.
- Make scope and current member count obvious; show empty/inactive states and mutation errors inline.
- Show membership history without private user data.

### Guided exam workflow

Refactor staff exam authoring into explicit steps while preserving existing create behavior:

1. Basics: owned class, title, type, marks, start/end time, and answer channels.
2. Content: MCQ builder and/or verified paper upload.
3. Markers: individuals and reusable groups.
4. Preview: resolved unique list, workload, validation warnings, additions/removals, and reason.
5. Review/publish: complete summary and explicit confirmation.

Editing must reuse the same workflow. Publishing should be a deliberate action, not an accidental side
effect of saving another field. Navigation away with unsaved changes should warn the user.

## 7. Incremental delivery slices

### E1 — Marker-group backend foundation

- Finalize schema constraints and migration/rollback notes.
- Add group/member/history schemas, service, controller, routes, audit constants, and role/scope tests.
- Exit gate: super-admin global behavior, teacher owned/approved scope, invalid-role denial, active-member
  validation, idempotent exact replacement, and immutable membership history all pass.

### E2 — Assignment preview and atomic snapshot

- Add workload aggregation, preview resolution/deduplication, stale-state digest, transactionally exact
  confirmation, revision history, and compatibility handling for the legacy endpoint.
- Exit gate: group membership changes after confirmation do not change exam access; stale preview is
  rejected; removed markers lose access; new markers gain access; diff/reason/source snapshot is durable.

### E3 — Marker-group frontend

- Add group list/editor/member selector/history UI with role-aware navigation and accessibility tests.
- Exit gate: owning teacher and super-admin complete the workflow; unauthorized roles cannot render or
  call it; error and empty states are usable.

### E4 — Guided exam authoring

- Consolidate create/edit/content/marker-preview/review/publish into the guided staff flow.
- Add unsaved-change protection and regression tests for existing MCQ/PDF/typed-answer combinations.
- Exit gate: create and edit paths work for owning teacher/super-admin without weakening student/marker
  read protections.

### E5 — Production gate and handoff

- Build fresh production backend/frontend Docker images.
- Run backend/frontend lint, type-check, full tests, production dependency audits, and production builds.
- Apply migrations to an isolated fresh database and prove legacy adoption/upgrade with zero drift.
- Deploy compiled Compose and smoke real role boundaries, group lifecycle, preview/confirm/history,
  exact marker access changes, audit events, and frontend SSR/workflows.
- Remove only exact smoke fixtures after verifying dependencies; retain audit history.
- Update endpoint docs, tracker, roadmap, and gap report; commit, push `dev`, and watch GitHub CI green.

## 8. Mandatory tests

- Role matrix for every route and service, including cross-teacher and actor/target checks.
- Group scope validation and exactly-one-scope constraint.
- Deleted/inactive/wrong-role marker rejection.
- Duplicate individual/group member resolution.
- Empty group and group deactivation behavior.
- Workload queries leak no student/grade/private-account data.
- Preview does not mutate; stale digest rejects confirmation.
- Confirmation transaction rolls back fully on any failure.
- Exact assignment remains the only marker authorization source.
- Membership changes after assignment do not alter existing exam access.
- Revision sequence, added/removed diff, sources, actor, reason, and audit metadata.
- Idempotent retry returns the original safe response without duplicate revisions.
- Frontend keyboard/label/error/empty/loading behavior and no unauthorized controls.

## 9. Explicitly deferred

- Per-submission allocation, alphabet/index ranges, round-robin, second markers, moderation, appeals,
  rubrics, and gradebook.
- Conflict-of-interest declarations and adjudication.
- Marker payout/productivity scoring.
- Standalone assignments outside exams.

These belong to later phases and must not be hidden inside Phase E migrations.

## 10. Work completed at this checkpoint

- Phase D was completed in `8ea133f` with the CI fixture correction in `77fd410`; replacement GitHub CI
  run `32552460436` passed.
- Phase E baseline was inspected: `Exam`, `MarkerAssignment`, exam services/routes/schemas, endpoint docs,
  current marker UI references, and the gap-analysis requirements.
- A structural Graphify pass analyzed 378 code files and produced 2,373 nodes/6,004 edges. Semantic
  document/image extraction was intentionally not continued, and six SQL files were not parsed because
  the optional SQL parser is absent. Treat this only as a navigation aid, not complete evidence.
- No Phase E schema, migration, backend, frontend, or production behavior has been changed.

## 11. Exact resume point

Start Slice E1 by writing failing service/schema authorization tests and a migration design for
`MarkerGroup`, `MarkerGroupMember`, and immutable membership events. Before migration creation, verify
whether `instituteId` means a physical teaching location or an organization-wide administrative scope;
do not silently treat those concepts as equivalent. Then implement only E1 and run its full production-
Docker gate before beginning assignment snapshots.
