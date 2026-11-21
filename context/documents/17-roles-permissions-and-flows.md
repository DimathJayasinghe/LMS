# 17 — Roles, Permissions, Scope and User Flows

> **Audit of 2026-11-19.** Checks whether the role model, the permission and scope rules and the end-to-end
> user journeys add up to workflows a Sri Lankan tuition institute can actually run, or only to a set of
> features with inconsistent access. Method: a mechanical route matrix of all 145 endpoints, service-guard and
> frontend-gate extraction, nine per-domain audits (accounts, catalog/timetable, attendance, delivery,
> enrollment and payment, exams, oversight, staff UX, student UX), live probes with one login per role on a
> disposable local stack, and rendered-page checks per role.
>
> **Scope of this change: documentation only.** No code was changed. Findings, fixes and a sequence are
> recorded here and in [18-flow-audit-findings-register.md](./18-flow-audit-findings-register.md) (127 findings: 1 critical, 18 high, 86 medium, 22 low, ids `F-nn`). The 2026-11-19 decisions are **cited, not reopened**: Express + Next, Organization =
> tenant and Institute = branch ([14](./14-multi-tenancy-readiness.md)), HYBRID enrollment and three payment
> channels (planned, [spec](../../docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md)),
> and the PHYSICAL-only access rule (planned).
>
> **Update 2026-11-20.** The open owner decisions in §9 were settled by delegation and are recorded in
> [19-owner-decisions-2026-11-20.md](./19-owner-decisions-2026-11-20.md) (57 decisions, defaults configurable and reversible). §7 below
> carries the resulting fix order; the task-level plans are in `docs/superpowers/plans/2026-11-20-wave-*.md`.
>
> Related: [01 overview](./01-project-overview.md), [15 traceability](./15-requirements-traceability.md),
> [13 roadmap](./13-product-roadmap.md). Evidence labels `live` / `code` are defined in doc 18.

## 1. Verdict

The foundations are sound: the three-tier backend, ownership guards on course-scoped writes,
actor-versus-target protection on privileged accounts (held under live tests), signed-webhook verification for
PayHere and Bunny, refund and override rules with an immutable adjustment trail, and server-authoritative exam
windows. **The problem is not missing endpoints; it is that the roles do not have a complete working day.**
Teachers, front desk and markers each hit a dead end partway through their core job, while access to paid
content is one coarse rule applied differently depending on the route.

| Theme | What is wrong in one line | Findings |
|---|---|---|
| T1 Session and account lifecycle | Browser sessions die 15 minutes after login; no password recovery; deactivation lags; no staff creation | F-01, F-02, F-03, F-15, F-21, F-31, F-32 |
| T2 Staff have no operating surface | Front desk cannot enroll a walk-in, see who owes, or tally cash; teacher has no roster; nobody can enter hall-paper marks | F-10, F-11, F-13, F-67, F-77, F-83 |
| T3 One content gate, applied inconsistently | recording access is not scoped uniformly across roles; the gate looks only at the current month; exams are not gated | F-04, F-05, F-06, F-23 |
| T4 No branch dimension | A course, enrollment and session carry no branch; one class per branch at a time; scanner not branch-aware | F-52, F-53, F-37 |
| T5 Identity and attendance integrity | Scan identity resolution, QR integrity, Zoom webhook hardening, SDK joins that very likely cannot match students, attendance reads that are not scoped | F-07, F-08, F-09, F-14, F-54 |
| T6 Money edges | Bulk upload is an unaudited front-desk money edit; cash and PayHere can double-settle; chargebacks ignored; no free/half card or proration | F-58, F-61, F-63, F-64 |
| T7 Exams cannot be run end to end | Teacher cannot mark; hall (`INCLASS`) marks have no entry path; scoped exams cannot be sat; non-MCQ work is not autosaved | F-13, F-17, F-22, F-67, F-86 |
| T8 Communication | Three SMS events, all to the student's own phone; none for absence, fee due or timetable change | F-25, F-76, F-72 |
| T9 Documentation drift | Doc 01 contradicts itself and the code; CLAUDE.md and doc 15 overstated the content gate and the attendance channels | F-14, F-26, F-34, F-66 |
| T10 Commercial and lifecycle model | No teacher settlement, class medium or capacity, drop and transfer lifecycle, non-monthly products, assistant role, substitutes, year rollover, minors' consent and retention | F-91 to F-102 |
| T11 Scheduling, offboarding and oversight hygiene | Timetable-generated classes cannot go live, front desk not tied to a branch, offboarding without hand-over, no SMS log, thin security audit | F-104, F-105, F-107, F-118, F-120, F-121 |

