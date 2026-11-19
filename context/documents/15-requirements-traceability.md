# 15 — Requirements Traceability

> Maps the general requirement list for a Sri Lankan A/L tuition LMS (agreed 2026-11-19) to what the
> repository actually does. Each row has a stable ID so tickets, specs and PRs can cite it.
>
> **Status values were checked against source and docs on 2026-11-19.** Where a row says *not verified*,
> the behaviour could not be confirmed from code and must be checked before being relied on. Update this
> file in the same PR as the feature, as the rule in `CLAUDE.md` requires for all `context/` docs.

## Status legend

| Status | Meaning |
|---|---|
| **Done** | Implemented and covered by code in `dev` |
| **Partial** | Some of the requirement exists; the gap is stated |
| **Planned** | Documented and scheduled (spec, roadmap phase or ADR); not built |
| **Gap** | Not built and not yet scheduled anywhere; a candidate for the roadmap |
| **Deferred** | Deliberately out of scope for now, by recorded decision |
| **Decide** | Conflicts with an earlier recorded decision; needs an owner ruling (see §2) |

Related documents: [01 overview](./01-project-overview.md), [13 roadmap](./13-product-roadmap.md),
[14 multi-tenancy ADR](./14-multi-tenancy-readiness.md),
[gap analysis 2026-08-20](../../docs/reports/2026-08-20-full-system-gap-analysis.md),
[payment channels and HYBRID spec](../../docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md).

## 1. Requirement matrix

### 1.1 Users and roles

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-USR-01 | Student account with self-service setup | Done | `Role.STUDENT`; `context/api_endpoints/account-setup.endpoints.md` |
| R-USR-02 | Parent/guardian account linked to children | Planned | Roadmap P1 "Guardian access"; no model or role exists yet |
| R-USR-03 | Teacher who owns courses | Done | `Course.teacherId`, `assertCourseAccess` |
| R-USR-04 | Institute owner/admin | Done | `SUPER_ADMIN` (owner of one organization, see ADR 14) |
| R-USR-05 | Front-desk staff | Done | `Role.ADMIN` |
| R-USR-06 | Paper markers | Done | `Role.MARKER`, `MarkerAssignment`, marker groups (Phase E1) |
| R-USR-07 | Platform operator for a future SaaS | Planned | ADR 14 §8–9; `PLATFORM_ADMIN` name reserved |
| R-USR-08 | Fine-grained RBAC | Partial | Role + ownership checks exist; the optional `Permission` model is an undocumented bypass risk (gap analysis §2: remove or build a tested engine) |
| R-USR-09 | One teacher account working at several organizations | Deferred | ADR 14 §9: accounts are per organization. Teachers across several **branches** of one organization already work |

### 1.2 Students and classes

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-STU-01 | Registration with school, A/L batch, stream, medium, trilingual name | Gap | `User` has name/NIC/phone/address/city only; no school, batch, stream or medium fields |
| R-STU-02 | Unique student ID as QR/barcode, printable ID card | Partial | `User.barcode` auto-issued and shown as a QR in the app; no printable card layout |
| R-STU-03 | Class setup: subject, teacher, fee, timetable, branch | Done | `Subject → Course`, `TimetableSlot`, `Institute` |
| R-STU-04 | Class capacity and teaching medium | Gap | No `capacity` or `medium` on `Course` |
| R-STU-05 | Enrol/unenrol; transfer between classes or branches | Partial | Enrol/cancel/reactivate exist; mode change is specified in the HYBRID design; no transfer workflow |
| R-STU-06 | Physical, online and hybrid attendance of one student | Planned | Sessions support all three; **enrollment** gains `HYBRID` per the payment/enrollment spec §4 |
| R-STU-07 | Free-card, half-fee, scholarship, sibling discounts | Planned | Roadmap P1 "Payments operations"; gap analysis Phase G |
| R-STU-08 | Bulk student import from Excel/CSV | Gap | Bulk Excel upload exists for payments only; exam rosters are replaced through the exam-audience API, not imported |
| R-STU-09 | Several children per guardian | Planned | With R-USR-02 |

