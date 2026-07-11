# 06 — Frontend Roadmap

> The build order and page inventory for the frontend, mirroring the backend's `06-progress-tracker.md`.
> Keep this current: when a screen is done (per Doc 00 §7), move it to **Done** with the date.

_Last updated: 2026-07-10._

---

## 1. Current state (what exists today)

| Area | Status | Notes |
|---|---|---|
| Next.js 16 + Tailwind v4 + shadcn scaffold | ✅ Done | `components/ui/` primitives, `components.json`, tokens in `globals.css`. |
| Poppins font wired | ✅ Done | `app/layout.tsx` (`--font-poppins`). |
| Marketing landing (`/home`) | ✅ Done | Grid backdrop, pill Nav, hero Header + Rainbow CTA, StudentReviews, CourseCard grid, real LMS Footer. Off `styled-components` → Tailwind + `<Link>`; **all colors on design tokens**, icons on **lucide** (FontAwesome removed). Still uses static demo data (real data on `/classes`). |
| Auth screens (`/auth/login`, `/auth/signup`) | ✅ Wired | Real login (email+password → `POST /auth/login`) and register (→ `POST /auth/register`); shared `AuthAside`; **show/hide password toggle**; API + field-error mapping; redirect to `/dashboard`. |
| Root `/` | ✅ Done | Redirects to `/home` (`app/page.tsx`). |
| API client / auth context | ✅ Done | `lib/env.ts`, `lib/types.ts`, `lib/api.ts` (401→refresh→retry), `lib/hooks/useAuth.tsx` (`AuthProvider`/`useAuth`) mounted in root layout. |
| Authenticated `(app)` shell | ✅ Done | `app/(app)/layout.tsx` server auth-guard (`/auth/me`, forwarded cookies → redirect to login); `AppShell` (fixed sidebar + mobile drawer + sticky TopBar); role-based `Sidebar` (`lib/nav.ts`), `TopBar` user menu + logout. |
| Role-aware `/dashboard` | ✅ Done | Moved into `(app)`; greets user + renders role-filtered quick-link cards. |
| Classes: browse + detail | ✅ Wired | `/classes` server-fetches `GET /classes` (search box → `?search`), subject names from `GET /subjects`, "Enrolled" badges from `GET /enrollments/my`. `/classes/[classId]` shows detail + sessions (gracefully gated on `403 NOT_ENROLLED`) + `EnrollPanel`. |
| Enroll → pay | ✅ Wired | `EnrollPanel` (client): self-enroll (`POST /enrollments`, ONLINE/PHYSICAL), drop (`DELETE /enrollments/:id`), and **pay** via the shared `initiatePayherePayment` (`POST /payments/initiate` with a UUID `Idempotency-Key` → auto-POST form to PayHere checkout). Live charge verified against the sandbox merchant (2026-07-11). |
| Timetable | ✅ Wired | `/timetable` server-fetches `GET /timetable/slots` + `GET /classes`, renders a Monday-first weekly view (time range, course/title, mode badge, Zoom join). |
| Enrollment API (backend) | ✅ Added | `POST/GET/DELETE /api/enrollments` (+ `/my`) — the `Enrollment` model previously had no API; this unblocks the paid flow (see `context/api_endpoints/enrollments.endpoints.md`). |
| Exams: list + sit + results | ✅ Wired | `/exams` (status filter, type/status badges, "Submitted/Results out" hints), `/exams/[examId]` sit flow: MCQ (checkboxes + visual countdown from server `endTime` + localStorage autosave + cross-tab `BroadcastChannel`), typed **or** PDF-upload written channel, one-shot submit, and a results view (marks/feedback gated on publish). **Backend**: `GET /submissions/mine`, typed `writtenAnswers` on `POST /submissions`, `allowTypedAnswers`/`allowPdfUpload` exposed on exam reads. |
| Teacher: direct-to-Bunny video upload | ✅ Wired | `/classes/[classId]/videos/new` is now a real file-picker upload (not a manual Bunny-ID paste): `POST /videos/uploads` creates a Bunny video + a `VideoRecording` row (`status: UPLOADING`) and returns a signed **TUS** target; the browser (`tus-js-client`) uploads the file **directly to Bunny** with resumable/progress UI — the file never touches our server. `POST /videos/bunny-webhook` (Bunny → us, secret-query-param verified, idempotent) is the **only** thing that flips a video to `READY`/`FAILED`, so the upload survives the teacher going offline the instant the transfer finishes. Students never see non-`READY` videos; staff see a Processing/Failed badge. Streaming a non-`READY` video returns `409 VIDEO_NOT_READY`. ⚠️ **`BUNNY_API_KEY` in `backend/.env` is a malformed GUID** (confirmed via a real 401 from Bunny's management API) — upload creation is blocked until it's replaced with the real Video Library API key from the Bunny dashboard; this may also affect existing stream-token signing, which was never previously verified against Bunny's live CDN. |
| Recorded video player | ✅ Wired | Class detail lists **Recordings** (`GET /videos/class/:id`, enrollment-gated); `/classes/[classId]/videos/[videoId]` plays the IP-bound Bunny HLS stream via `hls.js` (browser-fetched `GET /videos/:id/stream` so the token binds to the viewer's IP), with `402 PAYMENT_REQUIRED` / `403 NOT_ENROLLED` gates, retry, and the HDCP black-screen tip. Needs live Bunny config + seeded videos for end-to-end playback. |
| QR attendance (student) | ✅ Wired | `/attendance` is role-aware: a STUDENT sees a scannable **QR of their `barcode`** (`qrcode.react`) to show at the entrance + their attendance history (`GET /attendance/student/:id`, self-scoped); staff still get the scanner placeholder (Phase 4). **Backend**: `/auth/me` now returns `barcode` + `setupCompleted` (it previously stripped them, so a student couldn't read their own code). Added STUDENT to the Attendance nav item. |
| Marking: queue + grade + publish | ✅ Wired | `/submissions` lists gradable exams (active/ended); `/submissions/[examId]` is the grading queue (per-student rows, expand to see typed/MCQ answers or the answer-PDF link, enter marks + feedback → `PATCH /submissions/:id/marks` with an `Idempotency-Key`), plus a **Publish results** action for TEACHER/SUPER_ADMIN (gated until the exam ends). Markers not assigned get a friendly gate. **Backend**: exposed `answers` + `writtenAnswers` on the per-exam submissions list so typed answers are gradable. |
| Teacher: content authoring | ✅ Wired | On the class detail page, staff get **New session** + **Attach recording** CTAs. `/classes/[classId]/sessions/new` (title, date, duration, mode, Zoom link → `POST /classes/:id/sessions`) and `/classes/[classId]/videos/new` (session picker + title + Bunny video ID + duration → `POST /videos`). Both gated to TEACHER/SUPER_ADMIN. Frontend-only. |
| Live classes (Zoom Meeting SDK) | ✅ Wired | Every **ONLINE** session on the class detail page gets an in-site CTA (`LiveClassAction`, replacing the old raw `zoomLink` anchor): staff see **Schedule live class** (`POST .../live/schedule`, one-time — provisions a real Zoom meeting) until scheduled, then everyone sees **Start**/**Join**, both routing to `/classes/[classId]/live/[sessionId]` — never zoom.us. That page (`LiveClassRoom`, client) fetches a **fresh, never-cached** join token per visit (`POST .../live/token`), dynamically imports `@zoom/meetingsdk/embedded` (SSR-unsafe), and embeds the meeting via `client.init()`/`client.join()`. Deterrent layers per the endpoint doc's anti-recording section: repositioning watermark (server-derived name + live timestamp, no client-spoofable identity), context-menu suppression, and the backend's meeting-settings lockdown + throttled tokens. Gated errors (`NOT_ENROLLED`/`PAYMENT_REQUIRED`/`LIVE_CLASS_NOT_SCHEDULED`/`TOKEN_RATE_LIMITED`) render friendly states, not crashes; `connection-change` → `Closed` shows an "ended" screen. Packaging note: `@zoom/meetingsdk` peer-pins `react@18.2.0` against this project's `react@19` — installed via a repo `.npmrc` (`legacy-peer-deps=true`); its UMD bundle also statically references the private, unpublished `@zoom/download-manager` (an optional dep of a local-recording-download feature we don't use, since recording is disabled) — aliased to a no-op stub via `turbopack.resolveAlias` in `next.config.ts`, with real `jszip` installed for the bundle's other optional dep. ⚠️ All `ZOOM_*` env vars in `backend/.env` are still placeholders — verified end-to-end via a downstream Prisma fixture (seeding `zoomMeetingId` directly) since the real Zoom API can't be reached yet; blocked on real Server-to-Server OAuth + Meeting SDK credentials (see live-class.endpoints.md's setup checklist). The **Timetable**'s per-slot `zoomLink` (a separate, simpler `TimetableSlot` field for recurring slots) still opens raw zoom.us in a new tab — not yet folded into this in-site flow; flagged as a known follow-up, not done as part of this feature. |
| Teacher: exam authoring | ✅ Wired | `/exams/new` (TEACHER/SUPER_ADMIN; others redirect): create an exam — title, course, type, window (datetime-local → ISO), total marks, written channels (typed/PDF), a **question-paper PDF upload** (direct-to-R2, server never touches the file — same presigned-PUT pattern as the student answer-PDF channel; retry-safe if only the upload leg fails, never duplicates the exam), and an **MCQ builder** (add questions/options, mark correct). Builds the `mcqPayload` (generated ids) and `POST /exams`. Staff get a **New exam** CTA on `/exams`. Marker assignment deferred (needs user-list access, which TEACHER lacks). Frontend-only (`POST /exams/:id/upload-url` already existed server-side, unwired until now). |
| Admin: user management | ✅ Wired | `/admin/users` (SUPER_ADMIN/ADMIN; others redirect): searchable/filterable (role, status) paginated user table with inline actions — change role (SUPER_ADMIN only), activate/deactivate, assign/edit entrance **barcode**. All via `PATCH /users/:id/{role,status,barcode}`; self-row protected. Frontend-only (endpoints existed). |
| Admin: subjects & institutes | ✅ Wired | `/admin/subjects` + `/admin/institutes` (**SUPER_ADMIN-only** — stricter than `/admin/users`; ADMIN redirected off both, per the academic-taxonomy/center-allowlist being owner-scoped). Each is a server page (SSR gate + `GET /…?search`) → a single client `*Manager` owning search (`?search` re-fetch), a client-side Active/Inactive/All segmented filter over the SUPER_ADMIN list (which already returns inactive rows — no extra round-trip), inline **create** (toggle form card, `isActive` Switch) and inline **row edit** (one row at a time; opening either collapses the other), and per-row **activate/deactivate** — all `POST`/`PATCH` + `router.refresh()` (server-truth, no optimistic cache). Duplicate name/`code` (409) + validation errors map to inline per-form/per-row text (no toast/modal — none installed). Frontend-only (subject/institute CRUD endpoints existed + tested). **Verified**: 18 Vitest+RTL unit tests (filter, submit-gating, 409→inline, create/edit exclusivity, empty states) + `tsc` + `next build` green, plus a **headless-Chromium UI smoke on the live Docker stack** — create → edit → deactivate (Active hides / All shows "Inactive") → duplicate name/`code` 409 inline, for both resources, and an ADMIN (front-desk) served `/dashboard` at both URLs with no management control (SSR gate holds). `lint` clean on the new files (2 pre-existing errors remain in untouched `Nav.tsx`/`useNotificationStream.ts`). |
| Payments (student + admin) | ✅ Wired | Role-aware `/payments` (SSR `/auth/me` branch; STUDENT vs SUPER_ADMIN/ADMIN, else redirected). **Student**: per active enrollment a this-month **Pay**/Paid card (Pay reuses the shared `initiatePayherePayment` → auto-POST to PayHere) + a status-filterable history table. **Admin**: month **summary** (new `GET /payments/summary?month=` aggregate — SUCCESS total + status counts, Vitest-tested), status/month-filtered paginated records table, and **Excel bulk upload** (`api.upload` multipart → `{total,created,updated,skipped,errors[]}` rendered with per-row errors). Added STUDENT to the `/payments` nav item. **Bug fixed en route**: `/payments/initiate` requires a UUID `Idempotency-Key` (repo invariant) that neither EnrollPanel nor the new page sent — extracted `redirectToPayhere`/`currentPaymentMonth` + a new `initiatePayherePayment` (which mints the key) into `lib/payhere.ts`, so both call sites now complete a real PayHere charge. Verified: 10 Vitest+RTL unit tests + `tsc`/build + a headless-Chromium smoke on the live stack (student Pay → real POST to sandbox.payhere.lk; admin summary/filter/bulk-upload; TEACHER bounced). No more `(app)` route stubs remain. |
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

_Still open:_
6. **Accessibility:** icon-only controls audit ongoing (Doc 05 §1). Dark-mode toggle for the app area not wired yet.
8. **Server-side token refresh:** the `(app)` guard redirects an expired-but-refreshable session to login instead
   of refreshing (RSC can't set cookies). Add a Next `middleware.ts` refresh later (Doc 04 §6).
9. **🔴 `BUNNY_API_KEY` in `backend/.env` is malformed** (found 2026-07-10 via smoke test): the value is a
   corrupted GUID (`8-4-4-12-4-4` hex segments instead of the valid `8-4-4-4-12`), so Bunny's management API
   rejects it with a real `401 Authentication has been denied for this request.` This blocks the direct-to-Bunny
   upload's video-creation step. Because `BUNNY_API_KEY` is also used to sign playback tokens
   (`generateBunnyStreamUrl`), earlier "successful" stream-URL tests only proved our server *constructs* a
   syntactically valid signed URL — they never proved Bunny's CDN *accepts* it. **Action needed:** replace
   `BUNNY_API_KEY` in `backend/.env` with the real Video Library API Key (Bunny dashboard → Stream → select the
   library → API), then re-verify both upload creation and actual HLS playback end-to-end.

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
- ✅ Recorded **video player** (IP-bound stream token, enrolled+paid gate) — Recordings list on class
  detail + `/classes/[classId]/videos/[videoId]` (`hls.js`, browser-side token fetch).
- ✅ **Live classes** (Zoom Meeting SDK, embedded in-site) — schedule/start/join CTA on the class detail
  page, `/classes/[classId]/live/[sessionId]` room with watermark + basic UI hardening. Blocked on real
  Zoom credentials for a true end-to-end join (logic verified via a downstream fixture — see table below).
- ✅ Exams: list → sit (MCQ inline + timer) → typed/PDF answers → results when published —
  `/exams`, `/exams/[examId]`. Added backend `GET /submissions/mine`, `writtenAnswers`, and channel flags.
- ✅ QR attendance (student QR display; scan flow is staff-side) — `/attendance` role-aware student view
  (barcode QR + history). Added `barcode`/`setupCompleted` to `/auth/me`.

**Phase 4 — Staff / teacher / marker / admin:** 🟡 **In progress (2026-07-10)**
- 🟡 TEACHER: manage own courses, sessions, timetable slots, videos, exams. ✅ **Exam authoring**
  (`/exams/new`), ✅ **content authoring** (sessions + attach recordings from the class page). Course
  create/edit + timetable-slot authoring TBD.
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
  investigating this, found and documented (not fixed) two related gaps: `POST /attendance/scan` never
  uses `StudentBarcode`/institute context (only the LMS QR), and `POST /attendance/video` exists
  server-side but nothing on the frontend calls it — see `attendance.endpoints.md`. `lint` + `tsc` +
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
  **New exam** CTA (staff-only) to `/exams` and a role-aware description. Marker assignment deferred (needs
  `GET /users?role=MARKER`, which TEACHER can't call). New: `lib/roles.ts` unaffected; frontend-only.
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
