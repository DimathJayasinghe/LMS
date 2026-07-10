# 06 — Frontend Roadmap

> The build order and page inventory for the frontend, mirroring the backend's `06-progress-tracker.md`.
> Keep this current: when a screen is done (per Doc 00 §7), move it to **Done** with the date.

_Last updated: 2026-07-09._

---

## 1. Current state (what exists today)

| Area | Status | Notes |
|---|---|---|
| Next.js 16 + Tailwind v4 + shadcn scaffold | ✅ Done | `components/ui/` primitives, `components.json`, tokens in `globals.css`. |
| Poppins font wired | ✅ Done | `app/layout.tsx` (`--font-poppins`). |
| Marketing landing (`/home`) | 🟡 Partial | Grid backdrop, pill Nav, hero Header + Rainbow CTA, StudentReviews, CourseCard grid, Footer. Migrated off `styled-components` → Tailwind + `<Link>`. Still uses static demo data + some raw color classes (token cleanup pending). |
| Auth screens (`/auth/login`, `/auth/signup`) | ✅ Wired | Real login (email+password → `POST /auth/login`) and register (→ `POST /auth/register`); shared `AuthAside` panel; API + field-error mapping; redirect to `/dashboard`. |
| Root `/` | ✅ Done | Redirects to `/home` (`app/page.tsx`). |
| API client / auth context | ✅ Done | `lib/env.ts`, `lib/types.ts`, `lib/api.ts` (401→refresh→retry), `lib/hooks/useAuth.tsx` (`AuthProvider`/`useAuth`) mounted in root layout. |
| Minimal authed `/dashboard` | ✅ Done | Placeholder that closes login→dashboard→logout. Full role shell still pending. |
| Dashboard shell / `(app)` area | ❌ Missing | No authenticated layout, sidebar, or role dashboards yet. |
| Student account-setup (NIC + barcode) | ❌ Missing | UI not built; **backend upload endpoints not yet exposed** (see backend progress tracker). |

---

## 2. Known issues

_Resolved 2026-07-09:_
1. ~~`/auth/login` rendered the registration form / files were misplaced.~~ **Fixed** — proper login + signup
   pages, one shared `AuthAside` panel, stale duplicate/empty files removed.
2. ~~Root `/` empty.~~ **Fixed** — redirects to `/home`.
3. ~~styled-components under RSC.~~ **Fixed** — `Grid`, `Nav`, `Header`, `home/page`, and the auth panel migrated
   to Tailwind (+ `<Link>`); `styled-components` no longer imported anywhere in `app/`/`components/`.

_Still open:_
4. **Raw color classes** (`bg-white`, `text-gray-*`) linger in `CourseCard`, `StudentReviews`, `Footer`, and the
   `/home` section — migrate to tokens for dark-mode correctness (Doc 05 §7).
5. **Placeholder `href="#"`** links in `CourseCard`/`Footer` need real routes.
6. **Accessibility:** the hero is a single large `<h1>`; icon-only controls in vendored components need labels
   (Doc 05 §1).
7. **Vendored Magic UI lint errors** (`text-animate.tsx`, `typing-animation.tsx`: setState-in-effect) pre-date
   this work; clean up or replace when convenient.

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
- Student **account setup** (NIC front/back upload, per-institute barcode) — gate on `setupCompleted`
  (backend flow pending; see backend progress tracker).

**Phase 2 — Authenticated shell:**
- `(app)/layout.tsx`: auth guard (server `/auth/me`), Sidebar + TopBar (role-based nav), mobile drawer/bottom nav.
- Role-aware `/dashboard` landing.

**Phase 3 — Student core:**
- Browse subjects/courses → course detail → **enroll** → **pay** (online + status).
- Timetable view (weekly). Class sessions list; recorded **video player** (stream token, enrolled+paid gate);
  live class join.
- Exams: list → sit (MCQ inline + timer) → upload/typed answers → results when published.
- QR attendance (student QR display; scan flow is staff-side).

**Phase 4 — Staff / teacher / marker / admin:**
- TEACHER: manage own courses, sessions, timetable slots, videos, exams.
- ADMIN (front desk): users, enrollment, pay-at-entrance, attendance scanner (camera/QR).
- MARKER: submissions queue → grade (marks + feedback).
- SUPER_ADMIN: subjects, institutes, everything above + publish results.

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
| `/payments` | app | ADMIN/SUPER_ADMIN | Payment records + entrance collection. |
| `/attendance` | app | ADMIN/SUPER_ADMIN/TEACHER | Scanner + records. |
| `/admin/users` `/admin/subjects` `/admin/institutes` | app | SUPER_ADMIN/ADMIN | Management. |

---

## 5. Done log

_(Move completed items here with date + PR.)_

- 2026-07-09 — Frontend agent docs authored (`context/frontend/00–06`, README).
- 2026-07-09 — Phase 0 foundation: `lib/env.ts`, `lib/types.ts`, `lib/api.ts` (401→refresh→retry),
  `AuthProvider`/`useAuth`; mounted in root layout; `/`→`/home`; fixed workspace-root warning.
- 2026-07-09 — Phase 1 (partial): wired login + signup to `/auth/login`·`/register` with field-error mapping;
  shared `AuthAside`; minimal authed `/dashboard`. Migrated landing/auth off `styled-components` → Tailwind.