**Most urgent single item:** F-01: browser sessions end about 15 minutes after login (verified in code; the logout itself has not been replayed, so reproduce it before fixing). Users are sent to login mid-exam and mid-queue. The fix needs a server-side renewal path, not only a cookie change (effort M); mechanics are in the private audit notes.

## 2. Roles and how scope is actually enforced

Roles: `SUPER_ADMIN` (the owner; one organization), `TEACHER`, `ADMIN` (front desk), `MARKER`, `STUDENT`
(`PLATFORM_ADMIN` is reserved and not in the enum).

Enforcement has three layers, and the gaps are always between them:

1. **Authentication** — `verifyToken` verifies the JWT cookie only and sets `{userId, role}`. There is **no
   database lookup**, so a deactivation or role change lags up to 15 minutes (F-15, `live`).
2. **Role gate** — `requireRole(...)` checks the *caller's* role only. **29 authenticated routes have no
   `requireRole`** and rely entirely on service scoping (class, session, module, material, video, attendance
   by student, timetable, notifications, stream, subjects, institutes).
3. **Resource and target scope** — service guards: `assertCourseAccess` (teacher owns the course),
   `assertStudentContentAccess`, `assertMarkerAssignedToExam[Audience]`, `assertCanManagePrivilegedTarget`.

| Role | Scope as implemented | Where it leaks or is thin |
|---|---|---|
| `SUPER_ADMIN` | Whole organization; sole holder of refund, override, role change, audit log, institutes, subjects, notification settings | Owner invariants missing: can mint more owners, demote the last, deactivate self (F-31). Seed script resets the owner password on every start (F-28) |
| `TEACHER` | Own courses via `assertCourseAccess` on writes and, since 2026-07-15, most reads; own exams and income | Attendance read scoping gap (F-09). No roster of own students (F-83). Cannot mark own exam (F-67) |
| `ADMIN` (front desk) | Organization-wide, **not scoped to a branch**; scan, manual attendance, collect entrance fee, bulk upload, enroll, user status/barcode (never on `SUPER_ADMIN`/peer `ADMIN` targets, `live`) | Recording access scoping gap (F-04). Bulk upload is an unaudited money edit (F-58). Can deactivate any teacher or marker (F-32). Sees NIC, phone and address in name search |
| `MARKER` | Assigned exams or audiences only for list, get and grade | Recording and attendance read scoping gaps (F-04, F-09). Sees full student identity on every script (F-74) |
| `STUDENT` | Own enrollments, payments, submissions; content gate = active enrollment + current-month `SUCCESS` payment | Gate ignores `classType` today (planned fix, §5); recording read scoping (F-06); not applied to exams (F-23) |

## 3. Capability matrix (today, from the route matrix)

`O` owner, `T` teacher, `A` front desk, `M` marker, `S` student. Scope notes in brackets.

| Capability | O | T | A | M | S |
|---|---|---|---|---|---|
| Create class (course) | ✔ | ✔ own | – | – | – |
| Subjects, institutes (branches) | ✔ write | read | read | read | read |
| Timetable slots, generate sessions | ✔ | ✔ own course | ✔ | – | read |
| Schedule Zoom, host live class | ✔ | ✔ own | – | – | join (paid) |
| Upload recording, materials | ✔ | ✔ own | – | – | – |
| Play recording | ✔ | ✔ own | – (refused, F-04 fixed) | – (refused, F-04 fixed) | ✔ if enrolled + current month paid |
| Enroll a student | ✔ | – | ✔ API, **no UI (F-11)** | – | self |
| Collect fee at entrance, bulk upload | ✔ | – | ✔ | – | – |
| Override or refund a payment | ✔ | – | – | – | – |
| Who owes this month | no view (F-10) | – | – | – | – |
| Scan or mark attendance | ✔ | read own course | ✔ | – | own QR; video flag (F-24) |
| Create exam, assign markers | ✔ | ✔ own | – | – | – |
| Enter marks | – | **– (F-67)** | – | ✔ assigned | – |
| Enter hall (`INCLASS`) marks | – | – | – | – | no path for anyone (F-13) |
| Publish results, post-publish correction | ✔ | ✔ own | – | – | read own |
| Roster of enrolled students | ✔ | **– (F-83)** | ✔ | – | – |
| Create staff account | **no flow (F-21)** | – | – | – | – |

