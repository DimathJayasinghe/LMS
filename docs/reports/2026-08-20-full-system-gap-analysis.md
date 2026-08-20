# LMS Full-System Gap Analysis

**Audit date:** 2026-08-20

**Target:** a production-ready, single-institution tuition LMS for students, teachers, markers,
front-desk staff, and one super administrator

**Evidence reviewed:** repository source, Prisma schema, API contracts, product/architecture docs,
frontend routes, test inventory, migrations, Docker Compose runtime, and the existing product roadmap

## 1. Executive assessment

The project has a strong operational core: authenticated role-based access, teacher-owned classes,
sessions, recorded video, embedded live classes, attendance, exams, exact marker assignment,
published-result correction, payments, immutable payment adjustments, notifications, audit events,
Docker deployment, migrations, backups, and CI checks. It is already more than a prototype.

It is not yet a complete teaching product or safe production launch. The largest product gaps are
course modules/materials, timetable authoring, marker groups and moderation, fair payment-access
exceptions, privacy/retention controls, and production provider/backup readiness. Some written
requirements also conflict with the safest authorization model and need explicit decisions.

The recommended direction is to finish small vertical slices in the order in section 8. Each slice
must ship backend rules, frontend affordances, audit coverage, negative authorization tests,
documentation, and production-Docker smoke evidence together.

## 2. Authorization and ethical operating model

“Super admin can access everything” should mean **global institutional oversight and management**,
not invisible impersonation. A super admin can view and administer every teacher, subject, class,
session, exam, result, attendance aggregate, payment, configuration, and audit record. Persona acts
must retain accountable authorship:

- A super admin should not sit an exam as a student, submit a student's answer, scan attendance as
  that student, or submit marks under a marker's identity.
- Emergency academic or financial overrides should be explicit actions, require a reason, preserve
  before/after state, name the actual actor, and be auditable.
- Teachers should see only classes they own or are explicitly assigned to. They may see aggregate
  income and outstanding totals for those classes, but not unrelated courses or institution-wide
  finance.
- Teacher analytics should not expose individual students' broader payment history. A teacher may
  need an access-support signal for a student in their class, but that should be a purpose-limited
  status, not a finance dossier.
- Markers should see only assigned exams/submissions. Group assignment must snapshot accountable
  exam assignments; changing a group later must not silently change who can see an active exam.
- Front-desk staff should perform attendance/payment operations but not manage academic answers,
  grades, subject taxonomy, global reports, or security settings.
- Students should see and act only on their own enrollment, content, submissions, results,
  attendance, and payments.

The optional `Permission` model should not become an undocumented bypass. Either remove it or build
an explicit, tested permission engine with an admin UI and audit trail.

### Super-admin access exceptions that are intentional

Student-only exam-attempt/payment-self-service endpoints and marker-only grade-submission endpoints
should stay persona-restricted. Super-admin oversight should use dedicated administrative read or
override endpoints. This preserves separation of duties while meeting the global-access goal.

### Target role-resource matrix

| Resource/action | SUPER_ADMIN | TEACHER | ADMIN (front desk) | MARKER | STUDENT |
|---|---|---|---|---|---|
| Users, roles, security settings | Global manage | Self profile | Support-safe user operations only | Self profile | Self profile/setup |
| Subjects and teacher assignments | Global manage | Read assigned | No access | No access | Read active catalogue |
| Classes, sessions, videos, materials | Global manage | Manage owned/assigned | Operational read where required | No access | Read enrolled/released/eligible |
| Timetable | Global manage | Manage owned slots/sessions | Operational slot management by explicit policy | No access | Read relevant schedule |
| Exams | Global oversight/manage | Manage owned-class exams | No academic content access | Read assigned exam only | Read/take enrolled and available exams |
| Marks and results | Global oversight; named emergency override | Review/publish/correct owned results | No marking | Submit assigned marks | Read own published results/appeal |
| Attendance | Global oversight/correct | Owned-class report/correct | Scan/manual operational entry | No access | Read/dispute own attendance |
| Payments | Global records/adjustments/reports | Owned-class aggregates only | Collect/import/support operations | No access | Own pay/history only |
| Audit and global configuration | Global read/manage settings | Own-class activity view when built | No global audit | No access | No access |

