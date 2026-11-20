# 01 — Project Overview

> The single source of truth for **what** this system is, **who** it serves, and **what it explicitly will NOT do**.

---

## 1. Product Summary

**Academic LMS** is a Learning Management System for Sri Lankan tuition institutes (A/L and similar classes). It is **deployed for a single organization first** — one tuition institution that employs **several teachers across multiple subjects** — but the codebase is being made **multi-tenant ready** so that serving further institutes later is an onboarding task, not a rewrite. See [14-multi-tenancy-readiness.md](./14-multi-tenancy-readiness.md).

It lets the institution run digitally: teachers schedule and stream lessons (physical, online, or both), publish recorded videos, set exams (online MCQ, PDF upload, or in-class), have markers grade answers, and let front-desk staff manage attendance and monthly payments — all under one owner account per organization. Students pay on the platform, at the front desk, or by bank transfer with an uploaded slip.

The system targets **~1,200 registered students**, with read-heavy spikes (up to ~1,200 near-simultaneous readers) at moments like result releases. **It is deliberately built to run on one small VPS** — Redis caching absorbs the spikes, so no auto-scaling or cluster is required. See [02-architecture.md](./02-architecture.md) and [09-cost-and-hosting.md](./09-cost-and-hosting.md).

---

## 2. Core Objectives

| # | Objective | Success Metric |
|---|-----------|---------------|
| 1 | **Low cost to run** | Whole backend on one ~$5–12/mo VPS; managed DB + external services on free/pay-per-use tiers |
| 2 | **Simple to host & operate** | One `docker compose up -d --build` deploys nginx + API + worker + Redis; no cluster, no auto-scaling |
| 3 | **Secure exam delivery** | PDFs served via presigned URLs; server-authoritative timers; MCQ answers hidden until publish |
| 4 | **Protected content (live + recorded)** | Classes delivered in-site: recorded via Bunny.net's token-authenticated embed player (MediaCage DRM where enabled on the library) + per-student watermark; live via server-signed Zoom SDK. All gated on active enrollment + paid month |
| 5 | **Automated attendance** | Zoom webhook → `upsert` attendance for streamed classes; QR/barcode scanning at the physical entrance |
| 6 | **Reliable payments** | Three channels into one ledger: PayHere on the platform, pay-at-entrance at the front desk or a branch, and bank transfer with a staff-approved slip (planned); plus bulk Excel upload; all with idempotency keys |
| 7 | **Real-time updates** | SSE push for result releases, timetable changes, exam controls |
| 8 | **Production resilience** | Global error handler, BullMQ background jobs, Sentry crash reporting, structured Pino logging, managed DB backups |

---

## 3. User Roles

Each organization has one owner, many teachers, front-desk staff, markers, and students. A guardian role is planned (roadmap P1) and a platform-operator role (`PLATFORM_ADMIN`) is reserved for the future SaaS operator; neither exists in code yet. Roles are enforced by middleware; exceptions are expressed as resource and target guards, not per-user overrides (the unused `Permission` model is removed, D-IDENTITY-4).

### 3.1 Super Admin (owner) — one per organization, up to two
- The organization owner. **Global oversight and management within the organization**: manage all users and roles, all subjects/courses, all finances, and all academic data. This is oversight, not impersonation: persona actions such as sitting an exam or submitting marks as a marker stay restricted, and emergency overrides are explicit, reasoned and audited (see the [gap analysis](../../docs/reports/2026-08-20-full-system-gap-analysis.md) §2).
- One owner per organization by default; a co-owner (`identity.maxOwners` = 2) is added only by an operator CLI (D-IDENTITY-5).

### 3.2 Teacher — many
- A lecturer employed by the institution. Teaches one or more courses (each course belongs to a subject).
- **Can**: create and manage **their own** courses' class sessions, attach Zoom links / recordings, create exams, assign markers, and view their students' results and attendance.
- **Cannot**: manage users/roles, change other teachers' content, or access institution-wide or
  student-level financial histories. Teachers may view aggregate income/outstanding analytics for
  classes they own.

### 3.3 Admin (front-desk staff) — many
- Institute managers / front-desk staff.
- **Daily operations**: scan student barcodes at the physical entrance, upload monthly payment Excel sheets, reassign lost cards, activate or deactivate accounts, resolve access issues (there is no pending-account approval queue; see §4.1).
- **Cannot** change system settings or user roles.