This table is the current state. The proposed extra authority for the teacher and the owner is in §12.
| Reset a password | **nobody (F-03)** | – | – | – | – |

## 4. Journeys: as designed against as built

**Teacher: run a class.** Create course → define weekly slots → generate sessions → schedule Zoom → teach →
attendance → upload recording → set monthly test → marker marks → publish → see income.
*Breaks:* rescheduling or disabling a slot leaves ghost or duplicate sessions (F-48, F-49); students are not
notified of session changes (F-51); no holiday or Poya calendar (F-50); no roster or "who has not paid"
(F-83; only the exam-configuration eligible-students list exists); cannot mark own exam (F-67); hall marks cannot be entered (F-13); income history follows the *current*
teacher after reassignment (F-79); the owner cannot cleanly offboard a teacher who owns a course (F-82).

**Student: join and learn.** Register → account setup → enroll → pay → watch or join live → attend → sit exam
→ results. *Breaks:* session dies at 15 minutes (F-01); the setup gate demands NIC photos from minors who
mostly have no NIC (F-19) and is enforced by the browser only (F-29); enroll hides branch and mode meaning;
a `PENDING` PayHere payment looks unpaid with the Pay button showing again (F-85); recordings look playable
until tapped (F-88); on the 1st of the month the whole library, including old recordings, locks until the new
fee is paid (F-05); scoped exams cannot be sat from the UI (F-17); non-MCQ answers are not autosaved and the
Submit button disables at 0:00 (F-86); a failed PDF upload leaves a dead submission that rejects the retry
(F-22).