Every “manage” cell still requires an actual actor identity, ownership/target checks, reasoned
overrides where consequential, and audit events. This matrix is the product target; section 3 marks
where implementation is incomplete.

## 3. Current capability and gap matrix

| Area | Current state | Gap or logic/ethical issue | Priority |
|---|---|---|---|
| Super-admin oversight | Broad administrative access exists across users, subjects, classes, sessions, exams, submissions, payments, attendance, results, and audit | “Everything” is not documented as global oversight versus impersonation; no single permission matrix or automated matrix test | P0 |
| Teacher ownership | Class/content reads and mutations are ownership-scoped; subject assignment controls class creation | A course has one teacher only; no co-teacher/substitute delegation or time-bounded access | P1 |
| Teacher finance | Aggregate own-class income/outstanding report and reconciled contracts are implemented in this phase | No payout/commission model or downloadable settlement statement | P1 |
| Super-admin finance | Institution totals and class breakdown exist; teacher and class filters are implemented in this phase | No aging buckets, institute dimension, settlement/export, discount/scholarship/installment model, or provider refund execution | P1 |
| Class images | Completed in Phase B: ownership-bound public-R2 presign/confirm/remove, full decode, MIME/size/exact-dimension checks, accessible descriptions, UI preview/replace/remove, audit events, tracked-key cleanup, and stale-write protection | Automated expiry cleanup for presigned-but-never-confirmed uploads and optional crop tooling remain | P2 |
| Course structure | Sessions and recordings attach directly to a class | No modules/topics, ordering, drafts, release scheduling, prerequisites, or coherent lesson page | P1 |
| Materials | No material domain model, endpoints, or UI | Students cannot download teacher files or open structured links/text; no upload security, versioning, visibility, or download audit policy | P1 |
| Live lessons | In-site Zoom session schedule/start/join exists | Recurring timetable links still use a separate/raw flow; provider credentials are placeholders; join readiness and failure recovery need staging proof | P0/P1 |
| Recorded lessons | Teacher direct Bunny upload and student protected playback exist | Provider key readiness has been documented as invalid; no captions/transcripts, attachments, lesson ordering, or low-bandwidth download policy | P0/P1 |
| Timetable | Recurring slot backend, generated sessions, student weekly view, and soft-disable exist | No complete slot-authoring UI; session/live setup is split across workflows; conflict detection is absent | P1 |
| Exam creation | Teacher/super-admin create exams; multiple delivery channels and paper upload exist | Editing/review is fragmented; no reusable question bank, draft review, accommodations, version history, or scheduling-conflict warnings | P1 |
| Marker assignment | Exact marker assignment exists | No reusable marker groups, workload preview, bulk allocation, second marker, moderation, conflict-of-interest declaration, or reassignment history UI | P1 |
| Result integrity | Marker lock after release and reasoned teacher/super-admin correction exist | No student appeal, second-review/moderation state, correction notification policy, grade history view, or course gradebook | P1 |
| Student class home | Current enrollments, new recording count, upcoming sessions, video and live links exist | No unified lesson feed containing video/material/live/exam, progress checklist, bookmarks, search, calendar tasks, or offline/low-bandwidth mode | P1/P2 |
| Payment content gate | Active enrollment plus current-month successful payment gates protected content | A hard monthly gate has no scholarship, waiver, grace period, installment, disputed-payment, or admin temporary-access exception; this can unfairly block learning | P0 |
| Attendance | Entrance scan, recorded-watch attendance, Zoom webhook/reconciliation, teacher reports exist | No student dispute/correction request, excused absence, late/partial presence policy, or transparent attendance calculation | P1 |
| Audit | Many consequential mutations write audit records | Coverage is not expressed as an auditable event catalogue; audit rows lack a database immutability trigger; no export/retention/integrity monitoring. Logging every read would be invasive and noisy—log security-sensitive reads/exports, not routine lesson views | P0/P1 |
| Credential-safe logs | Request cookies/authorization were redacted | **Found and fixed in this phase:** response `Set-Cookie` headers were serialized by Pino and could expose access/refresh tokens; response-cookie redaction and a regression test were added, and the exposed smoke session was revoked | Fixed |
| Privacy | Private R2 objects and ownership checks exist | No privacy/terms pages, consent record, retention schedule, subject-access request/export/delete workflow, or documented handling of NIC images, recordings, attendance, exam answers, and audit logs | P0 |
| Upload security | Presign/confirm patterns verify object existence | Generic material/image validation is absent; no server-verified image dimensions/content signature, malware scanning plan, quarantine, or orphan cleanup | P0 before materials |
| Accessibility | Semantic tables and several accessible fallbacks exist | No complete WCAG 2.2 AA audit, caption workflow, keyboard evidence for all high-value flows, reduced-motion review, or screen-reader acceptance suite | P0/P1 |
| Notifications | In-app/SMS notification foundation and bell exist | Several SSE event types lack consumers; no new-lesson/material notification preference, delivery retry dashboard, digest, or student-controlled preferences | P1 |
| Security tests | Large backend/frontend suites and direct enrolled/paid/marker access-gate tests exist | No automated complete role×resource matrix, restore/security regression suite, or upload-abuse suite | P0 |
| Backups | Scheduled dumps and verification run | Current live backup is unencrypted; off-site copy, alerting, restore drill, RPO/RTO evidence, and key recovery procedure are incomplete | P0 |
| Deployment/providers | Production images and Compose health checks work | Bunny/Zoom readiness and public-origin CORS need environment validation; branch protection, TLS/custom domain, monitoring thresholds, and cutover checklist remain | P0 |
| Documentation truth | Extensive endpoint, architecture, tracker, and roadmap docs exist | Several stale contradictions remain, including teacher-finance policy, old phase checklists, and earlier attendance/video statements | P0 documentation |

