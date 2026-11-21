# 06 — Frontend Roadmap

> The build order and page inventory for the frontend, mirroring the backend's `06-progress-tracker.md`.
> Keep this current: when a screen is done (per Doc 00 §7), move it to **Done** with the date.

_Last updated: 2026-08-21. The 2026-07-15 re-verification remains the baseline; subsequent completed
items are called out with their completion date below._

---

## 1. Current state (what exists today)

| Area | Status | Notes |
|---|---|---|
| Next.js 16 + Tailwind v4 + shadcn scaffold | ✅ Done | `components/ui/` primitives, `components.json`, tokens in `globals.css`. |
| Resilient system font stack | ✅ Done | `app/layout.tsx` and `globals.css` use a local system sans stack, avoiding a build-time dependency on Google Fonts. |
| Marketing landing (`/home`) | ✅ Done | Grid backdrop, pill Nav, hero Header + Rainbow CTA, StudentReviews, CourseCard grid, real LMS Footer. Off `styled-components` → Tailwind + `<Link>`; **all colors on design tokens**, icons on **lucide** (FontAwesome removed). Still uses static demo data (real data on `/classes`). |
| Auth screens (`/auth/login`, `/auth/signup`) | ✅ Wired | Real login (email+password → `POST /auth/login`) and register (→ `POST /auth/register`); shared `AuthAside`; **show/hide password toggle**; API + field-error mapping; redirect to `/dashboard`. |
| Root `/` | ✅ Done | Redirects to `/home` (`app/page.tsx`). |
| API client / auth context | ✅ Done | `lib/env.ts`, `lib/types.ts`, `lib/api.ts` (401→refresh→retry), `lib/hooks/useAuth.tsx` (`AuthProvider`/`useAuth`) mounted in root layout. |
| Authenticated `(app)` shell | ✅ Done | `app/(app)/layout.tsx` server auth-guard (`/auth/me`, forwarded cookies → redirect to login); `AppShell` (fixed sidebar + mobile drawer + sticky TopBar); role-based `Sidebar` (`lib/nav.ts`), `TopBar` user menu + logout. |
| Role-aware `/dashboard` | ✅ Done | Moved into `(app)`; greets user + renders role-filtered quick-link cards. |
| Classes: role-aware workspace | ✅ Wired | Teachers see only owned classes and can create/edit classes for subjects assigned by SUPER_ADMIN. Students see current enrollments separately from discovery, with new-lesson and upcoming-session indicators. `/classes/[classId]` shows detail, sessions, recordings, enrollment controls, and advances the student's persisted seen marker. |
| Course modules and materials | ✅ Wired | Class detail now provides ordered module creation, draft/publish controls, private PDF/JPG/PNG/WebP upload, removal, and authorized downloads. Students receive only released modules; every download is minted server-side after enrollment and current-payment checks. |
| Enroll → pay | ✅ Wired | `EnrollPanel` (client): self-enroll (`POST /enrollments`, ONLINE/PHYSICAL), drop (`DELETE /enrollments/:id`), and **pay** via the shared `initiatePayherePayment` (`POST /payments/initiate` with a UUID `Idempotency-Key`) → **onsite checkout** (`startPayherePayment` → PayHere modal on our page; card fields in PayHere's iframe, no PCI; redirect only as fallback). Verified against the sandbox merchant (2026-07-11): the onsite modal opens on-page with the merchant + amount, no navigation away. |
| Timetable | ✅ Wired | `/timetable` renders a role/cohort-scoped Monday-first view plus staff slot create/edit/disable/restore, conflict errors, generation preview, and the next 30 days of dated sessions. Online occurrences schedule/start/join through the embedded LMS room; no raw recurring Zoom link is rendered. |
| Enrollment API (backend) | ✅ Added | `POST/GET/DELETE /api/enrollments` (+ `/my`) — the `Enrollment` model previously had no API; this unblocks the paid flow (see `context/api_endpoints/enrollments.endpoints.md`). |
| Exams: list + sit + results | ✅ Wired | `/exams` (status filter, type/status badges, "Submitted/Results out" hints), `/exams/[examId]` sit flow: MCQ (checkboxes + visual countdown from server `endTime` + localStorage autosave + cross-tab `BroadcastChannel`), typed **or** PDF-upload written channel, one-shot submit, and a results view (marks/feedback gated on publish). **Backend**: `GET /submissions/mine`, typed `writtenAnswers` on `POST /submissions`, `allowTypedAnswers`/`allowPdfUpload` exposed on exam reads. |
| Teacher: direct-to-Bunny video upload | ✅ Wired | `/classes/[classId]/videos/new` is now a real file-picker upload (not a manual Bunny-ID paste): `POST /videos/uploads` creates a Bunny video + a `VideoRecording` row (`status: UPLOADING`) and returns a signed **TUS** target; the browser (`tus-js-client`) uploads the file **directly to Bunny** with resumable/progress UI — the file never touches our server. `POST /videos/bunny-webhook` (Bunny → us, secret-query-param verified, idempotent) is the **only** thing that flips a video to `READY`/`FAILED`, so the upload survives the teacher going offline the instant the transfer finishes. Students never see non-`READY` videos; staff see a Processing/Failed badge. Streaming a non-`READY` video returns `409 VIDEO_NOT_READY`. ⚠️ **`BUNNY_API_KEY` in `backend/.env` is a malformed GUID** (confirmed via a real 401 from Bunny's management API) — upload creation is blocked until it's replaced with the real Video Library API key from the Bunny dashboard; this may also affect existing stream-token signing, which was never previously verified against Bunny's live CDN. |
| Recorded video player | ✅ Wired | Class detail lists **Recordings** (`GET /videos/class/:id`, enrollment-gated); `/classes/[classId]/videos/[videoId]` plays via Bunny's **token-authenticated iframe player** (DRM enforced by Bunny), browser-fetched `GET /videos/:id/stream` (per-viewer gating) returning a signed `embedUrl` + `watermark`, with a repositioning **per-student watermark overlay** and `402 PAYMENT_REQUIRED` / `403 NOT_ENROLLED` / `409 VIDEO_NOT_READY` gates. Switched off the raw-HLS `hls.js` path (2026-07-11): Bunny embed-token auth (`SHA256(tokenKey+videoId+expires)`) replaces the broken IP-bound HLS token; webhook fixed to HMAC-verify (read-only key, raw body) + correct status codes (3/4→READY, 5/8→FAILED). **Watch-attendance (2026-07-12):** the player attaches to Bunny's iframe via **Player.js** and fires `POST /attendance/video` once ≥30s is actually watched (or on `ended`) — verified live (real Bunny player → Player.js event → gated attendance record). Full pipeline (upload→webhook→DRM playback→watch-attendance) verified end-to-end on the real Bunny library. |
| QR attendance (student) | ✅ Wired | `/attendance` is role-aware: a STUDENT sees a scannable **QR of their `barcode`** (`qrcode.react`) to show at the entrance + their attendance history (`GET /attendance/student/:id`, self-scoped). **Backend**: `/auth/me` now returns `barcode` + `setupCompleted` (it previously stripped them, so a student couldn't read their own code). Added STUDENT to the Attendance nav item. |
| Attendance scanner + reporting | ✅ Wired | `/attendance` keeps the **SUPER_ADMIN/ADMIN** entrance scanner: institute → class → session, keyboard-wedge (`BARCODE`) or camera (`QR`), live source-labelled roster, and manual mark-by-name fallback. **SUPER_ADMIN/TEACHER** now also get session reporting plus a completed-meeting Zoom reconciliation preview/apply panel; TEACHER sees only owned courses, and the backend repeats the ownership check. Unknown, conflicting, and not-actively-enrolled identities remain review-only. MARKER stays unsupported. Verified by backend service/utility tests, frontend page/panel tests, full suites, typecheck, lint, and production builds (2026-08-17). |
| Marking: assign + grade + publish + correct | ✅ Wired | Owning teachers/SUPER_ADMIN replace an exam's exact marker set from `/submissions/[examId]`; assigned markers grade unpublished work; publishing locks marker edits. Owning teachers/SUPER_ADMIN can correct a published result only with a reason, and the backend logs before/after values. All consequential mutations carry idempotency keys. |
| Teacher: classes and content authoring | ✅ Wired | Teachers create/edit only their own classes and only under SUPER_ADMIN-assigned subjects. Class detail exposes **New session** and **Attach recording** actions; backend ownership checks and audit events repeat the UI gates. SUPER_ADMIN assigns teachers from `/admin/subjects/[subjectId]/teachers`. |
| Live classes (Zoom Meeting SDK) | ✅ Wired | Every **ONLINE** session on the class detail page gets an in-site CTA (`LiveClassAction`, replacing the old raw `zoomLink` anchor): staff see **Schedule live class** (`POST .../live/schedule`, one-time — provisions a real Zoom meeting) until scheduled, then everyone sees **Start**/**Join**, both routing to `/classes/[classId]/live/[sessionId]` — never zoom.us. That page (`LiveClassRoom`, client) fetches a **fresh, never-cached** join token per visit (`POST .../live/token`), dynamically imports `@zoom/meetingsdk/embedded` (SSR-unsafe), and embeds the meeting via `client.init()`/`client.join()`. Deterrent layers per the endpoint doc's anti-recording section: repositioning watermark (server-derived name + live timestamp, no client-spoofable identity), context-menu suppression, and the backend's meeting-settings lockdown + throttled tokens. Gated errors (`NOT_ENROLLED`/`PAYMENT_REQUIRED`/`LIVE_CLASS_NOT_SCHEDULED`/`TOKEN_RATE_LIMITED`) render friendly states, not crashes; `connection-change` → `Closed` shows an "ended" screen. Packaging note: `@zoom/meetingsdk` peer-pins `react@18.2.0` against this project's `react@19` — installed via a repo `.npmrc` (`legacy-peer-deps=true`); its UMD bundle also statically references the private, unpublished `@zoom/download-manager` (an optional dep of a local-recording-download feature we don't use, since recording is disabled) — aliased to a no-op stub via `turbopack.resolveAlias` in `next.config.ts`, with real `jszip` installed for the bundle's other optional dep. ⚠️ All `ZOOM_*` env vars in `backend/.env` are still placeholders — verified end-to-end via a downstream Prisma fixture (seeding `zoomMeetingId` directly) since the real Zoom API can't be reached yet; blocked on real Server-to-Server OAuth + Meeting SDK credentials (see live-class.endpoints.md's setup checklist). The **Timetable**'s per-slot `zoomLink` (a separate, simpler `TimetableSlot` field for recurring slots) still opens raw zoom.us in a new tab — not yet folded into this in-site flow; flagged as a known follow-up, not done as part of this feature. |
| Teacher: exam authoring | ✅ Wired | `/exams/new` (TEACHER/SUPER_ADMIN; others redirect) creates exams with typed/PDF channels, direct-to-R2 paper upload, and MCQ authoring. Staff get a **New exam** CTA; marker assignment is now available from the exam's submission workspace using a minimal, role-filtered academic-staff directory. |
| Admin: user management | ✅ Wired | `/admin/users` (SUPER_ADMIN/ADMIN; others redirect): searchable/filterable (role, status) paginated user table with inline actions — change role (SUPER_ADMIN only), activate/deactivate, assign/edit entrance **barcode**. All via `PATCH /users/:id/{role,status,barcode}`; self-row protected. Frontend-only (endpoints existed). |
| Admin: subjects & institutes | ✅ Wired | `/admin/subjects` + `/admin/institutes` (**SUPER_ADMIN-only** — stricter than `/admin/users`; ADMIN redirected off both, per the academic-taxonomy/center-allowlist being owner-scoped). Each is a server page (SSR gate + `GET /…?search`) → a single client `*Manager` owning search (`?search` re-fetch), a client-side Active/Inactive/All segmented filter over the SUPER_ADMIN list (which already returns inactive rows — no extra round-trip), inline **create** (toggle form card, `isActive` Switch) and inline **row edit** (one row at a time; opening either collapses the other), and per-row **activate/deactivate** — all `POST`/`PATCH` + `router.refresh()` (server-truth, no optimistic cache). Duplicate name/`code` (409) + validation errors map to inline per-form/per-row text (no toast/modal — none installed). Frontend-only (subject/institute CRUD endpoints existed + tested). **Verified**: 18 Vitest+RTL unit tests (filter, submit-gating, 409→inline, create/edit exclusivity, empty states) + `tsc` + `next build` green, plus a **headless-Chromium UI smoke on the live Docker stack** — create → edit → deactivate (Active hides / All shows "Inactive") → duplicate name/`code` 409 inline, for both resources, and an ADMIN (front-desk) served `/dashboard` at both URLs with no management control (SSR gate holds). `lint` clean on the new files (2 pre-existing errors remain in untouched `Nav.tsx`/`useNotificationStream.ts`). |
| Payments (student + admin) | ✅ Wired | Role-aware `/payments` (SSR `/auth/me` branch; STUDENT vs SUPER_ADMIN/ADMIN, else redirected). Student Pay/history and admin summary/filter/bulk-upload/entrance collection remain. Added 2026-08-19: SUPER_ADMIN reviewed overrides plus immutable refund/adjustment ledger UI; completed external refunds require proof, use idempotency keys, show gross/refunded amounts, and net financial totals. Front-desk ADMIN receives no financial mutation controls. |
| Financial reports | ✅ Wired | `/admin/reports` supports `SUPER_ADMIN` global/teacher/class aggregates and `TEACHER` own-class aggregates; front-desk `ADMIN` remains denied. The backend force-replaces teacher scope with the authenticated teacher ID and returns no individual student finance history. The server page provides month/teacher/class filters (teacher filter only for SUPER_ADMIN), teacher/class/method tables and charts, trend, and outstanding totals. Role-scope tests cover query tampering and UI visibility. Production-Docker verification is recorded in the current progress entry. |
| Profile edit + credential management | ✅ Wired | 2026-07-13, PR #66 — see `docs/superpowers/specs/2026-07-13-profile-edit-credential-management-design.md` for the full design (password-change cooldown, credential forms, avatar upload). |
| Pay-at-entrance + printable receipts | ✅ Wired | 2026-07-14/15 — `CollectPayment` (search/scan a student by name or barcode → pick enrollment → outstanding month → collect, session summary + print) wired into `/payments` admin view; `PaymentReceipt` + `/payments/[id]` printable receipt with QR, linked from both the collection flow and the student's own payment history. Backend: `POST /payments/collect-entrance`, `GET /users/resolve-barcode`. `QrCamera` promoted from the attendance feature to `components/custom/` for reuse here. |
| Student account-setup (NIC + barcode) | ✅ Wired | `/auth/account-setup` (STUDENT-only, `auth` route group — not `(app)`): two NIC photo pickers (front/back, direct-to-R2 presigned PUT, same server-never-touches-the-file pattern as exam PDFs) and an optional institute-barcode section (picker from `GET /institutes` + text input for the code the institute already gave the student, add/remove). `(app)/layout.tsx` now redirects an incomplete `STUDENT` here before any other screen renders; a completed student can revisit anytime via the TopBar user menu ("Account setup") to manage institute barcodes. **Backend** (new): `POST /users/me/nic/upload-url`, `GET/POST /users/me/institute-barcodes`, `DELETE .../:barcodeId` — all STUDENT-gated; `setupCompleted` auto-flips server-side once both NIC sides are on file, no admin-approval step (decision 2026-07-10, see `account-setup.endpoints.md`). Also: `User.barcode` (LMS QR) is now **auto-generated at registration** (`LMS-<indexNumber>`), not left null until an admin assigns one. Verified on the running production stack: **26/26** — auto-gen QR, presigned-URL round trip with a **real PUT to R2** (R2 creds are live, unlike Bunny/Zoom's placeholders), `setupCompleted` flip timing, STUDENT-only role gate, per-institute-not-global barcode uniqueness (same value accepted at institute B after being taken at institute A), ownership-scoped delete (404 not 403, cross-student), and the full SSR gate (incomplete→redirected, non-student bounced away, complete→through). `lint` + `tsc` + `next build` green. |

---

## 2. Known issues

_Resolved 2026-07-09:_
1. ~~`/auth/login` rendered the registration form / files were misplaced.~~ **Fixed** — proper login + signup
   pages, one shared `AuthAside` panel, stale duplicate/empty files removed.
2. ~~Root `/` empty.~~ **Fixed** — redirects to `/home`.
3. ~~styled-components under RSC.~~ **Fixed** — `Grid`, `Nav`, `Header`, `home/page`, and the auth panel migrated
   to Tailwind (+ `<Link>`); `styled-components` no longer imported anywhere in `app/`/`components/`.

_Resolved 2026-07-10:_
4. ~~Raw color classes in `CourseCard`/`StudentReviews`/`Footer`/`/home`.~~ **Fixed** — migrated to design
   tokens (dark-mode safe); fixed invalid Tailwind classes (`w-15`, `-rotate-25`); FontAwesome → lucide (dep removed).
5. ~~Placeholder `href="#"` links.~~ **Fixed** — `CourseCard`/`Footer` now use real routes (`<Link>`).
7. ~~Vendored Magic UI lint errors.~~ **Fixed** — scoped `eslint-disable` with justification; `lint` is now clean.

_Resolved 2026-08-17:_
13. ~~Attendance showed `ComingSoon` for TEACHER.~~ **Fixed** — owning teachers now have session
    rosters and Zoom reconciliation; MARKER remains intentionally unsupported by the role model.

_Still open (re-verified against real code 2026-07-15 — every item below confirmed unchanged since
it was first found; none have drifted in either direction):_
6. **Accessibility:** icon-only controls audit ongoing (Doc 05 §1). Spot-checked 2026-07-15 across
   the newest code (`StaffScanner`, `CollectPayment`, `AdminPayments`) — every icon-only control in
   code shipped since 07-10 correctly has an `aria-label`, so the pattern is holding up going
   forward; the "audit" is about the older pre-07-10 surface, not a regression risk in new work.
   Dark-mode toggle for the app area still not wired.
8. **Server-side token refresh:** the `(app)` guard (`app/(app)/layout.tsx`) still redirects an
   expired-but-refreshable session to login instead of refreshing (RSC can't set cookies) — no
   `middleware.ts` exists at the frontend root. Add a Next `middleware.ts` refresh later (Doc 04 §6).
9. ~~**🔴 `BUNNY_API_KEY` in `backend/.env` is malformed**~~ **RESOLVED / false positive (2026-07-17).**
   The 2026-07-10 finding assumed the key had to be a canonical GUID (`8-4-4-4-12`) and flagged the
   `8-4-4-12-4-4`-segment value as malformed. It isn't — **Bunny Stream Video Library API keys are
   not GUIDs.** Verified live: a read-only call to Bunny's library API with the configured key
   returns **HTTP 200** (owner also independently confirmed uploads work). No action needed; the
   direct-to-Bunny upload path is credential-good. (Playback tokens use the separate
   `BUNNY_TOKEN_KEY`, also present and valid-shaped.)
10. **No frontend listeners for `RESULTS_PUBLISHED`/`TIMETABLE_UPDATED`/`EXAM_CONTROL` SSE events**
    (`lib/hooks/useNotificationStream.ts` only handles `NOTIFICATION_CREATED`) — confirmed still true
    2026-07-15.
11. **Timetable's per-slot `zoomLink` still opens raw `zoom.us`** in a new tab
    (`app/(app)/timetable/page.tsx`), not routed through the embedded Meeting SDK flow the
    class-detail page uses — confirmed still true 2026-07-15.
12. **Timetable-slot authoring UI still doesn't exist.** TEACHER course create/edit was completed
    2026-08-20 with assigned-subject and ownership enforcement; recurring timetable-slot authoring remains.
14. **All of Phase 9's polish items are still un-started**, confirmed by direct grep 2026-07-15: no
    toast library installed at all, no dark-mode/`next-themes` anywhere, zero `error.tsx`/
    `global-error.tsx` files under `app/`, and only 12 of 32 `page.tsx` routes have a `loading.tsx`
    (missing on `/profile`, `/attendance`, `/timetable`, `/admin/audit`,
    `/admin/notification-settings`, the class-detail page, and the live-class room).

---

## 3. Build order (recommended)

**Phase 0 — Foundation (do first, unblocks everything):**
- `lib/env.ts`, `lib/api.ts` (with 401→refresh→retry), `lib/types.ts` (Role, User, and core domain types).
- `AuthProvider` + `useAuth` (`GET /auth/me`); mount in root layout.
- Decide `/` vs `/home`; introduce `(marketing)` and `(app)` route groups.
- (Optional) styled-components registry **or** begin the Tailwind migration of landing components.

**Phase 1 — Auth & onboarding:**
- Wire `/auth/login` (email+password → `POST /auth/login`) and `/auth/signup` (→ `POST /auth/register`) with
  error mapping.
- Post-login redirect to a role-aware `/dashboard`.
- ✅ Student **account setup** (NIC front/back upload, per-institute barcode) — gate on `setupCompleted`.
  See §1's table row and the Done log for the 2026-07-10 implementation.

**Phase 2 — Authenticated shell:** ✅ **Done (2026-07-10)**
- `(app)/layout.tsx`: auth guard (server `/auth/me`), Sidebar + TopBar (role-based nav), mobile drawer.
- Role-aware `/dashboard` landing.

**Phase 3 — Student core:** 🟡 **In progress (2026-07-10)**
- ✅ Browse subjects/courses → course detail → **enroll** → **pay** — `/classes`, `/classes/[classId]`,
  `EnrollPanel` (self-enroll + PayHere initiate). Added the backend enrollment endpoints to unblock it.
- ✅ Timetable view (weekly) — `/timetable`. Class sessions list on the detail page (enrolled-gated).
- ✅ Recorded **video player** (signed Bunny embed URL, enrolled+paid gate) — Recordings list on class
  detail + `/classes/[classId]/videos/[videoId]` (`hls.js`, browser-side token fetch).
- ✅ **Live classes** (Zoom Meeting SDK, embedded in-site) — schedule/start/join CTA on the class detail
  page, `/classes/[classId]/live/[sessionId]` room with watermark + basic UI hardening. Blocked on real
  Zoom credentials for a true end-to-end join (logic verified via a downstream fixture — see table below).
- ✅ Exams: list → sit (MCQ inline + timer) → typed/PDF answers → results when published —
  `/exams`, `/exams/[examId]`. Added backend `GET /submissions/mine`, `writtenAnswers`, and channel flags.
- ✅ QR attendance (student QR display; scan flow is staff-side) — `/attendance` role-aware student view
  (barcode QR + history). Added `barcode`/`setupCompleted` to `/auth/me`.

**Phase 4 — Staff / teacher / marker / admin:** 🟡 **In progress (2026-07-10)**
- 🟡 TEACHER: manage own courses, sessions, videos, exams, marker assignments, and published-result
  corrections. ✅ Course create/edit, exam authoring, and content authoring. Timetable-slot authoring TBD.
- ADMIN (front desk): users, enrollment, pay-at-entrance, attendance scanner (camera/QR).
- ✅ MARKER: submissions queue → grade (marks + feedback) — `/submissions`, `/submissions/[examId]`;
  publish results (TEACHER/SUPER_ADMIN). Exposed `answers`/`writtenAnswers` on the marker list.
- ✅ ADMIN/SUPER_ADMIN: **user management** — `/admin/users` (search/filter, role change, activate/deactivate,
  barcode assign). Ties into QR attendance (staff assign the barcode a student then shows).
- SUPER_ADMIN: subjects, institutes; the rest of the admin/teacher tooling.

**Phase 5 — Polish:**
- Dark mode toggle for the app area, empty/error illustrations, skeletons everywhere, perf pass, a11y audit.

---

## 4. Page inventory (target routes)

| Route | Group | Role | Purpose |
|---|---|---|---|
| `/` or `/home` | marketing | public | Landing (hero, courses, reviews). |
| `/about` `/courses` `/teachers` `/contact` | marketing | public | Marketing detail pages (nav already links them). |
| `/auth/login` `/auth/signup` | auth | public | Sign in / register. |
| `/auth/account-setup` | auth | STUDENT | NIC upload + barcode; gate on `setupCompleted`. |
| `/dashboard` | app | all | Role-aware home. |
| `/classes` `/classes/[id]` | app | STUDENT+ | Browse / course detail + enroll/pay. |
| `/timetable` | app | all | Weekly schedule. |
| `/exams` `/exams/[id]` | app | STUDENT/TEACHER | List / sit / results. |
| `/submissions` (marker queue) | app | MARKER/SUPER_ADMIN/TEACHER | Grade submissions. |
| `/payments` | app | STUDENT/ADMIN/SUPER_ADMIN | Role-aware: student pay/history, admin records + summary + bulk upload. |
| `/attendance` | app | ADMIN/SUPER_ADMIN/TEACHER | Scanner + records. |
| `/admin/users` | app | SUPER_ADMIN/ADMIN | Management. |
| `/admin/subjects` `/admin/institutes` | app | SUPER_ADMIN | Academic taxonomy + center allowlist (owner-scoped). |

---

## 5. Done log

_(Move completed items here with date + PR.)_

- 2026-08-20 — **Secure class artwork editor.** `/classes/[classId]/edit` now shows separate banner
  (1600×600) and backdrop (1920×1080) upload cards with requirements before selection, optional
  client dimension feedback, preview, accessible image descriptions, replace/remove controls, and
  visible errors. Arbitrary URL inputs were removed. The browser uses the ownership-scoped
  presign → direct public-R2 PUT → server-confirm flow; the server remains authoritative for MIME,
  full-decode, byte, pixel, and exact-dimension checks. New-class UX explains that artwork becomes
  available after the class has been created. Production headless-Chromium smoke confirmed both
  visible editors, the exact dimension guidance, accessible fields, absence of URL inputs, and no
  page errors; positive/negative real-R2 API smoke verified the complete lifecycle.

- 2026-08-17 — **Teacher attendance reporting + Zoom recovery.** `/attendance` now gives an owning
  TEACHER a course/session picker, source-labelled roster, and read-before-write Zoom difference panel;
  SUPER_ADMIN gets the same report below the existing entrance scanner. Applying a preview uses a UUID
  `Idempotency-Key`, refreshes Zoom server-side, inserts only missing active course enrollments, and leaves
  unknown/conflicting identities for manual review. Added regression coverage for role-scoped page wiring,
  preview/apply behavior, identity aggregation, enrollment gating, ownership, pagination, and retries.

- 2026-07-10 — Phase 1: **Student account setup** (NIC upload + institute barcodes). `/auth/account-setup`
  (STUDENT-only): two NIC photo pickers (front/back), direct-to-R2 presigned PUT — same pattern as exam
  PDFs, server never touches the file. Optional institute-barcode section (plain text — the student types
  in a code their physical institute already issued, not a scan). `(app)/layout.tsx` gates the whole
  authenticated area on `setupCompleted` for STUDENT. **Backend** (new): `POST /users/me/nic/upload-url`
  (eager DB write at URL-generation time, `setupCompleted` auto-flips once both sides are on file — no
  admin-approval step exists, a deliberate scope decision, see `account-setup.endpoints.md`),
  `GET/POST /users/me/institute-barcodes`, `DELETE .../:barcodeId` (ownership-scoped). Also:
  `User.barcode` (the LMS QR) is now **auto-generated at registration** (`LMS-<indexNumber>`) instead of
  staying null until an admin manually assigns one. Verified on the running production stack: **26/26** —
  including a **real PUT to R2** (unlike Bunny/Zoom, R2 creds are live and this proved it end-to-end),
  per-institute (not global) barcode uniqueness confirmed both ways (same value rejected at the same
  institute, accepted at a different one), ownership-scoped delete, STUDENT-only role gate, and the full
  SSR flow (incomplete-setup redirect, non-student bounce, complete-setup pass-through). While
  investigating this, found and documented two related gaps: `POST /attendance/scan` did not use
  `StudentBarcode`/institute context (fixed 2026-08-13), and `POST /attendance/video` had no frontend
  caller (fixed 2026-07-12) — see `attendance.endpoints.md`. `lint` + `tsc` +
  `next build` green (24 routes) on both frontend and backend.
- 2026-07-10 — Phase 4 (part 5): **Direct-to-Bunny video upload**. Teachers now upload the recording file
  itself through the site: `POST /videos/uploads` (new; TEACHER/SUPER_ADMIN) creates the Bunny video +
  a `VideoRecording` row (`status: UPLOADING`, new `VideoStatus` enum) and returns a signed **TUS**
  authorization (`generateBunnyTusUpload` — `sha256(libraryId+apiKey+expire+videoId)`, per Bunny's TUS
  docs); the browser uploads directly to Bunny via `tus-js-client` (resumable, progress bar) — the file
  never touches our server (architecture §5.6). `POST /videos/bunny-webhook` (new; Bunny → us, verified by
  a `BUNNY_WEBHOOK_SECRET` query param since Bunny's library webhook has no per-request signature;
  idempotent `updateMany`) is the **only** thing that flips a video to `READY`/`FAILED` — completion is
  confirmed by Bunny, not the client, so the upload survives the teacher going offline the instant the
  transfer finishes. `GET /videos/class/:id` now hides non-`READY` videos from students (staff still see
  them, with status); `GET /:id/stream` returns `409 VIDEO_NOT_READY` (distinct message for processing vs.
  failed) instead of ever streaming an unfinished video. The legacy manual-attach `POST /videos` (paste an
  already-on-Bunny ID) is unchanged and still goes straight to `READY`. Frontend: rebuilt `VideoForm` as a
  real file picker with a progress bar, added a Processing/Failed badge to the class-page recordings list,
  and a distinct "not ready yet" retry card in `VideoPlayer`. New: `lib/types.ts` `VideoStatus`/
  `BunnyTusUpload`/`InitiateUploadResult`, `tus-js-client` dep. Verified on the running production stack
  (nginx + backend + worker + postgres + redis + backup, all up): **15/15** logic checks — TUS signature
  proven byte-identical to an independent recomputation; role gate; visibility before/after; webhook
  secret rejection, mid-flight no-op, unknown-GUID no-op, Finished→READY, idempotent replay, Error→FAILED;
  stream 409 before/failed, 200 once ready; legacy attach still READY-immediately — plus SSR render of the
  new upload form and status badges. **Found via this testing, not fixed (needs the real credential):**
  `BUNNY_API_KEY` in `backend/.env` is a malformed GUID, confirmed by a real `401` from Bunny's management
  API — logged as open issue #9 above. `lint` + `next build` green (21 routes); backend `tsc` green.
- 2026-07-09 — Frontend agent docs authored (`context/frontend/00–06`, README).
- 2026-07-09 — Phase 0 foundation: `lib/env.ts`, `lib/types.ts`, `lib/api.ts` (401→refresh→retry),
  `AuthProvider`/`useAuth`; mounted in root layout; `/`→`/home`; fixed workspace-root warning.
- 2026-07-09 — Phase 1 (partial): wired login + signup to `/auth/login`·`/register` with field-error mapping;
  shared `AuthAside`; minimal authed `/dashboard`. Migrated landing/auth off `styled-components` → Tailwind.
- 2026-07-10 — Landing + auth refined to code standards (PR #44): design tokens throughout, FontAwesome → lucide
  (dep removed), invalid Tailwind classes fixed, real LMS footer, show/hide password toggle, `--font-sans` fix;
  vendored Magic UI lint suppressed. `lint` + `tsc` + `next build` green.
- 2026-07-10 — Phase 2 authenticated `(app)` shell: server auth-guard layout, `AppShell` (fixed sidebar + mobile
  drawer + sticky TopBar), role-based `Sidebar`/`lib/nav.ts`, `TopBar` user menu + logout, role-aware `/dashboard`,
  `PageHeader`/`ComingSoon` + route stubs. Guard + role filtering smoke-tested (SUPER_ADMIN vs STUDENT).
- 2026-07-10 — Phase 4 (part 4): **Teacher content authoring**. Class detail page now shows staff-only
  **New session** + **Attach recording** CTAs. `/classes/[classId]/sessions/new` (`SessionForm` — title,
  date [datetime-local → ISO], duration, mode, Zoom link → `POST /classes/:id/sessions`) and
  `/classes/[classId]/videos/new` (`VideoForm` — session picker + title + Bunny video ID + duration [min→s]
  → `POST /videos`). Both routes gated to TEACHER/SUPER_ADMIN (else → class detail); static `new` segments
  win over the `[sessionId]`/`[videoId]` dynamics. Frontend-only. Verified on the running stack: **7/7** —
  create session → appears in course sessions → attach video → appears in recordings, linked to the session,
  and the enrolled student sees both; plus SSR render of both forms + CTAs + student redirect. `lint` +
  `next build` green (23 routes).
- 2026-07-10 — Phase 4 (part 3): **Teacher exam authoring**. `/exams/new` (TEACHER/SUPER_ADMIN gate;
  others → `/exams`): `ExamForm` (client) — title, course select (`GET /classes`), type, window
  (datetime-local → ISO), total marks, written channels (typed/PDF, shown for WRITTEN/HYBRID), and
  `McqBuilder` (client, shown for MCQ/HYBRID — add/remove questions + options, mark correct, per-question
  marks). Client-validates then builds the `mcqPayload` (generated `q*/o*` ids) and `POST /exams`. Added a
  **New exam** CTA (staff-only) to `/exams` and a role-aware description. Marker assignment was deferred
  at that time; it was completed on 2026-08-20 using the scoped academic-staff endpoint and exact-set UI.
  New: `lib/roles.ts` unaffected; frontend-only.
  Verified on the running stack: **7/7** — the form's exact MCQ payload is accepted (201), staff detail
  keeps `isCorrect`, the enrolled student sees it answer-stripped during the window and can submit; plus
  SSR render of the form + staff CTA + student redirect. `lint` + `next build` green (21 routes).
- 2026-07-10 — Phase 4 (part 2): **Admin user management**. `/admin/users` (SUPER_ADMIN/ADMIN gate; others
  redirect to `/dashboard`): searchParams-driven search + role/status filters + pagination (server-fetched
  `GET /users`); `UserFilters` (client) + `UsersTable` (client) with inline actions — change role
  (SUPER_ADMIN only), activate/deactivate, and assign/edit the entrance **barcode**, each via
  `PATCH /users/:id/{role,status,barcode}` + `router.refresh()`; self-row protected from role/status edits.
  New: `lib/roles.ts` (`roleLabel`), route `loading.tsx`. Frontend-only (endpoints already existed).
  Verified on the running stack: **8/8** API checks (list/search/role-filter, barcode persist, role change,
  deactivate→inactive/hidden-from-active, reactivate) + SSR render (admin sees the table; a student is
  redirected). `lint` + `next build` green (20 routes).
- 2026-07-10 — Phase 4 (part 1): **Marking — grade queue + publish**. `/submissions` lists gradable
  exams (active/ended, students redirected to `/exams`); `/submissions/[examId]` is the grading queue —
  `GradeSubmissionRow` (client) expands to show the student's typed `writtenAnswers` / MCQ selections
  (correct vs chosen) / answer-PDF link, then takes marks (0–totalMarks) + feedback via
  `PATCH /submissions/:id/marks` (with `Idempotency-Key`); `PublishResultsButton` (client, TEACHER/
  SUPER_ADMIN, confirm-gated, disabled until the exam ends). MARKER-not-assigned → friendly gate; reused
  `ExamStatusBadge`/`ExamNotice`/`lib/exam`. New: `ExamSubmission`/`PublishResult` types, route
  `loading.tsx` skeletons. **Backend**: added `answers` + `writtenAnswers` to `submissionListSelect` so
  the marker can grade typed answers. Verified end-to-end on the running stack: **11/11** — student typed
  submit → marker (assigned) sees the text → grades 82/100 → publish blocked while active
  (`EXAM_STILL_ACTIVE`) → publish after end → **student sees the published mark + feedback**; plus SSR
  render of both marker pages. `lint` + `next build` green (19 routes); backend `tsc` green.
- 2026-07-10 — Phase 3 (part 4): **QR attendance (student)**. `/attendance` is now a role-aware server
  page: a STUDENT sees a scannable QR of their `barcode` (`qrcode.react` `QRCodeSVG`, on a fixed white
  plate) to show at the entrance, plus their attendance history (`GET /attendance/student/:id`, self-scoped,
  best-effort); non-students keep the scanner `ComingSoon`. New: `qrcode.react` dep, `AttendanceRecord`
  type, `lib/attendance.ts`, route `_components/AttendanceQr`. Added STUDENT to the Attendance nav item.
  **Backend**: `/auth/me` now returns `barcode` + `setupCompleted` (the getMe select stripped them, so a
  student had no way to read their own entrance code). Verified end-to-end against the running stack:
  6/6 attendance API checks (barcode assign → staff manual scan → student reads own history; cross-student
  read blocked 403) + SSR render of the QR page. `lint` + `next build` green (18 routes); backend `tsc` green.
- 2026-07-10 — Phase 3 (part 3): **Recorded video player**. Class detail now lists **Recordings**
  (`GET /videos/class/:id`, enrollment-gated, best-effort); new route `/classes/[classId]/videos/[videoId]`
  renders a `VideoPlayer` (`components/features/VideoPlayer.tsx`, client) that browser-fetches the IP-bound
  `GET /videos/:id/stream` and plays the Bunny HLS `.m3u8` via `hls.js` (native HLS on Safari), with
  `402`/`403` gate cards, retry, token-expiry handling, and the HDCP black-screen tip. Added `hls.js` dep,
  `VideoRecording`/`StreamData` types, `lib/video.ts` (`formatDuration`), route `loading.tsx`. Frontend-only
  (no backend change — video endpoints already existed). `lint` + `next build` green (18 routes).
  *Superseded 2026-07-11:* the player now renders Bunny's token-authenticated iframe embed with a
  repositioning watermark and no longer uses `hls.js`; the stream is not IP-bound. See
  `docs/superpowers/specs/2026-07-11-bunny-video-drm-design.md`. The "HDCP black-screen tip" described
  above does not exist in the current player.
- 2026-07-10 — Phase 3 (part 2): **Exams**. `/exams` list (status filter, type/status badges, submission
  hints) + `/exams/[examId]` sit flow (MCQ checkboxes, visual countdown from server `endTime`, localStorage
  autosave + `BroadcastChannel` cross-tab sync, typed **or** PDF-upload written channel, one-shot submit) and a
  results view (marks/feedback gated on `isPublished`). New: `lib/exam.ts`, `components/features/ExamStatusBadge`,
  route-private `ExamCard`/`ExamSit`/`McqQuestionList`/`WrittenAnswerPanel`/`CountdownTimer`/`ExamResult`/`ExamNotice`,
  `loading.tsx` skeletons. Fixed `lib/types.ts` `Exam` (was `startsAt`/`endsAt`) + added submission types.
  **Backend** (companion PR): `GET /submissions/mine` (marks gated on publish), typed `writtenAnswers` on
  `POST /submissions` (typed-only → `COMPLETED`), `allowTypedAnswers`/`allowPdfUpload` on exam list+detail reads;
  docs updated. `lint` + `next build` green (17 routes); backend `tsc` green.
- 2026-07-10 — Phase 3 (part 1): `/classes` browse (search, subject names, enrolled badges), `/classes/[classId]`
  detail (sessions gated on `NOT_ENROLLED`) + `EnrollPanel` (self-enroll / drop / PayHere pay), `/timetable` weekly
  view. Extended `Course` type (`monthlyFee`/`description`/`isActive`), added `ClassSession`/`Enrollment` types +
  `formatCurrency`. **Backend**: new enrollment resource (`POST/GET/DELETE /api/enrollments` + `/my`) with docs —
  the `Enrollment` model had no API, which had blocked enroll→pay. `tsc` + `lint` + `next build` green (17 routes).