### 1.3 Attendance

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-ATT-01 | QR/barcode scan at the entrance, institute-aware | Done | `AttendanceSource.QR/BARCODE`; `attendance.endpoints.md` |
| R-ATT-02 | NFC tap | Gap | Not planned |
| R-ATT-03 | Online attendance from live join or video watch | Done | Zoom webhook + reconciliation; `2026-07-12-video-watch-attendance-design.md` |
| R-ATT-04 | Hybrid sessions record from either source without duplicates | Done | `@@unique([userId, classSessionId])` |
| R-ATT-05 | Absent alerts to guardians by SMS | Gap | SMS infrastructure exists; needs R-USR-02 |
| R-ATT-06 | Attendance reports by student, class, month | Partial | Teacher/admin reports exist; per-student history and month rollups not verified |
| R-ATT-07 | Excused absence, dispute and correction | Planned | Gap analysis Phase F |
| R-ATT-08 | Make-up / revision class tracking | Gap | Not planned |

### 1.4 Fees and payments

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-PAY-01 | Monthly fee per class with paid/unpaid month | Done | `Payment`, `paymentMonth` |
| R-PAY-02 | Platform payment (card/wallet) | Done | PayHere onsite checkout; webhook-verified |
| R-PAY-03 | Front desk / physical institute cash with receipt | Done | `ENTRANCE` method; `PaymentReceipt` UI |
| R-PAY-04 | **Bank transfer with slip upload and staff approval** | Planned | Payment channels spec §3 (`PaymentSlip`, `BANK_TRANSFER`) |
| R-PAY-05 | Excel reconciliation | Done | `BULK` method |
| R-PAY-06 | Other local wallets (LankaQR, FriMi, Genie) | Gap | Only via whatever PayHere exposes |
| R-PAY-07 | Content locks when unpaid, with a configurable grace period | Partial | Hard gate in `access.service.ts`; grace/waiver/dispute exceptions planned as `AccessException` (gap analysis Phase G, flagged P0 for fairness) |
| R-PAY-08 | Refunds and adjustments with an audit trail | Done | `PaymentAdjustment` immutable ledger; provider-executed refunds planned |
| R-PAY-09 | Defaulter list and automatic reminders | Partial | Outstanding totals exist; no scheduled reminder job |
| R-PAY-10 | Teacher/institute revenue share or commission | Gap | Teachers see own-class aggregates only; no payout/settlement model |
| R-PAY-11 | Advance payment, multi-month, installments | Planned | Phase G; explicitly out of the slip spec |
| R-PAY-12 | Per-mode fees (online / physical / hybrid) | Decide | Payment channels spec §4.4 |

### 1.5 Online learning

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-LRN-01 | Live classes embedded in the site | Done | Zoom Meeting SDK; **provider credentials are placeholders**, staging proof outstanding |
| R-LRN-02 | Private recordings | Done | Bunny Stream with TUS upload and webhook; **the configured Bunny key is documented as invalid**, so real playback is unproven |
| R-LRN-03 | Notes, tutorials, slides, past papers | Partial | Private PDF/image modules; link/text/audio types planned |
| R-LRN-04 | Organization by subject, unit, syllabus (NIE alignment) | Partial | Subject → course → modules; no syllabus mapping |
| R-LRN-05 | Adaptive streaming | Done | Bunny HLS (provider-supplied) |
| R-LRN-06 | Offline/protected download of videos | Gap | Not planned; conflicts with DRM goals |
| R-LRN-07 | Low-bandwidth mode | Planned | Roadmap P1 "Student support" |
| R-LRN-08 | Playback speed, resume, chapters | Partial | Speed comes from Bunny's player; resume and chapters not verified |
| R-LRN-09 | Q&A or comments per lesson | Planned | Roadmap P1 "Communication" |

### 1.6 Content protection

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-PRO-01 | Signed, expiring video access | Done | `getSignedBunnyEmbedUrl` in `utils/bunny.ts` (token-authenticated embed). Earlier docs described IP-bound HLS tokens; that code path is dead and the docs were corrected on 2026-11-19 |
| R-PRO-02 | DRM | Partial | MediaCage DRM is a Bunny library setting; the design says to enable it "if the plan allows". It cannot be verified from code. Basic token protection works without it |
| R-PRO-03 | Per-student watermark | Done | `VideoPlayer.tsx`, `LiveClassRoom`; a deterrent, not a guarantee |
| R-PRO-04 | Block screen recording | Deferred | Web SDK cannot; recorded as an accepted limitation (02 §7.1) |
| R-PRO-05 | Device limit and single active session | Gap | Not built or planned; propose roadmap P1 |
| R-PRO-06 | Detect and block account sharing | Gap | Depends on R-PRO-05 |
| R-PRO-07 | Access tied to enrollment and payment | Done | `assertStudentContentAccess` |
| R-PRO-08 | Audit of who watched what | Partial | Watch-attendance exists; routine view logging is intentionally excluded from the audit table (gap analysis §4.4) |

