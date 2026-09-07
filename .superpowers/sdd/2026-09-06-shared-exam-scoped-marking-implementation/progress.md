# SDD ledger — plan: /home/dimathrj/Documents/dev_projects/LMS/docs/superpowers/plans/2026-09-06-shared-exam-scoped-marking-implementation.md

## Pre-flight interface scan

| Tasks | Produced interface / state | Consuming task | Finding / ruling |
|---|---|---|---|
| 0 → 1 | Submission-integrity baseline at `66d58aa` | Marker group implementation | Complete; squash-merged as PR #79. |
| 1 → 2 | Reusable `MarkerGroup` model; group membership remains configuration only | Paper/audience/roster slice | Compatible. Audiences/rosters must not derive access from groups. |
| 2 → 3 | `ExamAudience`, `ExamParticipant`, roster/audience revisions and audience composite key | Scoped marker allocations | Compatible. Ruling: allocation scope must bind both audience ID and exam ID; cost if wrong: cross-exam audience injection. |
| 2 → 4 | Frozen participant roster and delivery mode | Physical result entry | Compatible. Ruling: any instance with ONLINE audience rejects legacy `INCLASS`; cost if wrong: online students receive an unstartable instance. |
| 3 → 4 | Exact marker/audience scope | Physical marking and answer-bearing reads | Compatible. Empty scope remains deny-by-default. |
| 4 → 5 | Physical-result API and academic evidence | Guided frontend | Compatible. Post-publication correction stays teacher/super-admin only. |
| 5 → 6 | Guided role-specific workflow | Compiled role smoke and dashboard audit | Compatible. Audit is workflow-based, not visual parity. |

| Task | Internal consistency finding |
|---|---|
| 2 | Paper revision, explicit audience and roster are additive; `paperRevisionId` distinguishes scoped instances from legacy course-wide exams. |
| 3 | Preview and confirmation consume the same audience IDs and configuration versions. |
| 4 | Physical entry/evidence/publication checks share one transactional instance lock. |
| 5 | UI uses only delivered APIs and retains direct backend denial. |
| 6 | Final verification follows all feature integration. |

Task 0: complete (PR #79 squash-merged into `dev` at `66d58aa`).
Task 1: complete (PR #83 squash-merged into `dev` at `a7ab026`; GitHub CI passed fresh PostgreSQL deployment, zero drift, direct immutable-event trigger proof, legacy-adoption migration, backend/frontend lint/tests/build and quality gate).
Task 2: implemented locally on `feature/exam-audiences` (base `a7ab026`); focused tests, lint, type/build, Prisma validation/generation and from-empty schema diff passed. PostgreSQL deploy/drift/legacy-upgrade proof remains CI-only because Docker/PostgreSQL is unavailable locally.
Task 2: review failed — five findings: (1) scoped `Exam` patch can mutate copied paper content despite `paperRevisionId`; (2) `ExamPaperRevision` lacks DB UPDATE/DELETE immutability; (3) scoped starts check eligibility outside a transaction/instance lock; (4) audience replacement deletes parent rows while a roster exists, causing PostgreSQL FK failure; (5) roster/configuration revisions are not returned/recoverable. Ruling: scoped instances reject content/course changes after pinning; use an immutable PostgreSQL trigger and rollback-only CI proof. Audience changes with an existing roster require explicit replacement participant assignments and both revisions in the same transaction—never silently erase a roster. Starts serialize on the instance advisory lock and recheck all eligibility inside the transaction. Cost if wrong: altered assessment provenance, duplicate/unauthorized starts, or accidental roster loss.
Task 2: re-review failed — (1) `confirmExamPaper` still mutates the copied PDF URL of a scoped pinned instance; (2) participant replacement controller discards configuration/revision recovery data; (3) the legacy-adoption CI migration check does not seed/assert preservation of a legacy Exam/Submission/mark; (4) paper revision versions use an out-of-transaction count and can race to a raw unique error. Ruling: reject every content mutation path for a pinned scoped instance; return the service configuration view consistently; extend isolated legacy CI with pre-upgrade fixture and post-upgrade preservation assertions; serialize revision numbering under a paper lock. Cost if wrong: altered exam evidence, unusable stale recovery, unproven destructive upgrade, or retry-hostile version conflicts.