**Front desk: the day at the counter.** Register or find a walk-in → enroll → take cash → scan in → chase
unpaid → end-of-day tally. *Breaks:* no enroll UI (F-11; UI only, the API allows it and the student can self-enroll on a phone meanwhile), no bulk "who owes" list (F-10; one student's outstanding months can be checked at a time), scanner marks any active
student present and shows nothing about enrollment, payment or mode (F-12), the scanner and cash desk resolve
the same card with different rules (F-39), scan identity resolution needs hardening (F-07), the bulk Excel upload can set any month `SUCCESS` without a per-row trail (F-58),
cash collection can silently overwrite an existing `SUCCESS` row (F-59), and there is no end-of-day cash tally
(F-77).

**Marker.** Sees only assigned scripts, which is right. *Breaks:* nav shows Dashboard, Classes, Timetable and
Submissions; the Classes list says "Manage classes across the institution" and lists every course with its fee
(a marker needs none of it); markers see student name, email and index on every script (F-74); the key to mark
the MCQ part of a HYBRID exam is not visible to them (F-70).

**Owner.** Has every power but no safe way to exercise some of them: no staff creation or invite (F-21),
no last-owner guard (F-31), deactivation lags (F-15), the audit trail is mutable and best-effort (F-81),
and the dashboard is a link grid for every role instead of a "what needs my attention" view (F-20).

## 5. The content-access rule: today and target

Today, per route:

| Route family | Student rule | Staff rule |
|---|---|---|
| Live token | active enrollment **and** current-UTC-month `SUCCESS` payment on any enrollment of the course | host/owner path via `assertCourseAccess`; host credentials come from the shared owner Zoom account (F-56) |
| Recording stream | same as live | restricted to enrolled students, the owning teacher and the owner (F-04 fixed in Wave 0) |
| Recording list/get | enrollment required for students on both; list and metadata omit the provider video id for students (F-06 fixed in Wave 0) | – |
| Modules and materials | enrollment, payment for downloads | owner/teacher scope |
| Exams | enrollment only (no payment) (F-23) | marker assigned only |
| Attendance scan | none: enrollment, mode and payment are not checked (F-12) | – |

**Target (as decided 2026-11-19, planned).** Access is the conjunction of: active enrollment; the delivery
mode of that enrollment (`PHYSICAL`-only students get no live or recording unless `HYBRID` or
`onlineForPhysical`); and a payment gate. Rework in one function, `assertStudentContentAccess`, called by every
route family above; the mode rule itself is specified in the HYBRID spec linked above. Behaviour change on release: PHYSICAL-only students who today can watch recordings lose that
access. Two things the spec does not yet say and the audit needs decided (F-05, F-66): **which month's fee
unlocks which content** (the audit recommends *any* recording of a course while the student is currently
paid, plus a short grace window, rather than the current-month-only cliff), and **whether the gate is
per-enrollment or per-course** when one student holds both an `ONLINE` and a `PHYSICAL` enrollment of one
course (F-65).

Non-student roles should be explicit in the gate rather than implicit: `SUPER_ADMIN` and the owning `TEACHER`
may play; `ADMIN` and `MARKER` may not (they need no recording to do their jobs).

## 6. Sri Lankan scenario status

Used as a checklist. Statuses reflect the code on `dev` at 2026-11-19.

| # | Scenario | Status | Main gap (finding) |
|---|---|---|---|
| S1 | Monthly fee, mid-month joiner, free or half card | Partial | Full-month fee only; no proration, free or half card, or sibling discount (F-63, F-64) |
| S2 | One course taught at several branches | Gap | Course, enrollment and session carry no branch; one class per branch at a time (F-52, F-53) |
| S3 | Theory, revision and paper classes; mediums; batch year | Gap | `ClassType` is only `ONLINE`/`PHYSICAL`; year exists, medium and class kind do not |
| S4 | Teacher sees own roster and own income only | Partial | Income scoped to self (good, but history rewrites, F-79); roster missing (F-83) |
| S5 | Front-desk walk-in: register, enroll, cash, card, scan, chase unpaid | Partial | Cash and scan work; no enroll UI, no unpaid list, ambiguous scan resolution (F-11, F-10, F-07) |
| S6 | Missed class then recording, with a grace period | Partial | Recording works; month-cliff, no grace (F-05) |
| S7 | Zoom live, recording, automatic attendance | Partial | Live token works; automatic attendance very likely cannot match SDK guests (F-14; by code, Zoom-side behaviour not observed); webhook hardening needed (F-54) |
| S8 | Monthly test, paper marking, hall-paper marks, ranking | Partial | MCQ auto-mark and publish work; teacher cannot mark; hall marks and ranking absent (F-67, F-13, F-73) |
| S9 | Parent SMS | Gap | No guardian contact; three events, all to the student (F-25, F-76) |
| S10 | Low-end phone, bank slip | Planned | Bank slip is in the spec; no upload retry for exam PDFs, shared rate limiter (F-22, F-02) |
| S11 | Staff turnover and deactivation | Partial | Refresh blocked at once, access token lives up to 15 minutes; no handover check (F-15, F-32, F-82) |
| S12 | Minors' data privacy | Gap | NIC photos mandatory, write-only, no retention policy; registration hardening (F-19, F-30, F-33) |
| S13 | Teacher settlement, commission and concessions | Gap | No revenue share, statement or concession attribution; teacher income view is gross-only (F-91, F-79) |
| S14 | Year-end rollover, repeaters and teacher substitution | Gap | No clone-to-new-year, batch end, substitute or make-up session (F-97, F-93, F-96) |

## 7. Recommended fix sequence

The audit recommends ordering by **blast radius, then by how cheaply a fix removes a daily dead end.** Effort
letters are S (hours), M (days), L (a week or more).

- **Wave 0 — stop the bleeding (all S/M; confirmations settled in D-ACCESS-8 and D-ACCESS-4; progress: F-01 merged in #96, F-04 and F-06 in #PR, status per finding in doc 18):** F-01 session
  lifetime; F-04 scope recording stream and metadata reads to enrolled students and the owning teacher; F-06
  enrollment check on recording metadata reads; F-09 scope attendance reads
  to the course or the student; F-54 Zoom webhook hardening; F-55 production boot check for the keys actually
  used; F-02 keep SSR traffic out of the per-IP limiter; F-07 scan identity resolution; the owner-safety slice
  of F-28 and F-31 (seed no longer resets the owner, last-owner and self-demotion guards, D-IDENTITY-5).
- **Wave 1 — give each role a working day (foundations first: settings registry, Colombo billing clock, advisory lock, simple `isStudentCovered`, F-15 per-request revocation; then identity safety F-03 F-21 F-29, attendance and scan policy F-12, teacher and money visibility):** F-11 enroll UI, F-10 "who owes" view, F-77 end-of-day cash tally, F-58 bulk-upload guard
  and F-12 scanner context for the front desk; F-83 teacher roster; F-67 teacher marking and F-13 hall-mark
  entry; F-17 scoped-exam sitting; F-22 and F-86 exam resilience; F-03 password reset and F-21 staff creation; F-104 timetable-generated classes
  that can go live (a live-checked S fix); F-127 read-only owner console.
- **Wave 2 — make access coherent (decisions made, doc 19; sub-order 2a enrollment migration with HYBRID, 2b money core and single content gate, 2c structure, 2d bank slip, 2e identity and communication, 2f teacher money authority):** the single content gate with mode and
  payment rules (F-05, F-23, HYBRID), the branch dimension (F-52, F-53, F-37, F-105 residual: session branch), money and enrollment lifecycle (F-59 to F-65, F-91, F-93, F-94),
  guardian contact, minors and notification events (F-25, F-76, F-98); teacher requests for concessions, waivers, refunds and corrections, executed by the owner or capped (F-125, 2f); late work (F-126, 2e).
- **M2 + M3 (tenancy) sit between Wave 1 and Wave 2** as a one-to-two-week stretch where only hotfixes merge, because Wave 2 adds nearly all new tables and uniques and is cheaper to write once on the scoped client (D-STRUCTURE-10 and the master delivery order in the Wave 2 plan). M4-M7 wait until a second organization is contracted.
- **Wave 3 — hardening and polish:** the remaining mediums and lows in doc 18, with Vitest matrices for every
  new guard as `04-ai-workflow-rules.md` §3.4 requires.

The owner rules in §9 are now decided (doc 19). Wave 2 mode and payment changes ship as one change set, because three items interact
(F-05, F-23, F-65) and the planned HYBRID work changes the same gate. Doc 19 §4 is the authoritative order; where this section and doc 19 differ, doc 19 and the plans win.

## 8. Verified aligned

These were checked and need no change: `ADMIN` cannot deactivate, re-barcode or modify `SUPER_ADMIN` or peer
`ADMIN` targets (`live`, 403); the refresh path and login reject deactivated users; account mutations are
audit-logged; the NIC confirm step validates the storage key belongs to the caller; password change revokes
all refresh tokens; PayHere notify verifies merchant, signature, amount and currency; refund is owner-only,
transactional and capped; override is owner-only with an adjustment record; the Bunny webhook verifies an
HMAC over the raw body in constant time and is idempotent; the live token's host/participant split and
watermark come from the database, not the client; MCQ answer keys are stripped for students and markers; exam
windows are enforced server-side inside a serializable transaction with an advisory lock; one submission per
student per exam; marks hidden until publish; post-publish corrections are teacher/owner only with a reason and
an audit entry; front-desk is deliberately denied exam content; the student timetable is scoped server-side to
active enrollments.

## 9. Owner decisions (decided 2026-11-20 by delegation)

These changed what gets built and could not be settled from code. The product owner delegated them ("you can decide what's best"); each is now a decision in [19-owner-decisions-2026-11-20.md](./19-owner-decisions-2026-11-20.md), reversible and configurable. Mapping: 1 → D-MONEY-1, D-ACCESS-9; 2 → D-ACCESS-2; 3 → D-EXAMS-1; 4 → D-STRUCTURE-1 to -3; 5 → D-IDENTITY-1, -2, -9; 6 → D-ACCESS-3, D-OPS-3; 7 → D-ACCESS-5 to -7; 8 → D-MONEY-3 to -5; 9 → D-IDENTITY-3, D-OPS-2; 10 → D-IDENTITY-4 to -6; 11 → D-MONEY-2, D-ACCESS-4, D-IDENTITY-13; 12 → D-ACCESS-8, D-ACCESS-4; 13 → D-MONEY-7 to -9, D-STRUCTURE-3 to -9, D-EXAMS-6, D-EXAMS-9 to -10, D-IDENTITY-9, -11; 14 → D-MONEY-9, D-EXAMS-5, D-OPS-1. The questions below are kept as the record of what was asked.

1. **Fee unlock model (F-05, F-66, F-65).** Which month's payment unlocks which content, whether there is a
   grace window, and whether the gate is per enrollment or per course.
2. **Exams and payment (F-23).** Should an unpaid student be able to sit the monthly test?
3. **Marking authority (F-67).** May a teacher enter marks on their own exam, or only through assigned markers?
4. **Branch model (F-52, F-53).** Does the same course run at several branches with separate rosters and fees,
   and can a branch host parallel classes?
5. **Identity and minors (F-19, F-30, F-98).** Are NIC photos required for minors at all, who may view them, how long
   are they kept (see the PDPA row in doc 15)?
6. **Scan policy (F-12, F-43).** Should the entrance scan refuse or only warn on unpaid, unenrolled or wrong-mode
   students, and inside what time window?
7. **Attendance source of truth (F-14, F-24, F-40).** Is a live join, a recording watch, or a staff mark the
   authority, and what minimum duration counts as present?
8. **Money edges (F-61, F-63, F-64).** Chargeback handling, free and half cards, mid-month proration.
9. **Parents (F-25).** Capture a guardian phone and send absence and fee-due SMS (and, from earlier decisions,
   whether WhatsApp is wanted; decided in D-IDENTITY-2 guardian capture and D-IDENTITY-3 SMS only).
10. **Roles (F-27, F-31, F-32).** Settled: the per-user `Permission` model is removed (D-IDENTITY-4, Wave 1b Task 7); owner
    invariants; who may deactivate staff.
11. Carried over (settled: D-MONEY-2 per-mode fees, D-ACCESS-4 QR scheme, D-IDENTITY-13 export/restore, D-IDENTITY-3 languages): per-mode fees, the QR value scheme versus random tokens (F-08), a tenant export/restore
    tool, Sinhala and Tamil at launch.
12. **Wave 0 confirmations (F-04, F-07).** May front-desk or marker accounts ever open recordings (for support or
    marking)? Decided no (D-ACCESS-8) and implemented in Wave 0 PR 2. And is scan identity required to be unique across both code kinds?
    The proposed default is yes.
13. **Commercial model (F-91, F-92, F-93, F-94, F-95, F-96, F-97, F-99, F-101, F-102, F-110).** Teacher revenue share and
    who bears concessions, class medium and capacity, which fee products exist beyond the monthly fee, whether
    teachers or assistants handle money, substitute and co-teacher rules, year rollover and how long past
    students keep recordings, data retention, teacher-exit terms, rank visibility for minors, who may change a
    class fee.
14. **Authority of the teacher and the owner (F-125, F-126, F-127).** How much money authority a teacher gets
    (concession and refund caps, what is automatic, who bears the cost), the default late-work and late-result
    policy, and what the owner console must show. Decided in D-MONEY-9, D-EXAMS-5 and D-OPS-1 (doc 19).

## 10. UI evidence (rendered per role)

Checked in a browser against the local stack, one login per role:

- **New student** — every route redirects to `/auth/account-setup`: "Required. Upload both sides of your
  National Identity Card." Setup enforcement needs a server-side counterpart (F-29, `live`).
- **Student with five paid enrollments** — the dashboard is a link grid with staff-written copy: Classes
  "Browse and manage classes", Payments "Records and entrance collection" (F-20). The classes list shows
  "Enrolled" and the next session but no branch, no mode and no paid state. A class detail page lists its
  sessions as "Physical" with no location (F-53) and offers **"Pay this month's fee" although the Payments
  ledger shows that month already paid** (F-84, `live`), next to "Drop this class".
- **Marker** — dashboard "Welcome, Marker" with Classes, Timetable, Submissions; Exams is hidden by design;
  the Classes page lists every course with its monthly fee under "Manage classes across the institution".
- **Front desk** — nav Dashboard, Classes, Timetable, Attendance, Payments, Administration, Users; dashboard
  tiles are generic. The Payments page offers filters by status (Pending, Success, Failed, Refunded) and a
  month, never "unpaid", plus Collect payment (search or scan) and a prominent **Bulk upload**; it has no
  enroll action, no per-collector or per-day tally and no branch column (UI observed live; F-10, F-11, F-77 and F-58 are also code-verified).

Not covered: mobile widths and screenshots of every screen; the staff and student UX audits read page source
for the rest.

## 11. How this audit was produced and how to resume

The audit ran in two passes. The first pass covered accounts, delivery, exams, enrollment and payment and the
student UI. The second pass completed catalog and timetable, attendance, oversight and the staff UIs (front desk,
teacher, marker, owner) and, with a Sri Lankan domain review, produced F-91 to F-127.

The per-domain audit output, the route matrix, the merge script that generated doc 18 and the hypothesis list were kept outside the repository (the repository holds only the conclusions in this file and doc 18, so line-level evidence has to be re-located from the endpoint or function named in each finding). Re-running a domain is cheap if the scenario list in §6 and
the hypotheses H1 (setup enforced only in the browser), H2 (stateless access token), H3 (month boundary),
H4 (nav against backend), H6 (unguarded reads), H7 (front desk not branch-scoped) and H8 (missing flows) are
reused. Verdicts on those: H1 confirmed (F-29), H2 confirmed (F-15), H3 confirmed with Asia/Colombo offset
(F-05, F-18), H4 partly (F-04 family), H6 confirmed for videos and attendance (F-06, F-09), H7 confirmed
(F-52, F-53), H8 confirmed (F-10, F-11, F-21, F-83).

## 12. Privileges for the higher roles (proposed 2026-11-19; settled in doc 19, which wins where they differ)

Settled departures: teacher assistants and teacher cash handling rejected (D-EXAMS-9); refunds never auto-approved and teacher caps ship at zero (D-MONEY-9).

In a Sri Lankan tuition institute the class teacher and the owner hold the real authority. The teacher runs the
class, owns its income and decides concessions, late work and results; the owner answers for the whole institute;
front desk only executes. Today the code gives the teacher their own content, scheduling, exam set-up, publishing
and post-publish correction, keeps every money adjustment and every refund with the owner, and gives the owner
write access everywhere but no single place to see the whole institute. That leaves the people who carry the
responsibility with the least control over their own work and forces every small decision through the owner.

**Principle.** Delegate authority to the person who is accountable, bounded by scope (own courses), amount
(owner-set cap), reason and audit; the owner can see everything read-only and can revoke. This extends, and does
not reopen, the 2026-11-19 decisions (HYBRID enrollment, three payment channels, PHYSICAL-only access).

| Role | Capability | Today | Proposed | Finding |
|---|---|---|---|---|
| Teacher | Roster of own class with paid or unpaid and attendance | none | read, without phone, NIC or amounts | F-83 |
| Teacher | Enter marks on own exam, hall (`INCLASS`) marks | marker only | owning teacher may enter and finalize | F-67, F-13 |
| Teacher | Results: publish, correct after publish | publish once; correction needs a reason | add completeness check, unpublish and re-publish with a reason and a notification | F-71, F-126 |
| Teacher | Late work: extension, late window, re-open | none | per-student extension and late flag on own exams, with a reason | F-126 |
| Teacher | Concession (free or half card, waiver) on own course | owner override only | grant within an owner-set cap per month; above the cap it queues for the owner. Caps ship at ZERO (D-MONEY-9), so every request queues for the owner until a teacher's cap is raised on one screen (suggested start Rs 5,000 per month and 3 cards). Teacher-granted concessions are bearer SHARED (D-MONEY-8) | F-125, F-63 |
| Teacher | Refund or payment correction on own course | owner only | request only; never auto-approved (fixed, D-MONEY-9); the owner approves and executes through the existing owner-only refund path, never above the paid amount. Corrections and fee changes also execute only by the owner | F-125 |
| Teacher | Attendance and sessions of own course | read, reconciliation | mark and undo, cancel, name a substitute | F-35, F-96, F-123 |
| Teacher | Income statement | gross only | per-student drill-down, share, CSV | F-91 |
| Teacher | Delegate to an assistant | none | **rejected for v1 (D-EXAMS-9):** no assistant role and no teacher cash handling; the owner or front desk handle cash | F-95 |
| Owner | Organization-wide read-only console | scattered or missing | rosters, attendance, marking progress, who owes, cash by collector, SMS log, security audit, teacher statements | F-127, F-10, F-77, F-120, F-121 |
| Owner | View as a teacher, front desk or student | none | audited and strictly read-only | F-127 |
| Owner | Approve teacher requests | none | one approval queue with reason and amount | F-125 |
| Owner | Audit export, break-glass writes | partial | CSV export; writes stay owner-only with a reason | F-127, F-31, F-81 |

**Guardrails that do not change.** Front desk keeps no refund, override or role power. Markers see no money.
A teacher never touches another teacher's course (`assertCourseAccess`) and never approves their own request
above the cap. Every adjustment carries an `Idempotency-Key`, a reason and an audit row. The owner invariants in
F-31 (last owner, self-demotion) still apply. Cap values were decided in D-MONEY-9: caps ship at zero, so every request goes to the owner until the owner raises a teacher's caps; refunds are never auto-approved.
