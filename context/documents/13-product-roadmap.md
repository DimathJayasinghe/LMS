# 13 - Product Roadmap and LMS Feature Inventory

> Prioritized product backlog for closing operational gaps and reaching practical LMS parity.
> This is an inventory, not a promise to ship every competitor feature. Each item still needs a
> focused design, acceptance criteria, security review, tests, and a separate PR.

**Last reviewed:** 2026-11-19 (requirements alignment: tenancy, payment channels, HYBRID, guardian, localization)

## Product Direction

This LMS serves a Sri Lankan tuition/institute workflow: paid enrollments, physical institutes,
entrance attendance, live/recorded teaching, and mixed online/physical exams. It is deployed for one
organization first and is being made **multi-tenant ready** ([14](./14-multi-tenancy-readiness.md)).
Every requirement from the 2026-11-19 requirements review is mapped to a status in
[15-requirements-traceability.md](./15-requirements-traceability.md); items not scheduled elsewhere are
listed below. Features should be
prioritized by reliability of those workflows first, teaching effectiveness second, and ecosystem
parity third. Copying every feature from a general-purpose university LMS would add cost and
complexity without necessarily helping this product.

## Evidence Base

The inventory was compared against current official product documentation:

- [Moodle core features](https://docs.moodle.org/405/en/Features): learning paths, collaboration,
  external tools, multimedia, groups, marking workflows, inline feedback, peer assessment, badges,
  advanced grading, and competencies.
- [Canvas basics](https://community.canvaslms.com/html/assets/Canvas_Basics_Guide.pdf): modules,
  assignments, discussions, outcomes, rubrics, gradebook, and analytics.
- [Google Classroom capabilities](https://support.google.com/edu/classroom/answer/6020279):
  classwork, materials, grades, feedback, announcements/discussions, guardian summaries, and
  originality checking.
- [Google Classroom analytics](https://support.google.com/edu/classroom/answer/14221372):
  assignment completion, grade trends, activity, and student/class drill-down.
- [Blackboard accessibility features](https://self-hosting.blackboard.com/Learn/Administrator/Hosting/Accessibility/Accessibility_Features.html):
  keyboard navigation, accommodations, adaptive release, and per-user notification preferences.

## P0 - Release Safety and Operational Completeness

These are prerequisites for calling the platform production-ready.

| Capability | Current state | Next deliverable |
|---|---|---|
| CI quality gate | Backend/frontend lint, test, type/build, Prisma validation, fresh migrations, zero drift, and legacy-baseline adoption are enforced in the aggregate gate (migration proof added 2026-08-20) | Require `Quality Gate` in branch protection; add dependency/security audit policy |
| Timetable data integrity | Soft-disable, idempotent restore, service tests, and inactive UI state added 2026-08-17 | Verify in staging with generated sessions before release |
| Environment/secret readiness | Known malformed Bunny key and manual provider setup | Startup validation, staging checklist, webhook/provider health page |
| Database migrations | ✅ Versioned baseline reconciled; fail-fast `migrate deploy`, fresh-install drift check, legacy db-push adoption proof, and runbook completed 2026-08-20 | Execute the documented one-time adoption on the real pre-launch database, then retain migration/drift CI on every change |
| Attendance reconciliation | Ownership-scoped Zoom preview/apply, active-enrollment matching, idempotent writes, audit trail, and SUPER_ADMIN/TEACHER UI added 2026-08-17 | Verify the OAuth scope and completed-meeting behavior against the staging Zoom account |
| Upload resilience | Single presigned PUT; no resume/expiry refresh | Multipart/resumable uploads for large papers/answers/NIC media, retry and cancel |
| Authentication continuity | Reactive refresh after 401 only | Proactive refresh, cross-tab coordination, session-expiry UX, device/session management |
| Backup/restore readiness | Backup engine exists; production drill pending | Configure off-site target, restore drill, RPO/RTO evidence, alerting |
| Observability | Logging/Sentry foundations exist | Health dashboard, queue lag, webhook failures, provider status, alert thresholds |
| Accessibility baseline | Partial component-level accessibility | WCAG 2.2 AA audit, keyboard flows, focus management, contrast, reduced motion, captions |
| Tenant foundation | No `Organization` model; global uniques; provider credentials only in `env.ts` ([14](./14-multi-tenancy-readiness.md)) | ADR steps M1–M3 (default organization, `organizationId` everywhere, per-organization uniques) **before further schema-changing slices**, so new tables are created tenant-aware |
| Dependency security | Backend and frontend full npm audits report zero known advisories after the 2026-08-20 Next/Prisma/Sentry/Multer/parser upgrades | Keep audit in CI and review framework/provider advisories on every release |

## P1 - Complete the Core Teaching Product

Build these in coherent vertical slices after P0.

| Capability group | Required functionality |
|---|---|
| Course authoring | ✅ Teacher-owned course create/edit, subject approval, secure artwork, sessions/video, and ordered draft/released private file modules completed 2026-08-21; links/text/audio materials, drag-and-drop ordering, prerequisites, and cross-course reuse remain |
| Assignments | Separate assignment model from exams; due dates; attachments; individual/group allocation; drafts; late policy; resubmission; status tracking |
| Gradebook | Course-wide gradebook; categories and weights; grading scales; manual columns; import/export; moderation; release controls; student grade view |
| Rubrics and feedback | Reusable rubrics; criteria scoring; inline PDF/image annotation; private comments; comment bank; submission and grade history |
| Question bank and tests | Reusable/versioned questions; more question types; random pools; shuffling; multiple attempts; negative/partial marking; answer explanations |
| Exam accommodations | Per-student extra time, attempt count, availability windows, alternative location/channel, interruption recovery, audit visibility |
| Teacher/marker workspace | ✅ Owned-class scope, session/video actions, timetable authoring, exact marker assignment, marker post-release lock, and audited teacher correction completed; bulk queues and workload filters remain |
| Communication | Course announcements; threaded discussions/Q&A; mentions; attachments; moderation; read state; notification preferences |
| Calendar and tasks | ✅ Recurring timetable conflict detection and generation preview completed 2026-08-21; unified exam/assignment calendar, due-soon list, reminders, and iCal export remain |
| Payment channels | PayHere, front-desk/branch cash and Excel reconciliation are built | **Bank-transfer slip channel** (`PaymentSlip`, student upload, staff approve/reject, notifications, expiry job) — [design](../../docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md) §3 |
| Class types | Sessions support physical/online/both; enrollments are only `ONLINE`/`PHYSICAL` and the content gate ignores the type | **`HYBRID` enrollment**, one active enrollment per student per course, eligibility matrix, physical-only students lose online access unless `HYBRID` or the session opts in (decided 2026-11-19; a behaviour change needing a rollout report) — same design §4 |
| Payments operations | Override UI and immutable completed-refund ledger completed 2026-08-19; teacher own-class aggregate analytics and super-admin teacher/class filtering completed 2026-08-20; provider refunds/voids, compensating re-payment flow, receipt reissue, discounts/scholarships, installments, aging report, scheduled fee-reminder SMS, teacher settlement/commission statements |
| Student and class profile | Name, NIC, phone, address only; no capacity or medium on classes | Optional school, A/L batch, stream, teaching medium; class capacity; bulk student import (Excel/CSV); printable ID card |
| Account protection | Passwords and JWT sessions only | Device limit and single active session per student; OTP login; account-sharing signals |
| Guardian access | Guardian-student links (several children per guardian); consent/verification, including for minors; attendance, upcoming/missing work and payment summaries; privacy-limited read-only portal; SMS digest and absence/fee-due alerts. Needs a guardian role design before schema work |
| Student support | Search; bookmarks; notes; progress checklist; downloadable resources; low-bandwidth mode; clear missing/late/upcoming work views |

## P2 - Analytics, Scale, and Ecosystem Parity

| Capability group | Required functionality |
|---|---|
| Learning analytics | Completion, grade and engagement trends; attendance/payment correlations; class/student drill-down; at-risk rules; intervention notes |
| Outcomes and competencies | Outcomes mapped to activities/questions; mastery levels; learning plans; mastery gradebook; competency reports |
| Groups and collaboration | Groups/cohorts; differentiated content and dates; group submissions; peer/self review; group discussions |
| Adaptive release | Release by date, enrollment mode, group, prerequisite completion, score, attempt count, payment/access rule |
| Credentials | Badges and certificates; configurable criteria; verification URL/QR; expiry/revocation; export where practical |
| Content reuse | Course templates; copy/import between courses; shared question/rubric banks; version history; archive/restore |
| Integrations | LTI 1.3 where justified; SCORM/xAPI evaluation; SIS CSV/API sync; calendar/video/storage integrations; outbound webhooks |
| Academic integrity | Originality provider integration, question randomization, exam event logs, suspicious-session review, explicit privacy policy |
| Internationalization | Sinhala/Tamil/English UI, locale-aware dates/numbers, timezone handling, translated notification templates, Unicode-correct generated PDFs/receipts, Sinhala/Tamil search. **Decision pending (15 §2):** launch is English-only; recommended to add the message-catalog scaffolding and per-user/organization `locale` early because retrofitting strings is costly |
| Mobile/PWA | Installable PWA, push notifications, resilient low-bandwidth navigation, selected offline downloads and queued submissions |
| Multi-institute operations | Location-specific staff permissions, rooms/capacity, resource scheduling, institute attendance/payment reporting (branches inside one organization) |
| Multi-tenant platform | Platform console, onboarding, billing/plans/quotas, per-tenant branding and custom domains, tenant export/restore tool, row-level security — only after the foundation in P0; see [14](./14-multi-tenancy-readiness.md) §9 |

## P3 - Optional Intelligence and Automation

These are valuable only after the underlying content, permissions, and audit data are dependable.

- Teacher-assisted question/rubric generation with mandatory human approval.
- Student study guides, practice generation, and course-grounded tutoring with source citations.
- Feedback drafting and class misconception summaries without auto-publishing grades.
- At-risk recommendations that explain their evidence and never take punitive automated action.
- Semantic course search with strict enrollment and payment access checks.
- Provider abstraction, usage limits, opt-out controls, retention rules, and per-feature cost metrics.

## Cross-Cutting Acceptance Criteria

Every feature slice must include:

- explicit role/ownership/access rules and negative authorization tests;
- mobile and desktop UI states for loading, empty, error, retry, and partial success;
- audit events for privileged or financially/academically consequential changes;
- idempotency for replayable high-stakes mutations;
- pagination and bounded queries for growing lists;
- accessibility and keyboard verification;
- endpoint/type documentation and progress-tracker updates;
- backend/frontend tests plus production builds before PR merge;
- migration, rollback, observability, and support notes when persistent data changes.

## Recommended Delivery Order

1. ✅ CI pipeline and timetable soft-delete integrity.
2. ✅ Reconcile versioned database migrations and prove fresh/legacy upgrade paths (2026-08-20); the production restore drill remains an operations task.
3. ✅ Teacher course authoring, subject assignment, marker workflow, result corrections, and student new-lesson dashboard (2026-08-20).
4. ✅ Secure class banner/backdrop upload with public-R2 lifecycle, full image decoding, exact dimensions, accessibility text, and audit events (2026-08-20).
5. ✅ Private course modules/materials and timetable-slot/live-flow unification (2026-08-21).
6. **Next (re-ordered 2026-11-19):** tenant foundation (ADR 14 M1–M3), then continue Phase E (physical-result entry and academic evidence), then `HYBRID` enrollment and the bank-slip channel, then standalone assignments. Phase E (marker groups, exam papers/audiences, allocation snapshots, guided
   exam authoring) is partly merged: E1 marker groups, exam papers/audiences and scoped marker allocations (#85) are on `dev`. The incremental
   Phase E implementation plan is documented in
   [`docs/plans/2026-08-22-phase-e-marker-groups-exam-workflow.md`](../../docs/plans/2026-08-22-phase-e-marker-groups-exam-workflow.md).
7. Gradebook, rubrics, feedback, and expanded question bank.
8. Calendar, announcements, guardian access and summaries, fee-reminder/absence SMS, and notification preferences.
9. Analytics and at-risk intervention workflows.
10. Accessibility/i18n/PWA hardening; device limits and OTP login.
11. Ecosystem integrations, adaptive learning, credentials, and optional AI.