### 3.4 Marker (paper-marking crew) — many
- Assigned to specific exams by a Super Admin or the exam's Teacher.
- Grade student submissions (view answer PDFs, enter marks + feedback), submit final marks.
- View only the exams and submissions they are assigned to.

### 3.5 Student — many
- **Must complete account setup** before using the platform (see §4.1): upload NIC front/back photos and, only if attending physical classes, optionally register institute barcodes (barcodes never gate completion).
- Enroll in one or more courses; view scheduled classes; watch recordings; join live classes.
- Sit online MCQ exams (server-authoritative timers), upload answer PDFs, or sit in-class exams.
- View published results, attendance records, and payment history; pay monthly fees via PayHere.

---

## 4. Academic Model

```
Subject  (e.g. Physics, Chemistry, Combined Maths)   ← top level
  └─ Course  (e.g. "2026 A/L Theory")  { subjectId, teacherId, year, monthlyFee }
        ├─ ClassSession   (a lesson: physical / online, optionally live-streamed and/or recorded)
        ├─ Exam           (MCQ / WRITTEN / HYBRID / INCLASS)
        └─ Enrollment     (student ↔ course, per ClassType)  →  Payment (per month)
```

- **Subject** is the top-level grouping. Multiple subjects exist; each is taught by one or more teachers via their courses.
- **Course** is what a student actually enrols in and pays a monthly fee for. It belongs to exactly one Subject and is taught by exactly one Teacher.
- **Class types** — a student's `Enrollment` has a delivery type of `PHYSICAL`, `ONLINE`, or (planned) `HYBRID`, which means one enrollment and one fee with both physical attendance and online access. See the [payment channels and HYBRID design](../../docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md).
- **Class delivery** — a `ClassSession` may be delivered **physically, online, or both**:
  - A `zoomLink` present means the session is **live-streamed** (online students join live; attendance auto-logged via Zoom webhook).
  - A physical session **may also** be live-streamed (set `zoomLink`) so online students can attend simultaneously.
  - `VideoRecording`s may be attached afterward for on-demand playback — independently of whether it was live.
- **Exam delivery** — an exam belongs to a **course**, so the **same question paper is given to both online and physical students**. A single paper may mix an **MCQ section**, **structured questions**, and **essays** (`HYBRID`). Each student chooses how to submit, within the channels the exam allows:
  - **MCQ** — answered inline online; auto-graded.
  - **Typed answers** — the student writes structured/essay answers online in the LMS (autosaved to survive power cuts).
  - **Scanned upload** — the student writes on physical A4 paper and uploads a scanned answer PDF.
  - Any enrolled student can submit through the LMS regardless of how they attended; a Marker grades the written/typed parts. `INCLASS` is reserved for pure paper exams with no LMS submission (marks entered by a Marker/Admin).

---

## 4.1 Physical Institutes & Account Setup

Physical classes are held at **pre-configured physical centers ("institutes")** — e.g. a Nugegoda center and a Rathnapura center. An institute is a **branch inside one organization**, not a tenant: the tenant is the `Organization` ([14-multi-tenancy-readiness.md](./14-multi-tenancy-readiness.md)). The Super Admin maintains the **allowlist** of supported institutes; a student can only attach barcodes for institutes on that list.

