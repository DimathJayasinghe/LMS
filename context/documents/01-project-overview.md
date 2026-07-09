# 01 — Project Overview

> The single source of truth for **what** this system is, **who** it serves, and **what it explicitly will NOT do**.

---

## 1. Product Summary

**Academic LMS** is a Learning Management System for a **single tuition institution** that employs **several teachers across multiple subjects**.

It lets the institution run digitally: teachers schedule and stream lessons (physical and/or online), publish recorded videos, set exams (online MCQ, PDF upload, or in-class), have markers grade answers, and let front-desk staff manage attendance and monthly payments — all under one owner account.

The system targets **~1,200 registered students**, with read-heavy spikes (up to ~1,200 near-simultaneous readers) at moments like result releases. **It is deliberately built to run on one small VPS** — Redis caching absorbs the spikes, so no auto-scaling or cluster is required. See [02-architecture.md](./02-architecture.md) and [09-cost-and-hosting.md](./09-cost-and-hosting.md).

---

## 2. Core Objectives

| # | Objective | Success Metric |
|---|-----------|---------------|
| 1 | **Low cost to run** | Whole backend on one ~$5–12/mo VPS; managed DB + external services on free/pay-per-use tiers |
| 2 | **Simple to host & operate** | One `docker compose up -d --build` deploys nginx + API + worker + Redis; no cluster, no auto-scaling |
| 3 | **Secure exam delivery** | PDFs served via presigned URLs; server-authoritative timers; MCQ answers hidden until publish |
| 4 | **Protected content (live + recorded)** | Classes delivered in-site: recorded via IP-bound Bunny.net tokens + per-student watermark; live via server-signed Zoom SDK. All gated on active enrollment + paid month |
| 5 | **Automated attendance** | Zoom webhook → `upsert` attendance for streamed classes; QR/barcode scanning at the physical entrance |
| 6 | **Reliable payments** | PayHere online + pay-at-entrance (front-desk) + bulk Excel upload; all with idempotency keys |
| 7 | **Real-time updates** | SSE push for result releases, timetable changes, exam controls |
| 8 | **Production resilience** | Global error handler, BullMQ background jobs, Sentry crash reporting, structured Pino logging, managed DB backups |

---

## 3. User Roles

The institution has one owner, many teachers, front-desk staff, markers, and students. Roles are enforced by middleware; fine-grained exceptions use the optional per-user `Permission` overrides (see [08-database-design.md](./08-database-design.md)).

### 3.1 Super Admin (owner) — exactly one
- The institution owner. **Absolute control**: manage all users and roles, all subjects/courses, all finances, and all academic data.
- Only one Super Admin account exists.

### 3.2 Teacher — many
- A lecturer employed by the institution. Teaches one or more courses (each course belongs to a subject).
- **Can**: create and manage **their own** courses' class sessions, attach Zoom links / recordings, create exams, assign markers, and view their students' results and attendance.
- **Cannot**: manage users/roles, change other teachers' content, or access financial data.

### 3.3 Admin (front-desk staff) — many
- Institute managers / front-desk staff.
- **Daily operations**: scan student barcodes at the physical entrance, upload monthly payment Excel sheets, verify pending student accounts, resolve access issues.
- **Cannot** change system settings or user roles.

### 3.4 Marker (paper-marking crew) — many
- Assigned to specific exams by a Super Admin or the exam's Teacher.
- Grade student submissions (view answer PDFs, enter marks + feedback), submit final marks.
- View only the exams and submissions they are assigned to.

### 3.5 Student — many
- **Must complete account setup** before using the platform (see §4.1): upload NIC front/back photos and register any physical-institute barcodes.
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

Physical classes are held at **pre-configured physical centers ("institutes")** — e.g. a Nugegoda center and a Rathnapura center. These are **not** separate tenants; there is one LMS. The Super Admin maintains the **allowlist** of supported institutes; a student can only attach barcodes for institutes on that list.

