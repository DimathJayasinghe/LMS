# System Assessment & Path to Launch (2026-07-17 snapshot)

> **Historical snapshot, superseded 2026-11-19.** Kept as the record of the 2026-07-17 assessment. Do not
> use it for current status or scope: the launch target is ~1,200 students (not the ~500 MVP stated below),
> CI exists and gates `dev`/`main`, Zoom stays a launch-readiness item, and the owner decisions of
> 2026-11-19 (multi-tenant readiness, bank-slip channel, `HYBRID`) postdate it. Findings §3.1-§3.5 were
> verified against `dev` on 2026-11-19 and are **fixed**: exam list/detail have role gates and scoped marker
> access, payment and user mutations carry `Idempotency-Key`, `access.service.test.ts` exists, PayHere
> signatures use `timingSafeEqual`, and the timetable no longer hard-deletes. Current sources of truth:
> [06-progress-tracker.md](../../context/documents/06-progress-tracker.md),
> [13-product-roadmap.md](../../context/documents/13-product-roadmap.md),
> [15-requirements-traceability.md](../../context/documents/15-requirements-traceability.md),
> the [2026-08-20 gap analysis](./2026-08-20-full-system-gap-analysis.md) and the
> [production delivery baseline](../plans/2026-09-06-production-delivery-baseline.md).


