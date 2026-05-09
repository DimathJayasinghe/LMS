# 01 — Project Overview

> The single source of truth for **what** this system is, **who** it serves, and **what it explicitly will NOT do**.

---

## 1. Product Summary

**Academic LMS** is a production-grade Learning Management System built for a single educational institute.  
It enables a head lecturer (Super Admin) to run an entire institute digitally — scheduling video lessons, hosting live Zoom classes, releasing exam papers, conducting online MCQ exams, managing result marking, processing monthly payments, and tracking physical attendance via barcode scanning.

The system is designed for **~1,200 registered students** with spikes of **1,200 concurrent users** during result releases and exam events.

---

## 2. Core Objectives

| # | Objective | Success Metric |
|---|-----------|---------------|
| 1 | **Secure exam delivery** | PDFs served via presigned URLs; answers uploaded with multipart resume; server-authoritative timers |
| 2 | **DRM video streaming** | IP-bound Bunny.net tokens; black-screen detection overlay for HDCP issues |
| 3 | **Automated attendance** | Zoom webhook → `upsert` attendance; barcode scanning at physical entrance |
| 4 | **Online payments** | PayHere integration with idempotency keys; bulk Excel upload for offline payments |
| 5 | **Real-time updates** | SSE push for result releases, timetable changes, exam controls |
| 6 | **Horizontal scalability** | Stateless Node.js servers; Redis for all shared state; PgBouncer connection pooling |
| 7 | **Production resilience** | Global error handler, BullMQ background jobs, Sentry crash reporting, structured Pino logging |

---

## 3. User Roles

### 3.1 Super Admin
- System owner and head lecturer.
- **Absolute control**: assign/change user roles, full access to financial + academic + user data.
- Only one Super Admin exists in the system.

### 3.2 Admin
- Institute managers / front-desk staff.
- **Daily operations**: scan student barcodes, upload monthly payment Excel sheets, verify pending student accounts, resolve access issues.
- **Cannot** change system settings or user roles.

### 3.3 Paper Marking Crew (Marker)
- Assigned to specific exams by Super Admin.
- Grade student submissions and submit final marks.
- View only the exams and submissions they are assigned to.

### 3.4 Student
- View scheduled classes, watch DRM-protected video recordings, join live Zoom sessions.
- Sit online MCQ exams with server-authoritative timers.
- Upload essay/paper PDFs.
- View published results, attendance records, and payment history.
- Make monthly fee payments via PayHere.

---

## 4. Key User Flows

### Super Admin Flows
1. **Manage Users** — Create accounts, assign roles (Admin / Marker / Student), activate/deactivate.
2. **Schedule Classes** — Create class sessions with date, Zoom link, and attach video recordings post-session.
3. **Create Exams** — Upload paper PDF to R2, set start/end times, assign markers.
4. **Publish Results** — Review marked submissions, publish batch results (triggers SSE + optional SMS).
5. **Financial Overview** — View payment dashboards, override payment statuses, generate reports.

### Admin Flows
1. **Barcode Attendance** — Scan student barcodes at physical entrance → log attendance.
2. **Upload Payments** — Upload monthly payment Excel → bulk-create/update payment records.
3. **Verify Accounts** — Approve pending student registrations.
4. **Support Students** — Reset passwords, resend activation links, resolve access issues.

### Marker Flows
1. **View Assigned Exams** — See only the exams they are assigned to mark.
2. **Grade Submissions** — Open student answer PDFs, input marks, submit final score (idempotent).

### Student Flows
1. **Dashboard** — View upcoming classes, recent results, payment status at a glance.
2. **Watch Videos** — Stream DRM-protected recordings via Bunny.net player.
3. **Join Live Class** — Launch Zoom Web SDK; attendance auto-logged via webhook.
4. **Sit Exam** — Download paper PDF, answer MCQs or upload answer PDF within server-timed window.
5. **View Results** — Check published marks and overall performance.
6. **Make Payment** — Pay monthly fee via PayHere gateway.

---

## 5. Out of Scope (v1)

The following features are **explicitly excluded** from the initial release:

| Feature | Reason |
|---------|--------|
| Mobile native app (iOS/Android) | Web-first; responsive design covers mobile browsers |
| Multi-institute / multi-tenancy | System serves a single institute only |
| Built-in chat / messaging | Use existing channels (WhatsApp/Telegram groups) |
| Discussion forums | Low priority; can be added post-launch |
| Course marketplace / e-commerce | Not a course-selling platform |
| AI-powered grading / proctoring | Out of budget and complexity scope |
| Custom CMS content authoring | Sanity CMS is used only for public marketing pages (banners, timetable) |
| Email-based notifications | SMS via Notify.lk is the primary notification channel for v1 |
| Advanced analytics / BI dashboards | Basic reports only; no data warehousing |
| Internationalization (i18n) | English-only UI for v1 |

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **SSE** | Server-Sent Events — one-way HTTP stream from server to client |
| **Presigned URL** | Time-limited, pre-authenticated URL for direct client-to-cloud file transfer |
| **Idempotency Key** | Client-generated UUID ensuring duplicate requests produce the same result |
| **Soft Delete** | Setting an `isDeleted` timestamp instead of physically removing a database row |
| **Upsert** | Create-if-absent, update-if-exists database operation |
| **HLS** | HTTP Live Streaming — adaptive bitrate video delivery in small chunks |
| **PgBouncer** | Connection pooler sitting in front of PostgreSQL to manage concurrent connections |
