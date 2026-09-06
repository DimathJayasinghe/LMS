# Shared exams and customizable marker access

**Status:** owner-approved design; implementation pending, no product behavior changed.
**Date:** 2026-09-06. **Tracking:** [delivery #77](https://github.com/DimathJayasinghe/LMS/issues/77).
**Prerequisite:** reviewed, green [submission-integrity PR #79](https://github.com/DimathJayasinghe/LMS/pull/79).

## Confirmed requirements

- Target approximately 1,200 students; capacity must be measured, not assumed from that number.
- Teachers can create separate exam instances or share one instance across chosen centers and online students.
- Teachers may group participating centers and optionally restrict markers to selected centers/online groups.
- Markers may work across subjects/courses; physical-paper marks appear in the student's online record.
- Keep activity/error logs and accountable changes. No retention period or production cutover is authorized here.

## Design choice and boundaries

Recommend reusable, versioned paper content plus independent exam instances. Keep `Exam` as the instance
so existing exam URLs, submission uniqueness, ownership and publication remain instance-specific.
An instance belongs to one course; reuse across different teachers' courses is not implicitly authorized.
One instance can combine Center A, Center B and Online; another instance can use the same paper separately.
Each instance has its own roster, schedule, marker allocation and published results. Reuse never copies results.
Alternative: manually duplicate exam content. Simpler initially, but corrections and provenance drift.
Reject a mutable shared exam record with center filters alone: it cannot safely separate schedules/results.

This design extends the August Phase E plan where that plan assumes whole-exam-only marker access.
Keep its reusable marker groups, scoped management, previews and immutable assignment history.
Do not add a general-purpose permission engine, cross-subject shared grading, rankings or automatic retakes.

## Paper, audience and roster

- `ExamPaper` and immutable `ExamPaperRevision` hold teacher-owned content, type, total marks and private assets.
  Each instance pins a revision and immutable asset keys; no later upload may overwrite a pinned paper.
- `ExamAudience` identifies a selected physical center or named online group within that instance.
  Store physical-center identity explicitly; online groups have no fabricated center ID.
- Answer format (MCQ/written/hybrid) is separate from delivery. Each audience selects digital submission
  or staff-recorded physical paper; a mixed instance must support both without treating every student as INCLASS.
- `ExamParticipant` links one student to one audience in an instance; enforce unique `(examId, userId)`.
  Two course enrollments or two selected centers must not grant duplicate attempts in the same instance.
- Proposed first slice: the owning teacher/super-admin selects active course-enrolled students into a
  reviewed roster and explicitly assigns each to a center/online group. Bulk selection is paginated,
  previewed and deduplicated; it does not create submissions or mark missing students absent/zero.
  Reusing a prior owned-course roster requires enrollment revalidation and preview; never copy attempts/grants.
- Existing enrollment records do not identify a center, and self-entered barcodes are not enrollment proof.
  Do not silently infer center membership from barcodes, payments or timetable slots. A future verified
  course-center roster can prefill this picker, but is not required or invented by this exam slice.
- Students cannot change their roster audience. Validate enrollment when adding participants and again
  before a new online attempt. Staff may record historical physical work against the frozen exam roster
  even after enrollment ends; the exam roster is the historical eligibility evidence.
- Lock content, audiences and participant placement when an instance starts. Late enrollment, transfers
  or resits use a separate instance in this initial design, not silent moves of existing submissions.
  Published historical results remain readable by their owner after enrollment cancellation.

## Customizable marker permissions

Only the owning teacher or super-admin configures an exam allocation. Front-desk ADMIN, MARKER and
STUDENT cannot edit it. Managing a shared subject/center marker group remains super-admin-only;
teachers manage owned-course marker groups and may select authorized shared groups for their own exams.

- For each selected marker/group, require an explicit choice: whole current exam audience or selected
  audience groups. Restricted scope must be nonempty and entirely inside the target instance.
- A marker may inherit overlapping group allocations. Preview their combined effective scope, deduplicate
  them and highlight any whole-exam grant. A narrow allocation must never visually conceal a broader grant.
- Confirmation resolves groups into exact per-marker assignments and audience IDs. `MarkerAssignment`
  remains necessary, but is no longer sufficient for reading or grading a particular student's work.
- Store effective allowed audiences explicitly, including whole-current-exam selections; adding an audience
  must not silently expand existing grants. Group edits never change already confirmed exam assignments.
- A preview digest covers paper/roster/audience versions, group members, marker account state and current
  allocation revision. Reject stale confirmation with 409 and a refresh instruction.
- Confirmation is one transaction: revalidate teacher ownership and active markers, replace effective
  scope, and append an immutable actor/reason/source/before/after revision. Retries are idempotent.
- Check current account status/role and effective scope on every marker read and mutation. Removing a
  grant prevents new reads, download signing and marks immediately; already-issued private URLs may
  remain usable until their short expiry, which must be disclosed rather than called instant revocation.
- Match submission/participant audience and exam together; prevent cross-exam audience injection in both
  application checks and relational constraints. Empty/missing scope is deny, never whole-exam fallback.
- List rows, counts, search, answer URLs, physical-entry roster and grade endpoints use the same scope.
  An exam-detail permission alone must not reveal every student's work or other groups' workload.
- Keep current student/marker answer-key redaction. Marker restriction does not confer publication,
  correction-after-publication, roster editing, user administration or financial access.

## Physical result entry and concurrency

Assigned markers can enter physical results only for permitted roster participants. Owning teachers and
super-admins can enter them across their authorized instance. Preserve existing digital marking behavior.
Do not impersonate a student or call the student start-submission endpoint to manufacture physical work.
Physical entry requires a staff-recorded audience, a started exam, an eligible frozen participant and marks
within the instance total and an idempotency key. It records the real staff actor and entry timestamp.
Before publication, edits require the expected record version and preserve previous values in history.
After publication, only the existing owning-teacher/super-admin correction path with a reason is allowed.

Serialize student starts/completions, grading/entry, assignment changes and publication on the instance lock;
recheck permissions and publication inside the transaction, not just before a remote storage request.
A failed audit/revision insert must roll back the consequential change. Publish only after all recorded
completed work is graded and no upload is pending; empty roster positions do not become invented results.
After the upload grace period, the owning teacher/super-admin may audit-void an abandoned upload without
deleting its attempt. A voided attempt cannot complete or be graded; publication excludes voided uploads.
Keep one result per student/instance, with physical/digital origin and stable audience attribution.
Students see marks, feedback and grading time only after that instance publishes; siblings stay private.

## User experience and evidence

The staff flow is paper/version → separate or shared instance → centers/online groups → reviewed roster →
schedule and delivery → marker/group scopes → effective-access preview and reason → confirmation.
Use explicit labels such as "All 3 exam groups" and "Center A only", never a vague "Access" checkbox.
Explain overlaps, missing allocations, duplicate participants and stale previews inline; retain unsaved input.
Marker dashboards show only assigned work and scoped counts; physical-entry screens show only eligible
participants. Student pages show the assigned instance, venue/mode and whether they submit online or in person.

Membership/allocation revisions, roster confirmations, physical entries, grade edits and publication are
transactional, append-only academic evidence. Log IDs, actor, operation, time, reason and changed values
where needed; restrict detailed academic history to authorized staff. Operational/error logs exclude
tokens, signed URLs, answer payloads and unnecessary student data. Teacher scope never exposes global logs.
Use request correlation and failure outcomes; append-only database rules do not defeat a database administrator.
Independent retention/export/recovery evidence remains a separate release gate, not a claim of legal compliance.

## Compatibility and incremental delivery

1. Land PR #79. Add reusable marker groups and immutable membership events with no automatic answer access.
2. Add paper revisions, instance audiences and frozen-roster workflow together with schema/service/UI tests.
3. Extend preview/confirmation and all marker consumers to scoped assignments in one reviewed compatibility slice.
4. Add physical result entry and transactional academic history, then complete guided authoring and role UI.
5. Verify compiled multi-role workflows, migrations, concurrency, privacy, accessibility and representative load.

Use additive migrations. Preserve all existing exam IDs, submissions, marks and payment/enrollment relations.
Legacy exams retain explicit legacy course-wide eligibility and legacy whole-exam assignments; do not
invent their historical centers. Creating a new scoped instance requires an explicit confirmed roster.
Never let a legacy assignment endpoint erase scope or grant whole-exam access on a scoped instance.
Once scoped grants exist, old backend code cannot safely interpret them: rollout must stop old API/worker
processes, apply migration and start matching code. Rollback must preserve deny-by-default scoped checks;
do not roll back to a whole-exam-only binary or delete academic data. Prove this in isolated upgrade tests.

Required tests include all five roles, cross-teacher/cross-instance denial, dual enrollment deduplication,
physical/online mixed instances, overlapping marker groups, tampered IDs, inactive markers, stale previews,
assignment revocation, pending uploads versus publication, concurrent grade edits, audit rollback and
idempotent retries. Test direct URLs/counts as well as UI controls and preserve PR #79 privacy regressions.

## Subsequent owner-requested dashboard completion

After this exam/marking work, [issue #81](https://github.com/DimathJayasinghe/LMS/issues/81) covers all five roles.
Inventory every card/action/link against a real API, service guard and visible outcome; fix disconnected,
placeholder or missing role-appropriate flows in separate issue-linked PRs. Check loading/error/empty/retry,
mobile/keyboard use, direct URL denial and cross-user/course boundaries. Do not copy privileged features
to another role simply because its dashboard is sparse. Delivery is proven workflows, not visual parity.