## 4. Concrete logic errors and corrections

### 4.1 Role semantics

1. The project overview said teachers cannot access financial data, while the current product
   requirement needs own-class income analytics. Correct rule: teachers get aggregate own-class
   totals only; super admin gets global, teacher, and class views.
2. Older payment documentation uses `ADMIN` to mean both owner and front desk. Code uses
   `SUPER_ADMIN` for owner and `ADMIN` for front desk. All contracts and UI labels must use the code
   meanings consistently.
3. “Super admin absolute control” is too broad when applied to persona actions. Add a documented
   global-oversight rule and dedicated audited overrides instead of a universal middleware bypass.
4. Role middleware alone is insufficient. Every teacher/marker/student service query must also
   enforce resource ownership or assignment, with negative tests.

### 4.2 Financial fairness and privacy

1. Gross collection and outstanding totals must subtract completed refunds consistently.
2. A teacher-supplied `teacherId` must never expand scope; the authenticated teacher ID must replace
   it server-side. Class filters must be combined with ownership rather than trusted independently.
3. Reports should return aggregates, not a list of students with institution-wide payment history.
4. Small-class analytics can still identify individuals. Avoid demographic/payment correlation and
   export until minimum-cell rules and purpose are defined.
5. The current all-or-nothing monthly payment gate needs explicit exceptions with expiry, reason,
   authorizer, notification, and audit. A failed webhook should not become an unexplained learning
   denial.

### 4.3 Academic integrity

1. A result correction after publication is not a substitute for moderation or appeal. Preserve all
   versions and notify affected students.
2. Marker groups must expand into exam-specific assignments at assignment time. Dynamic group
   membership must not silently grant access to historical exams.
3. Reassignment must preserve the prior marker, reason, timestamp, and any submitted marks.
4. Super-admin emergency marking must be a named override, never attribution to another marker.

### 4.4 Audit scope

“All should be logged” should cover:

- authentication/security events and privileged exports;
- user/role/status/permission changes;
- subject/teacher/class/session/module/material/exam configuration changes;
- live meeting scheduling and attendance reconciliation/correction;
- marker group membership and exam assignment changes;
- marking, publishing, result corrections, and appeals;
- payment collection, override, refund, waiver, and access exceptions;
- backup/restore and provider-configuration changes.