### 1.7 Assessments

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-EXM-01 | MCQ with auto-marking | Done | `Exam.mcqPayload` |
| R-EXM-02 | Structured/essay by typed or scanned upload | Done | `allowTypedAnswers`, `allowPdfUpload` |
| R-EXM-03 | Server-timed exams | Done | 02 §5.3 |
| R-EXM-04 | Anti-cheat (shuffle, tab-switch detection) | Planned | Roadmap P2 "Academic integrity" |
| R-EXM-05 | Reusable question bank by unit/difficulty/past paper | Planned | Roadmap P1 |
| R-EXM-06 | Marking workflow, marker groups | Done / Partial | Exact assignment done; groups E1 done; allocation snapshots (E2) next |
| R-EXM-07 | Physical-paper marks entered by staff | Planned | Tracker 2026-09-06: Phase E must add the staff API |
| R-EXM-08 | Rankings and percentiles | Planned | Roadmap P1 "Gradebook" |
| R-EXM-09 | Student progress charts and weak-topic analysis | Planned | Roadmap P2 "Learning analytics" |
| R-EXM-10 | Shared or separate exam instances per audience | Partial | Exam papers, revisions, audiences and participants are merged on `dev`; the design and delivery plan are described in the 06 tracker (2026-09-06 entries) and live on the `docs/customizable-exam-marking` branch, not yet on `dev` |

### 1.8 Communication

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-COM-01 | SMS through a local gateway | Done | Notify.lk; `SmsLog`; BullMQ job |
| R-COM-02 | Message templates for absence, fee due, cancellations | Partial | Only three `NotificationType` values exist |
| R-COM-03 | In-app real-time updates | Done | SSE |
| R-COM-04 | Email | Deferred | Decision 2026-07-09; the `resend` dependency is already removed |
| R-COM-05 | WhatsApp as a notification channel | Decide | Chat features are out of scope; one-way WhatsApp notifications are a separate question (§2) |
| R-COM-06 | Push notifications | Planned | With the PWA (roadmap P2) |
| R-COM-07 | Announcements per class/batch | Planned | Roadmap P1 "Communication" |
| R-COM-08 | Timetable-change alerts | Partial | SSE event exists; no SMS template |

### 1.9 Localization

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-LOC-01 | Sinhala, Tamil and English UI | Decide | Recorded as "English-only for v1" but roadmap P2 lists it (see §2) |
| R-LOC-02 | Correct Sinhala/Tamil Unicode in PDFs and receipts | Gap | Not verified |
| R-LOC-03 | Sinhala/Tamil text search | Gap | Not planned |
| R-LOC-04 | Local time zone and LKR formatting | Partial | `Asia/Colombo` is used for timetable; no locale layer |
| R-LOC-05 | Local phone validation (+94, 07x) | Gap | Not verified |

### 1.10 Reports

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-RPT-01 | Financial reports, scoped by role | Done | Admin reports; teacher own-class aggregates |
| R-RPT-02 | Per-student attendance, fees, marks trend | Partial | Pieces exist; no combined student profile |
| R-RPT-03 | Daily collection report for the counter | Gap | Month summary exists; a per-day, per-collector view is not verified |
| R-RPT-04 | Export to Excel/PDF | Planned | Phase G settlement/export |
| R-RPT-05 | Owner dashboard on mobile | Partial | Responsive web; role dashboards tracked in issue #81 |

### 1.11 Platform and non-functional

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-NFR-01 | Mobile-first responsive web | Partial | Responsive; PWA planned (P2); native app Deferred |
| R-NFR-02 | Capacity | Decide | Documented target is ~1,200 students on one VPS; no load test evidence ([production delivery baseline](../../docs/plans/2026-09-06-production-delivery-baseline.md), owner clarification). See §2 |
| R-NFR-03 | Multi-tenant ready | Planned | ADR 14 |
| R-NFR-04 | Offline-tolerant UX | Gap | Roadmap mentions selected offline downloads only |
| R-NFR-05 | Backups and recovery | Partial | Scheduled verified dumps; encryption, off-site copy and restore drill outstanding (P0) |
| R-NFR-06 | OTP/2FA login | Gap | Not built; propose roadmap P2 |
| R-NFR-07 | Rate limiting, secure headers, audit logs | Done | Helmet, Redis rate limits, `AuditLog` |
| R-NFR-08 | PDPA 2022 compliance, consent, retention, data export/delete | Gap | Gap analysis P0 "Privacy"; no policy pages, retention schedule or subject-access workflow |
| R-NFR-09 | Minors' consent | Gap | Part of R-NFR-08 |
| R-NFR-10 | Accessibility | Planned | WCAG 2.2 AA audit is P0 |