**Two independent identifiers per student:**
1. **LMS QR code** (`User.barcode`) — issued by the LMS, unique within the organization and across all scan-code kinds, shown in-app for LMS-native/online entrance attendance. **Auto-generated at registration** (originally derived from the student's index number; new and reissued codes are random and unguessable, D-ACCESS-4) — every student gets one immediately, not only once an admin manually assigns it. An admin can still reassign it later (e.g. a lost card) via the pre-existing `PATCH /users/:id/barcode`.
2. **Institute barcodes** (`StudentBarcode`) — issued by each physical center's own card system, entered by the student during setup as a **plain text field** (never a scan/photo in our UI — the student is just typing in a code the institute already printed on a card). A student who attends physical classes at two centers has **two** institute barcodes (one per institute).

> **Barcode uniqueness is per-institute, not global.** Two students at two different institutes may legitimately hold the *same* barcode value. Uniqueness is enforced as `@@unique([instituteId, barcode])`; the LMS QR (`User.barcode`) stays globally unique because the LMS issues it.

> **Attendance-marking reality check (audited 2026-11-19; supersedes the 2026-07-10 note)**: the schema and
> docs describe three ways to mark attendance (QR/barcode scan, live Zoom join, recorded-video watch). The
> entrance scan resolves a code against both the LMS QR (`User.barcode`) and a student's institute barcode
> (`StudentBarcode`), but it does **not** check enrollment, delivery mode or payment, and scan resolution
> between the two code kinds can be ambiguous (findings F-07, F-12). The live-Zoom
> automatic path matches a participant only by email, which the embedded Meeting SDK join does not supply, so
> it is unreliable as built (F-14). The recorded-video flag is client-asserted (F-24). See
> [18-flow-audit-findings-register.md](./18-flow-audit-findings-register.md) and
> `context/api_endpoints/attendance.endpoints.md`'s "Attendance channels" section.

**Account setup (mandatory, after registration; implemented 2026-07-10):**
1. Register → account is **immediately active** (no pending/approval state — see below).
2. Complete setup: upload **NIC front + back photos** (stored privately in R2, direct-to-R2 presigned
   upload — server never touches the file) and, **only if attending physical classes**, select each
   institute and enter its barcode (optional — doesn't gate completion).
3. `setupCompleted` **auto-flips to `true` server-side** the instant both NIC photos are on file —
   no separate Admin verification/approval step exists (see the decision note below). Content access
   is gated on `setupCompleted` alone, enforced by `(app)/layout.tsx` redirecting an incomplete
   `STUDENT` to `/auth/account-setup` before any other screen renders.

> **Decision: no admin NIC-approval gate (2026-07-10).** This section previously described a
> "pending → Admin verifies NIC → approves" flow. That state never actually existed anywhere in the
> schema or code (only `setupCompleted` and `deletedAt` exist; `register()` always made accounts
> immediately active) — it was written intent that was never built. Rather than build a real
> approval queue now, the decision was to keep student self-service simple: NIC photos are stored
> but not reviewed by anyone before the account counts as "set up." Revisit if/when there's a
> concrete reason to gate on human review (see the fraud/abuse note in
> `account-setup.endpoints.md`).

---

## 5. Key User Flows

### Super Admin
1. **Manage Users & Roles** — create accounts; assign Teacher / Admin / Marker / Student; activate/deactivate.
2. **Manage Subjects & Courses** — create subjects, create courses under them, assign a teacher and monthly fee.
2b. **Manage Institutes** — maintain the allowlist of supported physical centers.
3. **Financial Overview** — payment dashboards, override payment statuses, generate reports.
4. **Full academic oversight** — everything a Teacher can do, across all courses.

### Teacher
1. **Manage Own Courses** — schedule class sessions (set date, delivery mode, Zoom link if streamed), attach recordings.
2. **Create Exams** — upload paper PDF / build MCQ, set start/end times, assign markers.
3. **Publish Results** — review marked submissions, publish batch results (triggers SSE + optional SMS).
4. **View** their courses' attendance, results, and aggregate class income/outstanding analytics.

### Admin (front-desk)
1. **Entrance Desk** — scan a student's QR/barcode at the entrance to log attendance, and (optionally) collect the monthly fee on the spot (pay-at-entrance).
2. **Manage Timetable** — maintain the recurring weekly timetable and edit individual scheduled sessions (the schedule students see).
3. **Upload Payments** — bulk-create/update monthly payment records from an Excel sheet.
3b. **Review Bank Slips** (planned) — approve or reject uploaded bank-transfer slips; an approved slip settles the month and opens content.
4. **Support Students** — reassign a lost LMS QR (`PATCH /users/:id/barcode`), activate/deactivate accounts, resolve access issues. There is no account-approval step to action (§4.1) — setup completes automatically once a student uploads both NIC photos.

### Marker
1. **View Assigned Exams** — only exams they are assigned to.
2. **Grade Submissions** — open answer PDFs, input marks + feedback, submit final score (idempotent).

### Student
1. **Account Setup** (first login) — upload NIC front/back photos (required, gates content access) and, only if attending physical classes, select institute(s) and enter each one's barcode (optional).
2. **Dashboard** — upcoming classes, recent results, payment status at a glance.
3. **Attendance QR** — show a personal QR code in the app to scan at the physical entrance.
3. **Watch / Join** — stream recordings via Bunny.net; join live classes via Zoom.
4. **Sit Exam** — MCQ online, upload answer PDF, or attend in-class, within the server-timed window.
5. **View Results** & **Make Payment** — pay the monthly fee online via PayHere, in person at the entrance desk, or by bank transfer with an uploaded slip (planned).

---

## 6. Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| Mobile native app (iOS/Android) | Web-first; responsive design covers mobile browsers. An installable PWA is on the roadmap (P2) |
| ~~Multi-institute / multi-tenancy~~ | **Reversed 2026-11-19.** Deployed for one organization first, but built tenant-ready. Billing, plans, a platform console and per-tenant custom domains are still out of scope. See [14-multi-tenancy-readiness.md](./14-multi-tenancy-readiness.md) |
| Built-in chat / messaging | Use existing channels (WhatsApp/Telegram groups). Course announcements are roadmap P1; one-way WhatsApp notifications are an open question ([15 §2](./15-requirements-traceability.md)) |
| Discussion forums | Threaded discussions are roadmap P1 ([13](./13-product-roadmap.md)); not part of the first launch |
| Course marketplace / e-commerce | Not a course-selling platform |
| AI-powered grading / proctoring | Out of budget and complexity scope |
| CMS for marketing pages (Sanity) | **Cut for cost/simplicity** — marketing pages are static in Next.js |
| Email notifications | SMS via Notify.lk is the notification channel for v1 (email can be added later as a BullMQ job) |
| Kubernetes / auto-scaling | **Cut** — one VPS + Redis caching is sufficient at this scale |
| Advanced analytics / BI dashboards | Basic reports only; no data warehousing |
| Internationalization (i18n) | English-only UI for the first launch. Sinhala/Tamil is roadmap P2; the owner is asked whether launch needs it ([15 §2](./15-requirements-traceability.md)) |

---

## 7. Glossary

| Term | Definition |
|------|-----------|
| **Subject** | Top-level academic area (Physics, Chemistry, …). Contains many courses. |
| **Course** | What a student enrols and pays for; belongs to one Subject, taught by one Teacher (e.g. "2026 A/L Theory"). |
| **Class Session** | A single scheduled lesson under a course; physical/online, optionally live-streamed and/or recorded. May be generated from a timetable slot. |
| **Timetable** | The recurring weekly schedule. Built from `TimetableSlot`s (course + day + time + institute); a weekly job materializes dated Class Sessions from them. Admins/teachers edit it. |
| **Banner / Backdrop** | Display images on a course (`Course.bannerUrl` / `backdropUrl`) shown on the course page and dashboard. |
| **Enrollment** | A student's link to a course (with a delivery `ClassType`); each enrollment is paid monthly and independently. |
| **SSE** | Server-Sent Events — one-way HTTP stream from server to client. |
| **Presigned URL** | Time-limited, pre-authenticated URL for direct client-to-cloud file transfer. |
| **Idempotency Key** | Client-generated UUID ensuring duplicate requests produce the same result. |
| **Soft Delete** | Setting a `deletedAt` timestamp instead of physically removing a row. |
| **Upsert** | Create-if-absent, update-if-exists database operation. |
| **HLS** | HTTP Live Streaming — adaptive video delivery in small chunks. |
| **Organization** | The tenant: one tuition institute as a customer of the platform, with its own users, courses, payments and provider accounts. Today there is exactly one (the default organization). |
| **Institute** | A pre-configured physical center/branch where classes are held (Super-Admin allowlist). A branch inside an organization, not a tenant. |
| **Platform** | The operator of the SaaS. Future; the `PLATFORM_ADMIN` role name is reserved. |
| **HYBRID** | Planned enrollment type: one enrollment and one fee covering both physical attendance and online access. |
| **Bank slip** | Planned payment evidence: a student uploads a bank-transfer slip that `ADMIN`/`SUPER_ADMIN` approve or reject. |
| **Institute Barcode** | An institute-issued scan code a student registers during setup; unique **per institute**, one per institute per student. Distinct from the LMS QR. |
| **LMS QR** | The LMS-issued, globally-unique code (`User.barcode`) shown in-app for LMS-native entrance attendance. |
| **NIC** | Sri Lankan National Identity Card; front + back photos uploaded during account setup and stored privately. There is no approval or verification step (§4.1), and staff currently cannot view them (audit F-30); photos are no longer collected (D-IDENTITY-1); the NIC number is optional and never requested from anyone under 18. |
| **Permission** | Removed (D-IDENTITY-4): never enforced in code; authorization is role plus resource and target guards. The model is dropped in Wave 1b Task 7. |