Routine reads such as watching a lesson should use purpose-built progress/attendance events with a
retention policy, not the privileged audit table. Audit records should be append-only at the database
layer and redact secrets, signed URLs, tokens, raw NIC content, and full answer bodies.

### 4.5 Credential-safe operational logging

The production smoke review found that incoming cookies were redacted but outgoing `Set-Cookie`
headers were not. Because login/refresh responses contain reusable JWTs, this was a credential leak
into container logs. The request logger now redacts authorization, request cookies, and response
`Set-Cookie`; a regression test prevents reintroduction. The refresh session created during the
affected smoke test was revoked and the backend container is recreated during verification so the
old log stream is discarded.

## 5. Proposed class media standard

The class form should replace manual URL entry with a server-authorized direct-to-R2 upload, while
retaining explicit remove/replace actions.

| Asset | Required canvas | Ratio | Accepted formats | Maximum |
|---|---:|---:|---|---:|
| Class banner | 1600 × 600 px | 8:3 | JPEG, PNG, WebP | 8 MB |
| Class backdrop | 1920 × 1080 px | 16:9 | JPEG, PNG, WebP | 8 MB |

The UI must show these dimensions before selection, preview the crop on desktop/mobile, and provide
alt text. The server must authorize the class first, issue an asset-specific key, verify object size,
content signature and decoded dimensions before confirmation, and delete replaced/orphaned objects.
SVG should not be accepted for this feature because active/external content handling adds avoidable
risk. URLs stored in `Course` should be server-controlled public-CDN asset URLs, not arbitrary
external URLs; these display images are not confidential, but only authorized staff may replace them.

## 6. Proposed easy teaching and learning workflows

### Teacher class workspace

One class page should expose a clear ordered workflow:

1. Overview and banner/backdrop.
2. Curriculum: modules/topics with drag/reorder controls.
3. Add lesson: recorded video, live session, file, link, text, or audio.
4. Schedule/release settings and audience mode.
5. Exams: create/edit, preview, assign markers or groups, publish.
6. Students: enrollment count, attendance, learning progress, aggregate payments.
7. Analytics and audit history.

### Student class workspace

The enrolled-class page should open to an ordered “Continue learning” feed. Each lesson card clearly
shows new/completed, live/upcoming/ended, downloadable material, availability, and payment/access
state. The next available action—watch, download, join live, or take exam—should be one prominent
button. New content must be derived from persisted per-student progress, not browser-only state.

### Marker assignment workflow

1. Create reusable marker groups scoped to the institution, subject, or class.
2. Add/remove active marker accounts and show current workload.
3. On an exam, choose individual markers and/or groups.
4. Preview the resolved unique marker list, conflicts, and workload before confirming.
5. Persist an exam-specific assignment snapshot in one transaction.
6. Audit group source, resolved members, actor, reason, and later changes.
7. Support optional allocation rules later (submission ranges, round-robin, second marker), without
   changing the initial exact-assignment semantics.

## 7. Required domain additions

Names are provisional and require a focused design before migration.

- `CourseModule`: class, title, description, position, draft/published state, release time.
- `CourseMaterial`: module/session, type (`FILE/LINK/TEXT/AUDIO`), title, R2 key or sanitized URL,
  size/MIME, downloadable flag, position, release state, version.
- `CourseAsset`: class image purpose, key, MIME, bytes, width, height, alt text, status.
- `MarkerGroup`, `MarkerGroupMember`: reusable configuration and membership history.
- Existing `MarkerAssignment`: remain the exam-specific authorization source; add assignment source
  and group snapshot metadata rather than dynamically authorizing from current groups.
- `AccessException`: enrollment, rule (`WAIVER/GRACE/SCHOLARSHIP/INSTALLMENT/DISPUTE`), start/end,
  reason, actor, state.
- `ResultRevision`/`Appeal`: immutable result history, student request, review outcome, notifications.
- `AttendanceCorrectionRequest`: student-visible evidence and accountable resolution.

## 8. Step-by-step delivery plan

### Phase A — Authorization, reporting, and truth alignment

**Status: completed 2026-08-20.**