> A whole-system health assessment and a sequenced roadmap toward the project's goal. Written
> 2026-07-17, verified against the code on `dev` at that date (not assumed from the other `context/`
> docs, which drift — see [06-progress-tracker.md](../../context/documents/06-progress-tracker.md)'s standing note). Where
> this doc names a file/line, it was checked. This is the strategic layer: it says **what** to do,
> **in what order**, and **why**. Each significant workstream still gets its own spec → plan per the
> repo's flow ([04-ai-workflow-rules.md](../../context/documents/04-ai-workflow-rules.md)); this doc is the map those specs
> hang off.
>
> **MVP scope (owner decision, 2026-07-17):** the **first launch targets ~500 students max**, not
> the full ~1,200. One VPS is comfortably enough at that size, so the capacity concern in §4.2 is
> **not an MVP launch-blocker** — it becomes a "build-and-measure before scaling past ~500–800" item.
> **Bunny (video) and R2 (storage) credentials are confirmed working** (Bunny library API returns
> HTTP 200 with the configured key, verified live 2026-07-17; R2 verified earlier with a real PUT) —
> so the 2026-07-10 "malformed `BUNNY_API_KEY`" finding was a **false positive** (Bunny Stream keys
> are not canonical GUIDs; the old GUID-shape heuristic was wrong). **Only Zoom is genuinely
> deferred** — the owner is obtaining real Zoom credentials, which may take time, so **live classes
> are a fast-follow, not an MVP-launch dependency**. MVP delivers recorded video + everything else;
> live classes light up when Zoom lands.

---

## 1. Where the project actually stands

**One-line verdict: feature-rich in development, but not yet a launchable product.** Almost every
domain has both a backend and a wired frontend — auth, courses/sessions, enrollment, exams (author
+ sit + mark + publish), payments (PayHere online + pay-at-entrance + bulk), recorded video (Bunny
DRM), live classes (Zoom SDK embedded), attendance (entrance scan + video-watch + Zoom-join),
notifications (inbox + SSE + SMS), and admin tooling (users, subjects, institutes, audit, financial
reports). That breadth is real and it is the project's strength.

But "built and demoable in dev Docker Compose" is a different bar from "safe to expose to 1,200 real
students who pay real money." The distance between those two bars is where this document lives. Three
things define the gap:

1. **The system has never run in production.** Phase 10 (deployment) is 0% started — no VPS
   provisioned, no CI pipeline exists at all (`.github/workflows/` is absent), no real DNS/TLS, no
   restore drill run. Everything has only ever run on one developer's machine.
2. **One of the four headline content features cannot work in production today.** Recorded video
   (Bunny) and file storage (R2) credentials are **confirmed working** (§verified 2026-07-17). Only
   **live classes** are blocked, on Zoom credentials the owner is still obtaining — a deferred
   fast-follow, not an MVP blocker. (This corrects the stale 2026-07-10 "malformed `BUNNY_API_KEY`"
   claim, now disproven.)
3. **The security model has demonstrated it fails open.** In a single work session (2026-07-15),
   three separate real authorization leaks surfaced in code that looked finished: teachers could
   read each other's exam content, and markers/front-desk admins can *still* read any exam's answers
   (see §3). The pattern that caused all three is systemic, not incidental (§4.1).

None of this diminishes the work done. It reframes what "done" means: the remaining effort is less
about adding features and more about **hardening, wiring the last mile, and proving it holds under
real conditions.**

---

## 2. The goal, and the gap to it

From [01-project-overview.md](../../context/documents/01-project-overview.md): a **low-cost, simple-to-operate, secure**
LMS for **one institution, ~1,200 students, on one ~$5–12/mo VPS**, where **Redis caching absorbs
the result-release read spike** so no cluster is needed. Content (paid video + live) is protected;
exams are secure; payments are reliable; attendance is automated.

The gap to that goal, stated plainly:

| Goal pillar | Reality on `dev` today |
|---|---|
| **Secure exam delivery** | MCQ answers + paper PDFs are readable by any MARKER or front-desk ADMIN for *any* exam (§3.1) — a real hole in the marquee "secure exams" claim. |
| **Protected content** | Recorded video works and Bunny/R2 creds are verified. Live classes wait on Zoom creds (deferred). The content gate itself (`access.service.ts`) has **zero tests** — the real remaining risk here. |
| **"One VPS is enough"** | **True for MVP (~500).** The Redis result-read cache the *1,200*-scale premise depends on is not built (§4.2), but at 500 one VPS + Postgres is fine — build the cache before scaling past ~500–800, and load-test then. |
| **Reliable payments** | Online + entrance + bulk all work, but `override` and `bulk-upload` lack the `Idempotency-Key` guard the overview and CLAUDE.md say every payment mutation must have (§3.2). |
| **Automated attendance** | Live-Zoom + video-watch are wired; entrance scanning only resolves the global LMS QR — the entire per-institute `StudentBarcode` model is registered but consumed nowhere (§5, dead features). |
| **Low cost / simple to operate** | True in principle, but unproven: never deployed, no CI, no monitoring wired beyond Sentry init, backups built but off-site + restore-drill not done. |

---

## 3. Findings — Security & correctness (launch-blocking)

These must be closed before real students touch the system. Ordered by sharpness.

### 3.1 Exam read endpoints have no role gate → MARKER / front-desk ADMIN can read any exam's answers
`backend/src/routes/exam.routes.ts`: `GET /` (`listExams`) and `GET /:id` (`getExamById`) carry only
`verifyToken` + validation — **no `requireRole`**, unlike every other route in that file. In the
service, `assertStudentContentAccess` is a no-op for non-students and the (newly added, 2026-07-15)
`assertCourseAccess` only throws for `TEACHER`. So a `MARKER` or a front-desk `ADMIN` falls through
both gates and receives the **paper-PDF presigned URL and the full MCQ payload including correct
answers**, for exams they have no relationship to. `listExams` likewise applies its `where` filter
only for STUDENT/TEACHER — a MARKER/ADMIN sees every course's exams unfiltered. Pre-existing;
surfaced during the teacher-scoping final review. **This directly breaks goal pillar #3 ("MCQ answers
hidden until publish").** Fix: restrict these two routes with `requireRole`, or add a
`MarkerAssignment`-scoped check in the service (mirroring how `listSubmissions` already handles
MARKER).

### 3.2 `Idempotency-Key` missing on high-stakes payment + account mutations
CLAUDE.md's invariants and objective #6 require every payment mutation (and account activation) to be
idempotency-guarded. Present on `/payments/initiate`, `/payhere/checkout`, `/collect-entrance`, and
mark finalization — **absent** on `PATCH /payments/:id/override`, `POST /payments/bulk-upload`, and
`PATCH /users/:id/{role,status,barcode}`. A double-submitted override or a retried bulk upload can
double-apply. Fix: add `checkIdempotency` to those routes.

### 3.3 Soft-delete invariant violated by a hard delete
`backend/src/services/timetable.service.ts` calls `prisma.timetableSlot.delete(...)` — a hard delete
of a row with an inbound FK from `ClassSession.timetableSlotId` and an *existing but unused*
`isActive` column that looks built for exactly this soft-disable. Violates the "soft deletes only"
invariant. Fix: `isActive: false` instead of `delete`.

### 3.4 PayHere webhook signature compared with `!==`, not constant-time
`backend/src/services/payment.service.ts` verifies the PayHere MD5 signature with a plain `!==`
string compare. Zoom and Bunny webhook verification both use `crypto.timingSafeEqual`. Low real-world
risk, but it's a payments-path timing side-channel and an inconsistency with the codebase's own
standard. Fix: switch to `timingSafeEqual`.

### 3.5 `access.service.ts` — the security core — has zero tests
This is the single function family that decides whether a student may stream paid video or join a
paid live class (`assertStudentContentAccess`, `getCurrentPaymentMonth`). It is the enforcement point
for goal pillar #4, and it has **no test file at all**. Combined with §3.1, the pattern is clear:
the most security-critical code is the least tested. Fix: a dedicated `access.service.test.ts`
covering the enrolled-only vs enrolled+paid branches, month boundaries, and the privileged-role
bypass.

---

## 4. Findings — Design flaws (architecture-level)

### 4.1 The authorization model fails open by construction — the key structural flaw
Every content-access check in this codebase uses the idiom **"gate the one role that should be
restricted; let every other role fall through."** `assertCourseAccess` throws only for a non-owning
`TEACHER`; `assertStudentContentAccess` no-ops for everyone except `STUDENT`; `listSubmissions` gates
`MARKER` and `TEACHER` and lets the rest pass. This is concise and reads cleanly — but it is **default-allow**. A role that nobody wrote a branch for sees everything.

That is not a hypothetical. In one session it produced three real leaks (teacher-cross-course ×
exams/videos/submissions/sessions — now fixed; and the MARKER/ADMIN exam-read hole of §3.1 — still
open). The `if/else` bug caught in the teacher-scoping work (a `role !== MARKER` where `role ===
TEACHER` was meant) is the same failure mode in miniature: an over-broad "everyone but X" condition.

**The structural fix direction** (its own spec, not a quick patch): make content authorization
**default-deny**. Either (a) a single choke-point every content read passes through that takes an
explicit allowlist of roles per resource kind and denies anything not listed, or (b) exhaustive
role handling (a `switch` with a `default: throw 403`) at each gate. The route-layer `requireRole`
allowlist is today's *only* default-deny layer — which means safety is coupled to nobody ever
loosening a `requireRole` without re-checking the service. That coupling is exactly what broke in
§3.1, where two routes simply had no `requireRole` at all.

### 4.2 The 1,200-scale "one VPS" premise depends on caching that isn't built — but MVP (500) is fine
The cost/simplicity thesis (objectives #1, #2) rests on one sentence in the overview: *"Redis caching
absorbs the [result-release] spikes, so no auto-scaling is required."* There is **no Redis caching on
result reads** — `grep` finds `@/config/redis` used only in `stream.service` (SSE) and
`live-class.service` (rate-limit/token), never in `exam.service`/`submission.service`. At the
full-scale ~1,200 simultaneous result-reads, that spike hits Postgres directly on a $5–12 VPS.
**For the ~500-student MVP this is not a blocker** — a single warm Postgres on a modest VPS handles
500 concurrent indexed reads without a cache. But the premise is still *false as written* at 1,200,
so: (a) treat the Redis result-cache + a load test as a **pre-scale gate**, to be built and measured
**before student count grows past ~500–800**, not before the MVP launch; (b) correct the overview so
it doesn't claim a caching layer that doesn't exist. Load-bearing for the *scaling* decision, not the
MVP one.

### 4.3 The `Permission` model is documented-but-dead
[01-project-overview.md](../../context/documents/01-project-overview.md) §3 and §7 repeatedly present per-user `Permission`
overrides as the mechanism for "fine-grained exceptions beyond a role." The `Permission` model exists
in `schema.prisma:136` — and is **consumed by zero code** (no service or middleware references it).
Either a real feature is missing (some flows genuinely need per-user grants) or the model is dead
weight and the docs oversell it. Decide which, then either wire it or delete it + correct the docs.
Carrying a documented-but-unbuilt authz mechanism is itself a security-thinking hazard — a future
reader may assume it protects something.

### 4.4 Docs drift is a systemic process flaw, not a series of accidents
CLAUDE.md, the progress tracker, and the frontend roadmap all warn that docs drift from code, and
this session alone corrected several stale claims (an "ADMIN can't reach exam endpoints" claim that
was false; "pay-at-entrance not wired" long after it shipped; multiple "not yet started" items that
were done). The mitigation ("update docs alongside code") is a rule with **nothing enforcing it** —
no CI check, no doc-lint, no PR template gate. At 1,200-student stakes, a doc that misstates an authz
boundary is a real risk (see §3.1's false "confirmed non-issue"). Consider a lightweight enforcement:
a PR checklist item, or a CI job that flags a service change touching auth without a matching
`context/api_endpoints/*` change.

### 4.5 Minor: repeated course round-trips on scoped reads
`assertCourseAccess` runs its own `course.findUnique` for every role even though it only branches on
the result for TEACHER, so several read paths (e.g. `getExamById`, `class-session` list/get) now
issue an extra course query. Negligible at this scale and the accepted cost of a single shared gate —
noted for completeness, not action.

---

## 5. Findings — Missing / half-wired features

**Dead or half-wired (built surface that does nothing today):**
- **Per-institute barcodes.** The entire `StudentBarcode` + `Institute`-scoped model is built and
  students can register barcodes, but entrance scanning (`attendance.service.ts`) only resolves the
  global `User.barcode` — it never calls the institute-scoped resolver (`resolveStudentByBarcode`,
  which *does* now exist for payments). Registering an institute barcode currently has no effect on
  attendance. Also, the scan endpoint hardcodes `source: BARCODE` with no QR-vs-wedge distinction.
- **`Permission` model** (§4.3).

**Genuinely missing features (documented as intended, not built):**
- **Payment override UI** — backend `PATCH /:id/override` + `PAYMENT_OVERRIDDEN` audit exist; no
  frontend. Super-admin can't correct a payment from the UI.
- **"Sync Attendance" reconciliation** — the tracker's mitigation for a missed Zoom webhook during a
  restart. No function/route/UI exists.
- **Teacher course create/edit + timetable-slot authoring UI** — teachers can author sessions/exams
  but cannot create a course or edit the recurring timetable from the UI.
- **TEACHER / MARKER attendance view** — `/attendance` still renders `ComingSoon` for these roles.
- **Frontend SSE listeners** for `RESULTS_PUBLISHED` / `TIMETABLE_UPDATED` / `EXAM_CONTROL` — the
  backend broadcasts them; only the notification bell (`NOTIFICATION_CREATED`) consumes anything, so
  results/timetable/exam-control pushes are silently dropped by the client.
- **Timetable's per-slot Zoom link** still opens raw `zoom.us` instead of the in-site embedded flow
  the class-detail page uses.
- **Proactive token refresh** — only reactive on-401 refresh exists; a long exam can still hit a
  live 401 (auto-recovered, but a UX seam).
- **Slow-upload resilience** — NIC/exam-paper/answer-PDF uploads are single presign→PUT→confirm with
  no multipart or re-presign-on-expiry.

---

## 6. Findings — Testing, CI, and deployment (the biggest cluster)

- **No CI pipeline at all** (`.github/workflows/` absent). Nothing runs `tsc`/tests/lint on a PR.
  Every quality gate this session was manual. This is the highest-leverage single fix: it makes every
  later fix safer.
- **7 of 21 backend services have no tests**: `access.service` (§3.5, critical), `enrollment`,
  `institute`, `live-class`, `sms-notification`, `stream`, `subject`. (This session added the four
  that were central to the visibility-scoping work.)
- **`npm run lint` is broken on the backend** — no `eslint.config.js` (ESLint v9 flat-config
  migration never happened); it errors rather than lints (per CLAUDE.md). So there is currently *no*
  working lint step for the backend, and CI can't add one until that's fixed.
- **Deployment (Phase 10) is 0%**: no VPS, no DNS/TLS, real `.env` never assembled, backups built but
  off-site (`rclone`) + healthcheck + a restore drill not done. The backup *engine* is validated; the
  off-site + drill are the parts that make it real.
- **No load test.** Not needed for the ~500 MVP; required as the pre-scale gate before growing toward
  1,200 (§4.2).
- **Credentials status (verified 2026-07-17):** Bunny (video) ✓ working (library API → HTTP 200), R2
  (storage) ✓ working (real PUT verified earlier). Zoom ✗ deferred — owner obtaining real creds;
  live classes are a fast-follow, not MVP-blocking.

---

## 7. Findings — Polish / UX (Phase 9, post-launch-acceptable)

All still unbuilt per the frontend roadmap, verified 2026-07-15: no toast library, no dark-mode
toggle, no `error.tsx`/error boundaries, `loading.tsx` on only ~12 of ~32 routes, no SEO meta on
public pages, no Lighthouse/bundle perf pass, no a11y audit. None of these block a careful launch;
they raise its quality. (Icon-only `aria-label` discipline *is* holding in newer code.)

---

## 8. Roadmap — sequenced toward launch

Four phases. The ordering principle: **make it safe → make it real → make it complete → make it
polished.** Do not reorder P0/P1 for feature work; a data leak or a double-charge in front of paying
students costs more than any missing screen.

### P0 — Launch blockers (must close before any real student)
*Goal: nothing exposed to real users can leak content, double-charge, or silently fail.*
1. **Close the exam-read authz hole** (§3.1) — spec the MARKER/ADMIN exam-read fix; likely
   route-level `requireRole` + a service-side assignment check. *Backend, small, high-severity.*
2. **Make content authorization default-deny** (§4.1) — the structural fix. Spec a single choke-point
   or exhaustive gates; retrofit the existing checks. *Backend, medium, prevents the next leak.*
3. **Idempotency on override / bulk-upload / user mutations** (§3.2). *Backend, small.*
4. **Soft-delete the timetable slot; timing-safe the PayHere webhook** (§3.3, §3.4). *Backend, small.*
5. **Stand up CI** (§6) — fix the backend ESLint flat-config (or defer lint and run `tsc` +
   `vitest run` for both apps first), then a `.github/workflows/ci.yml` on every PR. *Highest
   leverage; do early in P0 so the rest of P0 lands under a green gate.*
6. **`access.service` tests** (§3.5) — the security core, before it guards real paid content.
7. ~~Real external credentials~~ **Bunny + R2 done** (verified 2026-07-17). **Zoom deferred** — live
   classes are a post-MVP fast-follow; when the owner's Zoom creds land, verify schedule→join live
   end-to-end. MVP launches without live classes.

### P1 — Deploy the MVP and make it recoverable
*Goal: the ~500-student MVP is live on a real VPS, monitored, and restorable.*
1. **Provision production** (Phase 10): VPS + Docker Compose, DNS + Let's Encrypt TLS, assemble the
   real `.env` (Bunny/R2 creds already in hand), wire Sentry projects.
2. **Finish the backup story**: off-site `rclone` target + healthcheck + one full restore drill
   ([12](../../context/documents/12-data-backup-and-recovery.md)) before cutover.
3. **Backfill the remaining service tests** (§6) and decide the `Permission` model's fate (§4.3).
4. **Attendance reconciliation** ("Sync" button, §5) — needed the first time a webhook is missed in
   prod.

> **Pre-scale gate (not P1, do before growing past ~500–800 students):** build the Redis result-read
> cache with publish-invalidation and load-test the result-release spike (§4.2). MVP at 500 doesn't
> need it; 1,200 does.

### P2 — Feature completeness
*Goal: every documented flow actually works end-to-end.*
1. **Wire the institute-barcode attendance path** (§5) — make the built `StudentBarcode` model do
   something; add QR-vs-scan `source` tagging.
2. **Payment override UI** and **teacher course/timetable authoring UI** (§5).
3. **Frontend SSE listeners** for results/timetable/exam-control; **TEACHER/MARKER attendance view**;
   **in-site timetable Zoom** (§5).
4. **Upload resilience + proactive token refresh** (§5).
5. **Live classes go live** — when the owner's Zoom credentials arrive, verify the existing embedded
   Zoom SDK flow end-to-end against real Zoom (the code is built; only creds are missing) and flip it
   on. Deferred out of MVP, tracked here so it isn't forgotten.

### P3 — Polish (parallelizable, post-soft-launch acceptable)
Toasts, dark mode, error boundaries, full loading-skeleton coverage, SEO, Lighthouse + a11y passes
(§7). Safe to run alongside a limited launch.

---

## 9. Recommended immediate next step

Start P0 with **CI (P0.5) + the exam-read authz fix (P0.1)**: CI first so it guards everything after
it, then the sharpest open leak. Both are small, both are pure backend, and both directly protect
goal pillar #3. Take each through the repo's spec → plan → subagent-driven-execution flow, exactly as
the two features shipped this session were.

Long-lead owner items to run in parallel (not code): **obtaining real Zoom credentials** (unblocks
live classes as a P2 fast-follow) and **choosing/provisioning the VPS** (P1.1). Bunny + R2 are already
in hand and verified, so nothing else is credential-blocked for the MVP.

> This document is a snapshot. As P0/P1 items close, update
> [06-progress-tracker.md](../../context/documents/06-progress-tracker.md) (the living status) and revise the tables here
> so §2's gap list shrinks visibly toward the goal.
