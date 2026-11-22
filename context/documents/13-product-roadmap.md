# 13 - Product Roadmap and LMS Feature Inventory

> Prioritized product backlog for closing operational gaps and reaching practical LMS parity.
> This is an inventory, not a promise to ship every competitor feature. Each item still needs a
> focused design, acceptance criteria, security review, tests, and a separate PR.

**Last reviewed:** 2026-11-20 (owner decisions settled by delegation, [19](./19-owner-decisions-2026-11-20.md); fix-wave plans written)

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
| Tenant foundation | M1 done (`Organization` table, nullable `organizationId` everywhere); global uniques and provider credentials in `env.ts` remain ([14](./14-multi-tenancy-readiness.md)) | M2–M3 as one stretch after Wave 1 (only hotfixes merge) and before Wave 2; every new table already carries `organizationId` (registry test); M4–M7 wait for a second organization ([14](./14-multi-tenancy-readiness.md) §11) |
| Dependency security | Backend and frontend full npm audits report zero known advisories after the 2026-08-20 Next/Prisma/Sentry/Multer/parser upgrades | Keep audit in CI and review framework/provider advisories on every release |

## P0.5 - Access and Flow Coherence (audit 2026-11-19)

Found by the roles, scope and flow audit ([17](./17-roles-permissions-and-flows.md), [18](./18-flow-audit-findings-register.md)). These are defects in how access and daily workflows fit together, not new features, and they gate a real launch.

| Wave | Deliverable | Findings |
|---|---|---|
| 0 (in progress: F-01 merged in #96; F-04 and F-06 in #97; F-09 in #98; F-55 fixed in #100 and F-54 fixed in #101, unreleased; F-28 and F-31 fixed in #102 and F-02 in #103, unreleased; F-07 in #99; Zoom staging verification pending) | Session lifetime fix; recording read scoping; enrollment check on recording metadata; attendance read scoping; Zoom webhook hardening; production boot check for Bunny keys; SSR traffic out of the per-IP limiter; scan identity resolution; owner-account safety slice | F-01, F-04, F-06, F-09, F-54, F-55, F-02, F-07, F-28, F-31 |
| 1 (in progress: F-67 in #105, the settings registry with the Colombo billing clock, F-18, in #106, F-104 in #107, F-15 with F-03 in #108, and F-13 in #109, F-21 in #110, F-10 with F-78 in #111, F-77 with F-59 in #112, F-58 in #113, and F-11 with the F-65 interim in #114, all unreleased) | Foundations (settings registry, Colombo billing clock, per-request revocation F-15). Front desk: enroll UI, who-owes, end-of-day cash tally, bulk-upload guard, scanner context. Teacher: roster, marking, hall-mark entry. Students: scoped-exam sitting, exam resilience. Accounts: password reset, staff creation. Timetable: generated classes can go live (done, #107). Owner: read-only console | F-15, F-11, F-10, F-77, F-58, F-12, F-83, F-67, F-13, F-17, F-22, F-86, F-03, F-21, F-104, F-127 |
| M2 + M3 | Tenancy context and constraints as one focused stretch after Wave 1 (only hotfixes merge) | doc 14 §11 |
| 2 | One content gate with mode and payment rules, HYBRID and bank slip; branch dimension; money edges and enrollment lifecycle; guardian contact and SMS events; teacher money authority (decisions made: [19](./19-owner-decisions-2026-11-20.md)) | F-05, F-23, F-52, F-53, F-59 to F-65, F-91, F-93, F-94, F-25, F-76, F-98, F-125, F-126, plus the residuals of F-37 and F-105 (session branch, T13) |
| 3 | Remaining medium and low findings with a Vitest matrix per guard | doc 18 |

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
6. **Next (re-ordered 2026-11-20):** audit Wave 0; Wave 1 (two plans, Wave 1 and Wave 1b: settings registry and Colombo clock first, then identity safety, attendance, teacher and money visibility); then M2 and M3 as one one-to-two-week stretch in which only hotfixes merge; then Wave 2 (2a one enrollment migration with HYBRID, 2b money core and the single content gate, 2c structure, 2d bank slip, 2e identity and communication, 2f teacher money authority, shares and statements); M4-M7 only when a second organization is contracted, then standalone assignments. Wave 1 includes the physical hall-mark entry of Phase E (D-EXAMS-2). Master order: `docs/superpowers/plans/2026-11-20-wave-2-access-coherence-and-delivery-order.md`; Wave 1 is split into two plans (`…-wave-1-working-day-per-role.md` and `…-wave-1b-identity-attendance-structure-and-drivers.md`). Phase E (marker groups, exam papers/audiences, allocation snapshots, guided
   exam authoring) is partly merged: E1 marker groups, exam papers/audiences and scoped marker allocations (#85) are on `dev`. The incremental
   Phase E implementation plan is documented in
   [`docs/plans/2026-08-22-phase-e-marker-groups-exam-workflow.md`](../../docs/plans/2026-08-22-phase-e-marker-groups-exam-workflow.md).
7. Gradebook, rubrics, feedback, and expanded question bank.
8. Calendar, announcements, guardian access and summaries, fee-reminder/absence SMS, and notification preferences.
9. Analytics and at-risk intervention workflows.
10. Accessibility/i18n/PWA hardening; device limits and OTP login.
11. Ecosystem integrations, adaptive learning, credentials, and optional AI.