- Ship teacher own-class aggregate finance and super-admin teacher/class filters.
- Add negative scope tests and update endpoint/product/progress docs.
- Publish the role-resource-action matrix and intentional persona exceptions.
- Maintain direct negative tests for the core paid/enrolled access gate and expand toward a complete
  role×resource matrix.

**Exit:** production Docker suites/builds pass; authenticated teacher cannot expand scope; super admin
can filter all teachers/classes; front desk/student/marker receive 403.

### Phase B — Class image upload

**Status: completed 2026-08-20.**

- Build presign/confirm/delete endpoints and R2 lifecycle.
- Validate ownership, content signature, size, exact dimensions, and safe formats.
- Add class-form picker, preview, dimension guidance, replace/remove, and alt text.

**Exit:** positive and malicious/wrong-size upload tests plus production Docker browser/API smoke.

### Phase C — Modules and downloadable materials

- Add module/material schema and migration.
- Implement ordered CRUD, draft/release, secure upload/confirm/download, and audit events.
- Build teacher curriculum editor and student “Continue learning” feed.

**Exit:** an owning teacher publishes a file; an enrolled/eligible student downloads it; another
teacher and non-enrolled student cannot; orphan/quarantine behavior is verified.

### Phase D — Timetable and live-class unification

- Complete recurring slot authoring, conflict detection, generation preview, and restore controls.
- Route every online occurrence through the embedded live room; remove raw-link ambiguity.
- Validate real provider credentials and failure states in staging.

### Phase E — Exam authoring and marker groups

- Add reusable marker group configuration and membership UI.
- Add resolved-assignment preview, workload indicators, atomic snapshot, reassignment reason/history.
- Simplify exam create/edit/preview/publish into one guided workflow.

### Phase F — Moderation, gradebook, and learner remedies

- Add second-marker/moderation workflow, result history, appeals, and correction notification.
- Add course gradebook, categories/weights, import/export, and student grade history.
- Add attendance correction requests and excused states.

### Phase G — Fair access and payment operations

- Add audited waiver/scholarship/grace/installment/dispute access exceptions.
- Add aging, institute, receipt reissue, provider refund/void, and settlement/export workflows.
- Ensure teachers retain aggregates only.

### Phase H — Privacy, accessibility, and production readiness

- Publish privacy/terms, consent and retention policy; add data export/delete review workflow.
- Encrypt backups, configure off-site copy/alerts, and complete a restore drill.
- Complete WCAG 2.2 AA and caption/keyboard/mobile checks.
- Validate providers, CORS/public origins, TLS, Sentry, queue/webhook alerts, and branch protection.

### Phase I — Communication and learning analytics

- New-lesson/material/live reminders and user notification preferences.
- Progress, engagement and grade trends with purpose limitation, explanation, minimum-cell privacy,
  and no automatic punitive decisions.

## 9. Production acceptance gate for every phase

No phase is stable merely because local unit tests pass. Required evidence:

1. Build the production backend and frontend Docker images from the committed Dockerfiles.
2. Run Prisma migration deploy/status and drift checks against a disposable production-like
   PostgreSQL database; preserve and verify real data for live-volume upgrades.
3. Run complete backend and frontend test suites inside Docker-built environments.
4. Run backend/frontend lint, type checks, dependency audits, and production builds.
5. Start the full Compose stack and require healthy backend, frontend, proxy, database, Redis, and
   worker containers.
6. Smoke public pages, health endpoint, unauthenticated denials, and authenticated positive/negative
   flows for every affected role.
7. Review logs for errors, leaked secrets/PII, failed jobs, and unexpected 4xx/5xx responses.
8. Update endpoint/type/schema/product/progress docs.
9. Commit one coherent stable slice and push it to `dev`; do not promote unstable work.

Passing these gates means no known issue was found by the defined checks. It is not a claim that
software is universally bug-free or vulnerability-free; production monitoring, review, and
periodic security testing remain necessary.

## 10. Immediate next action after this report

Implement Phase C modules and downloadable materials next. Phases A and B are complete and
production-Docker verified. Reuse Phase B's bounded presign/confirm/content-validation lifecycle,
but keep student materials private and authorize every download through enrollment/access policy.