**Two independent identifiers per student:**
1. **LMS QR code** (`User.barcode`) — issued by the LMS, globally unique, shown in-app for LMS-native/online entrance attendance.
2. **Institute barcodes** (`StudentBarcode`) — issued by each physical center's own card system, entered by the student during setup. A student who attends physical classes at two centers has **two** institute barcodes (one per institute).

> **Barcode uniqueness is per-institute, not global.** Two students at two different institutes may legitimately hold the *same* barcode value. Uniqueness is enforced as `@@unique([instituteId, barcode])`; the LMS QR (`User.barcode`) stays globally unique because the LMS issues it.

**Account setup (mandatory, after registration):**
1. Register → account is **pending**.
2. Complete setup: upload **NIC front + back photos** (stored privately in R2) and, if attending physical classes, **select each institute and enter its barcode**.
3. An Admin verifies the NIC and **approves** the account (existing pending → approve step), which activates it.
4. Content access stays gated until setup is complete and the account is active.

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
4. **View** their courses' attendance and results.

### Admin (front-desk)
1. **Entrance Desk** — scan a student's QR/barcode at the entrance to log attendance, and (optionally) collect the monthly fee on the spot (pay-at-entrance).
2. **Manage Timetable** — maintain the recurring weekly timetable and edit individual scheduled sessions (the schedule students see).
3. **Upload Payments** — bulk-create/update monthly payment records from an Excel sheet.
3. **Verify Accounts** — approve pending student registrations.
4. **Support Students** — reset passwords, resend activation, resolve access issues.

### Marker
1. **View Assigned Exams** — only exams they are assigned to.
2. **Grade Submissions** — open answer PDFs, input marks + feedback, submit final score (idempotent).

### Student
1. **Account Setup** (first login) — upload NIC front/back photos; select physical institute(s) and enter each institute's barcode. Required before content access.
2. **Dashboard** — upcoming classes, recent results, payment status at a glance.
3. **Attendance QR** — show a personal QR code in the app to scan at the physical entrance.
3. **Watch / Join** — stream recordings via Bunny.net; join live classes via Zoom.
4. **Sit Exam** — MCQ online, upload answer PDF, or attend in-class, within the server-timed window.
5. **View Results** & **Make Payment** — pay monthly fee online via PayHere, or in person at the entrance desk.

---

## 6. Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| Mobile native app (iOS/Android) | Web-first; responsive design covers mobile browsers |
| Multi-institute / multi-tenancy | System serves a single institution only |
| Built-in chat / messaging | Use existing channels (WhatsApp/Telegram groups) |
| Discussion forums | Low priority; can be added post-launch |
| Course marketplace / e-commerce | Not a course-selling platform |
| AI-powered grading / proctoring | Out of budget and complexity scope |
| CMS for marketing pages (Sanity) | **Cut for cost/simplicity** — marketing pages are static in Next.js |
| Email notifications | SMS via Notify.lk is the notification channel for v1 (email can be added later as a BullMQ job) |
| Kubernetes / auto-scaling | **Cut** — one VPS + Redis caching is sufficient at this scale |
| Advanced analytics / BI dashboards | Basic reports only; no data warehousing |
| Internationalization (i18n) | English-only UI for v1 |

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
| **Institute** | A pre-configured physical center/branch where classes are held (Super-Admin allowlist). Not a separate tenant. |
| **Institute Barcode** | An institute-issued scan code a student registers during setup; unique **per institute**, one per institute per student. Distinct from the LMS QR. |
| **LMS QR** | The LMS-issued, globally-unique code (`User.barcode`) shown in-app for LMS-native entrance attendance. |
| **NIC** | Sri Lankan National Identity Card; front + back photos uploaded during account setup and verified on approval. |
| **Permission** | Optional per-user JSON grant that fine-tunes what a specific user can do beyond their role. |
