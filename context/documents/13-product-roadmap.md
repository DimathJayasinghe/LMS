# 13 - Product Roadmap and LMS Feature Inventory

> Prioritized product backlog for closing operational gaps and reaching practical LMS parity.
> This is an inventory, not a promise to ship every competitor feature. Each item still needs a
> focused design, acceptance criteria, security review, tests, and a separate PR.

**Last reviewed:** 2026-08-20

## Product Direction

This LMS serves a Sri Lankan tuition/institute workflow: paid enrollments, physical institutes,
entrance attendance, live/recorded teaching, and mixed online/physical exams. Features should be
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
| Dependency security | Backend and frontend full npm audits report zero known advisories after the 2026-08-20 Next/Prisma/Sentry/Multer/parser upgrades | Keep audit in CI and review framework/provider advisories on every release |

## P1 - Complete the Core Teaching Product

Build these in coherent vertical slices after P0.

| Capability group | Required functionality |
|---|---|
| Course authoring | ✅ Teacher-owned course create/edit, subject approval, sessions and video recordings completed 2026-08-20; modules/topics, reorderable lessons, drafts/scheduling, files/links/text/audio, and prerequisites remain |
| Assignments | Separate assignment model from exams; due dates; attachments; individual/group allocation; drafts; late policy; resubmission; status tracking |
| Gradebook | Course-wide gradebook; categories and weights; grading scales; manual columns; import/export; moderation; release controls; student grade view |
| Rubrics and feedback | Reusable rubrics; criteria scoring; inline PDF/image annotation; private comments; comment bank; submission and grade history |
| Question bank and tests | Reusable/versioned questions; more question types; random pools; shuffling; multiple attempts; negative/partial marking; answer explanations |
| Exam accommodations | Per-student extra time, attempt count, availability windows, alternative location/channel, interruption recovery, audit visibility |
| Teacher/marker workspace | ✅ Owned-class scope, session/video actions, exact marker assignment, marker post-release lock, and audited teacher correction completed 2026-08-20; bulk queues, workload filters and timetable-slot authoring remain |
| Communication | Course announcements; threaded discussions/Q&A; mentions; attachments; moderation; read state; notification preferences |
| Calendar and tasks | Unified timetable, exam and assignment calendar; due-soon list; reminders; iCal export; conflict detection |
| Payments operations | Override UI and immutable completed-refund ledger completed 2026-08-19; teacher own-class aggregate analytics and super-admin teacher/class filtering completed 2026-08-20; provider refunds/voids, compensating re-payment flow, receipt reissue, discounts/scholarships, installments, aging report |
| Guardian access | Guardian-student links; consent/verification; attendance, upcoming/missing work and payment summaries; privacy-limited portal; SMS digest |
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
| Internationalization | Sinhala/Tamil/English UI, locale-aware dates/numbers, timezone handling, translated notification templates |
| Mobile/PWA | Installable PWA, push notifications, resilient low-bandwidth navigation, selected offline downloads and queued submissions |
| Multi-institute operations | Location-specific staff permissions, rooms/capacity, resource scheduling, institute attendance/payment reporting |

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
4. **Next:** Secure class banner/backdrop upload (the core paid/enrolled `access.service` direct-test gap was closed 2026-08-20).
5. Course modules/materials, then timetable-slot/live-flow unification and assignments.
6. Gradebook, rubrics, feedback, and expanded question bank.
7. Calendar, discussions, guardian summaries, and notification preferences.
8. Analytics and at-risk intervention workflows.
9. Accessibility/i18n/PWA hardening.
10. Ecosystem integrations, adaptive learning, credentials, and optional AI.