### 1.12 Administration and operations

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-OPS-01 | Teacher onboarding | Partial | `SUPER_ADMIN` creates accounts and assigns subjects; no contracts workflow |
| R-OPS-02 | Timetable clash detection | Done | Course, teacher and branch overlap checks |
| R-OPS-03 | Room/hall and capacity scheduling | Planned | Roadmap P2 "Multi-institute operations" |
| R-OPS-04 | Staff payroll | Deferred | Not part of an LMS |
| R-OPS-05 | Helpdesk / complaints | Gap | Not planned |
| R-OPS-06 | Printable student ID cards | Gap | See R-STU-02 |

### 1.13 Nice-to-have

| ID | Requirement | Status | Evidence / where tracked |
|---|---|---|---|
| R-NTH-01 | Gamification | Deferred | Not planned |
| R-NTH-02 | AI doubt-solving and generation | Planned | Roadmap P3, human-approved only |
| R-NTH-03 | Marketplace of teachers/classes | Deferred | Out of scope in 01 §6 |
| R-NTH-04 | Certificates and achievement showcase | Planned | Roadmap P2 "Credentials" |
| R-NTH-05 | Parent mobile app | Deferred | Parent web access first (R-USR-02) |
| R-NTH-06 | Free trial classes, referrals | Gap | Not planned |

## 2. Where the generic list conflicts with earlier decisions

These were **not** silently overridden. Each needs an explicit owner answer; until then the earlier
decision stands.

| # | Generic requirement | Earlier decision | Recommendation |
|---|---|---|---|
| 1 | Multi-tenant SaaS, several institutes | 01 §6 listed multi-tenancy as out of scope | **Resolved 2026-11-19:** the codebase becomes tenant-ready, deployed for one organization first (ADR 14) |
| 2 | Sinhala and Tamil UI | "English-only for v1" (01 §6); roadmap P2 already lists it | Decide whether launch needs it. Recommended: add the message-catalog scaffolding and a per-user `locale` now, because retrofitting strings across every screen later is far costlier, and translate screen by screen |
| 3 | 3,000+ students in one class | Target is ~1,200 students total on one VPS | Treat 1,200 as the supported scale until a load test proves more ([production delivery baseline](../../docs/plans/2026-09-06-production-delivery-baseline.md)) |
| 4 | Email and WhatsApp channels | Email deferred; chat out of scope | Keep email deferred. Decide whether one-way WhatsApp notifications are acceptable (needs a Business API provider and cost) |
| 5 | Native Android app | Native apps deferred; PWA planned | Keep web/PWA; revisit only for OS-level capture blocking |
| 6 | Discussion forums and announcements | 01 §6 said forums are out of scope for v1, while roadmap P1 lists threaded discussions | Reconcile: announcements in P1, threaded discussions later. 01 now points at the roadmap |
| 7 | Block screen recording | Documented as an accepted limitation of the Web SDK | Keep; rely on watermark, device limits and DRM where available |
| 8 | NIC approval and verification | Decision 2026-07-10: no approval gate | Keep; revisit alongside PDPA work (R-NFR-08) |
| 9 | Hard payment lock | Gap analysis flags it as unfair without exceptions | Build `AccessException` (Phase G) before a public launch |
| 10 | "Super admin can do everything" | Global oversight, not impersonation (gap analysis §2) | Keep |
| 11 | PHYSICAL-only students and online content | Today the gate ignores `classType` | **Resolved 2026-11-19:** physical-only students lose live/recording access unless `HYBRID` or the session opts in (`onlineForPhysical`); payment/enrollment spec §4.4 |

## 3. Candidate roadmap additions

Items marked **Gap** above that are not in [13-product-roadmap.md](./13-product-roadmap.md). They were
added there on 2026-11-19 so they are scheduled rather than forgotten:

- Student profile fields (school, batch, stream, medium) and class capacity/medium (R-STU-01, R-STU-04).
- Bulk student import (R-STU-08).
- Device limit and single active session (R-PRO-05, R-PRO-06).
- OTP login (R-NFR-06).
- Scheduled fee-reminder and absence SMS (R-PAY-09, R-ATT-05).
- Teacher settlement/commission statements (R-PAY-10).
- Printable ID cards (R-STU-02, R-OPS-06).
- Unicode checks for Sinhala/Tamil in generated documents (R-LOC-02).
