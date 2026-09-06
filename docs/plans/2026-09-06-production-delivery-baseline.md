# Production delivery baseline and release plan

**Date:** 2026-09-06

**Source baseline:** `dev` / `8fcd98880db4c76aac4c90b875fb06c07e033227`

**Status:** owner capacity/physical-marking clarification recorded; submission integrity verified; release gates remain open

**Delivery issue:** [#77](https://github.com/DimathJayasinghe/LMS/issues/77)

## Owner clarification and execution update

The owner subsequently confirmed **1,200 students** as the target and authorized reasonable design
adjustments. Physical-center paper marking must be supported with marks visible in the student's
online academic record. A marker may work across multiple subjects/courses; membership must not be
restricted to one subject. The owner requested system activity/error logs and a review of logical
privileges, edge cases, and frontend/backend usability.

Use exact exam assignments for access. Teachers manage owned-course groups; shared subject/center
group configuration remains super-admin-managed to avoid one teacher changing another's allocations.
Physical paper result entry must record the real staff actor and use the same publication/privacy
rules as online results. Add that missing path to Phase E before declaring physical marking complete.
No Zoom deferral was reconfirmed; retain the live-class implementation and verify its provider setup
before claiming it ready. Audit coverage/durability and safe operational logs are required; this
clarification does not establish a legal retention period or authorize destructive log cleanup.

PR #78 passed CI and independent review and was squash-merged into `dev` (`69656fa`); its branch was
retained. Docker Desktop has since been started and both production builder images compile. The
earlier local-host Turbopack restriction persists, so compiled verification uses isolated Docker.
Submission integrity bugs found while reviewing the physical-paper path take priority before E1.
The focused patch passed independent review, 295 backend tests, 105 frontend tests, both production
builder images, and 21 compiled HTTP/database/SSR assertions with disposable PostgreSQL/Redis.
All six migrations apply to the isolated database. No live provider calls or production deployment
were exercised; production readiness still requires the release gates below.
The sections below preserve the original discovery checkpoint and its then-unanswered questions.

## Product and architecture

Academic LMS serves one Sri Lankan tuition institution with multiple teachers and physical centers.
Students enroll and pay per course, attend physical/live/recorded lessons, take mixed-format exams,
and receive marked results. Teachers manage owned courses; markers see exact assigned exams;
front-desk admins handle operational attendance/payments; the super-admin provides global oversight.
Physical centers are locations within the institution, not separate tenants.

Preserve the Next.js/React frontend and Express/Prisma service-layer backend, PostgreSQL, Redis,
BullMQ worker, and single-VPS Compose architecture. Preserve direct R2/Bunny transfers, signed
provider access, cookie authentication, server-authoritative exam time, and soft deletion.
Current frontend dependencies do not include the older docs' proposed Zustand/React Query/Axios
stack. Do not add those packages merely to satisfy stale checkboxes.

Implemented source and the August checkpoints cover auth, ownership, course artwork/materials,
timetable, embedded-live wiring, exams, exact marker assignment, result corrections, payments,
attendance, notifications, audit reads/writes, migrations, backup tooling, and CI. Their presence
does not prove current deployment health or complete end-to-end readiness.

## Evidence and decision conflicts

- Latest `dev` CI is green: [run 32581060718](https://github.com/DimathJayasinghe/LMS/actions/runs/32581060718).
  `.github/workflows/ci.yml` includes lint, tests, builds, and fresh/legacy migration/drift checks.
- [PR #72](https://github.com/DimathJayasinghe/LMS/pull/72) is the only open PR at inspection.
  Its July body predates implemented CI and authorization fixes. Its latest commit records owner
  input for a roughly 500-student MVP, Zoom deferred, and working Bunny/R2 credentials. Newer docs
  still describe 1,200 students and invalid credentials. Confirm release capacity/Zoom scope;
  verify providers in staging before changing these claims. Do not merge the old assessment as-is.
- GitHub returned `Branch not protected` for both `dev` and `main`; repository rulesets were empty.
  The documented workflow is therefore not enforced by GitHub at this checkpoint.
- No open GitHub issues existed before this delivery-tracking work.
- `backend/src/services/audit.service.ts` deliberately uses fire-and-forget writes: a primary
  mutation can succeed while its audit insert fails. An error log is not a durable audit record.
- Checked-in migrations protect `PaymentAdjustment` against update/delete; no equivalent trigger
  protects `AuditLog`. This is an implementation finding, not a claim that production was attacked.
- The Phase E checkpoint explicitly leaves institute-group scope unresolved. The current
  `Institute` model represents a physical center; it does not establish academic group permissions.
- No `graphify-out/graph.json` exists in this checkout. The older structural-pass counts are
  historical evidence only; this assessment uses source/docs directly.

## Decisions required before dependent implementation

1. **Release boundary:** confirm initial capacity, whether live Zoom is required at launch, and the
   mandatory features beyond the existing LMS and Phase E. The P1–P3 inventory is not an approved
   commitment to build every feature before launch.
2. **Group scope:** recommended first slice supports course groups and subject groups, deferring
   physical-center groups. If center groups are required, define who manages them and which exams
   may use them. Subject-level sharing is not the same as permission to edit shared membership;
   settle creator/manager rights before writing that authorization matrix.
3. **Forensic requirements:** define required event coverage, retention, sensitive-data handling,
   export access, and acceptable evidence integrity. Propose transactional consequential events,
   database append-only protection, restricted exports with actor/reason, and independently retained
   evidence. A database trigger alone cannot protect against a database administrator.
4. **Operations:** identify the actual staging/production hosts and domains, deployment topology,
   provider accounts, recovery objectives, and an incident owner before environment changes/cutover.
   Never infer that a local Compose database is disposable.

Questions 1–3 were raised with the owner during this checkpoint. No answers have been recorded yet.

## Delivery sequence

Each work item has a task branch, acceptance checklist, relevant tests, linked PR, and recorded
verification evidence. Product slices and release safeguards may progress independently where their
dependencies permit; all applicable safeguards must pass before release.

### 0. Establish a trustworthy baseline

- [x] Read product, architecture, workflow, roadmap, latest Phase E plan, and gap-analysis context;
  compare critical claims with source and GitHub.
- [x] Verify clean starting tree and exact remote `dev` SHA; create a docs task branch from `dev`.
- [x] Identify conflicting owner decisions and missing repository protections.
- [ ] Record the owner's scope and evidence requirements.
- [ ] Reconcile PR #72 with this checkpoint without losing its decision history.

### 1. Phase E — marker groups and guided exams

Use [the Phase E plan](2026-08-22-phase-e-marker-groups-exam-workflow.md) for E1–E5 boundaries.
Its E5 instruction to push `dev` is superseded by the standing branch/PR workflow below.

- [ ] E1: scope-approved group schema, additive migration, membership operations and immutable
  membership events; prove all-role/cross-teacher denial, active-marker validation, replay behavior,
  exactly-one-scope constraints, transaction rollback, pagination, and migration compatibility.
- [ ] E2: read-only resolution preview, privacy-limited workload, stale-preview rejection, atomic
  exact assignments and immutable revisions with actor/reason/source/diff. Group edits must never
  change existing exam access. Prove concurrent confirmation and idempotent retry behavior.
- [ ] E3: scoped group list/editor/member/history UI with keyboard, mobile, loading/error/empty,
  retry, and negative-role coverage.
- [ ] E4: guided exam create/edit/content/assignment/review flow, explicit publication and unsaved
  work protection; preserve existing MCQ/typed/PDF channels and student/marker protections.
- [ ] E5: fresh/upgrade migration proof, compiled-stack role/workflow smoke, provider evidence where
  relevant, reviewed PR checks, endpoint docs and tracker updates. Keep incomplete PRs in draft.

### 2. Release safeguards

- [ ] Audit durability: inventory consequential actions, choose the agreed failure policy, make
  required events atomic with mutations, test rollback/retry, restrict update/delete, and verify
  redaction and incident reconstruction. Deliver per-domain changes in separate PRs.
- [ ] GitHub safeguards: require PRs and `Quality Gate` on `dev`/`main`, define reviewer/bypass policy,
  and verify with a noncompliant test branch before relying on enforcement.
- [ ] Recovery: encrypted off-site backups, independent key recovery, alert delivery, isolated
  restore drill, migration rollback/recovery procedure, and measured owner-approved RPO/RTO.
- [ ] Deployment: separate development tunnel configuration from the chosen production topology;
  verify TLS, cookies/CORS, migrations, provider callbacks, worker/queue health and restart behavior.
- [ ] Security: role-resource negative checks, upload abuse and replay tests, fresh dependency audit,
  secret-safe logs, session continuity, and bounded/paginated expensive operations.
- [ ] Polish/accessibility: walk registration/setup, enrollment/payment, content, exam submission,
  marking/publication and front-desk flows at mobile/tablet/desktop widths; verify keyboard/focus,
  errors/retry, low-bandwidth behavior, and accessible contrast/copy.
- [ ] Capacity: run a reproducible load test at the agreed peak workload; record latency/error/queue
  and database limits. Do not claim that the VPS handles 1,200 simultaneous readers from prose.
- [ ] Privacy/support: owner-approved retention and identity-document handling, user-facing policies,
  incident response and recovery contacts; implement policy-dependent controls after decisions.

### 3. Remaining product roadmap

After the owner sets the release boundary, split accepted items into vertical slices: standalone
assignments; moderation/result history/appeals; gradebook/rubrics/question bank; fair-access payment
exceptions; calendar/communication; guardian access; analytics. Preserve documented deferrals for
native apps, multi-tenancy, and optional AI unless the owner explicitly changes them.
See [product roadmap](../../context/documents/13-product-roadmap.md) and
[phases F–I](../reports/2026-08-20-full-system-gap-analysis.md) for the existing inventory.

## Git and evidence discipline

Branch from current `dev` using `feature/`, `fix/`, `chore/`, or `docs/` plus a specific scope.
Commit one logical change as `type(scope): summary`. Link each PR to its issue and record behavior,
tests, migration/recovery steps, and unresolved limitations. Squash into `dev` only with green
checks and review; preserve merged branches. Release through a reviewed `dev` → `main` PR with
version/tag and rollback instructions. Do not direct-push integration/production branches.

Keep this tracker and GitHub aligned: distinguish planned, implemented, locally verified,
CI-verified, staging-verified, and released. Never mark provider success, restore safety, audit
integrity, or production readiness based solely on a passing mocked test suite.

## Verification at this checkpoint

- Frontend unit/component suite: **105/105 passed**, 27 files, two workers.
- Initial backend run: **268 passed / 3 failed**, all failures from missing `CourseModuleStatus` in
  the stale local generated Prisma client. `npm run prisma` regenerated it successfully without a
  schema change or database migration. Recheck: **271/271 passed**, 35 files. Backend lint,
  `tsc --noEmit`, and production build passed. Frontend lint and `tsc --noEmit` passed.
- Frontend production build failed because Turbopack's CSS worker could not bind a port
  (`Operation not permitted`). An approved retry produced the same error. Local frontend build
  verification remains blocked; no build workaround or application code change was introduced.
- Docker: even with sandbox access granted, the configured Docker Desktop daemon is unreachable.
  No current compiled-stack smoke, restore drill, or local migration proof is claimed.
- Remote baseline CI is green at the exact SHA above; this does not substitute for the unavailable
  runtime and provider checks. Fresh dependency/provider readiness is not established by old reports.
