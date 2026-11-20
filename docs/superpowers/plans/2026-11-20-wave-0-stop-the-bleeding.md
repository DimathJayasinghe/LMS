# Wave 0: Stop the Bleeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the live access leaks and the "logged out after 15 minutes" failure found in the 2026-11-19 audit, in order of impact, without waiting for tenancy steps M2-M7 and without adding a table. Findings closed: F-01, F-04, F-06, F-09, F-07, F-54, F-02, F-55, plus the owner-account slice of F-28 and F-31 that the 2026-11-20 sequencing placed in Wave 0.

**Architecture:** Eight small PRs, each independently deployable and revertable, behind one docs PR. No new Prisma model; one additive nullable column (`RefreshToken.rotatedAt`, F-01). Behaviour numbers that are deployment knobs are Zod env vars with defaults (precedent: `JWT_ACCESS_EXPIRES_IN`). Business policy numbers wait for the `OrganizationSetting` registry that opens Wave 1.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`) / React 19; Express 5 / Prisma 7 / PostgreSQL; Redis (rate limits, BullMQ); Vitest; Docker Compose + nginx.

**Source of truth:** [18-flow-audit-findings-register.md](../../../context/documents/18-flow-audit-findings-register.md) (findings and fixes), [17-roles-permissions-and-flows.md](../../../context/documents/17-roles-permissions-and-flows.md) §7 (waves), the owner decisions of 2026-11-20 cited below by id.

> **Security-class findings.** This repository is public. F-04, F-06, F-07, F-09 and F-54 are described here only at the defect-class level used in doc 18: what is being closed, the test categories, effort and rollback. The specific mechanisms, endpoints, exact lines and test names live in the private notes file with the same name as this plan (`2026-11-20-wave-0-stop-the-bleeding.md` under the private `plans/` directory kept with the audit notes, outside the repository). Implementers read it before starting Tasks 2-5. PR titles, branch names, commit messages, test titles and release notes for those tasks must stay at the wording in this file.

## Preconditions

| Id | What Wave 0 relies on | Where it is decided |
|---|---|---|
| D-ACCESS-8 | Recording reads (list, metadata, stream) are allowed only for an enrolled eligible student, the owning teacher and the owner. Other roles never open recordings; they get a `hasRecording` boolean on the session. Non-student stream opens write an audit row. Decided, not reopened (answers doc 17 §9 item 12, recordings half). | Owner decisions 2026-11-20 |
| D-ACCESS-4, Wave 0 slice only | A scan code identifies exactly one student across both code kinds; one resolver; write-time uniqueness; a pre-deploy collision report. The random QR scheme, reissue endpoint and scanner photo are Wave 1 and are not in this plan. (Answers doc 17 §9 item 12, scan half.) | Owner decisions 2026-11-20 |
| D-IDENTITY-5, non-numeric slice only | Owner invariants and a create-only seed. `identity.maxOwners` and password step-up are deferred to Wave 1 because step-up needs F-15 (per-request revocation). | Owner decisions 2026-11-20 |
| Decided 2026-11-19 | Express + Next stay; Organization is the tenant, Institute is a branch; PHYSICAL-only students lose live and recording access unless HYBRID (Wave 2, not built here). | `CLAUDE.md` |
| Tenancy independence | Wave 0 adds no table, no global unique on a user-visible value, no hand-built Redis or R2 key and no provider-credential read from env beyond what exists. It touches the same services that M2 later rewrites, which is the reason it lands first: smaller M2 diffs. M2-M7 are not prerequisites. | Doc 14 §11 |
| P-TOPO (decided) | **Supported topology: the API is reached same-origin from the page host**, either through Compose and nginx (`/` to the frontend, `/api` to the backend) or through a Vercel rewrite of `/api` to the VPS, with `NEXT_PUBLIC_API_URL=/api`. Auth cookies carry no `domain`, so they are host-only; the Next server can read them only in this topology. Doc 09 and the nginx comment describe the split variant (frontend on Vercel at `<domain>`, API at `api.<domain>`, absolute API URL). In that variant the server-side `(app)` guard never sees the cookies and already redirects every user to login, independent of Wave 0, so it is not a supported production shape and Tasks 1 and 6 do not try to support it. One-line deploy check, recorded in the Task 1 PR: after logging in on production, `curl -sI -b <cookie jar> https://<page-host>/dashboard` returns 200 (not a redirect to `/auth/login`) and the browser's `access_token` cookie host equals the page host. Docs 09 and the nginx comment are corrected in PR 1. | Owner decision 2026-11-20 (delegated), doc 09 vs `docker-compose.yml` |

**Ordering rule (one line):** by defect impact, meaning severity times the number of users affected, with one hard constraint: Task 1 lands before Task 6 because both change `frontend/lib/api.ts` and the `(app)` layout. Task 4 lands before Task 8 because Task 8 reuses the advisory-lock helper Task 4 introduces.

**Out of scope:** F-15 per-request user lookup, F-03, F-21, F-27 and the settings registry (Wave 1); HYBRID, the content gate rewrite and the payment channels (Wave 2); M2-M7.

## Global Constraints

- One task, one PR, branched from fresh `origin/dev` as `type/kebab-scope`, Conventional Commit title (also the PR title), squash-merge with a green `Quality Gate` and review, delete the branch after merge ([11-git-and-naming.md](../../../context/documents/11-git-and-naming.md) §1). No attribution lines in commits or PR bodies, per the standing project rule. Do not commit directly to `dev` or `main`.
- Routes, then controllers, then services; only services import Prisma. Every guard ships with an actor x target Vitest matrix, not-found cases and an explicit check-order test ([04-ai-workflow-rules.md](../../../context/documents/04-ai-workflow-rules.md) §3.4).
- Knob rule: an infrastructure or operator number (JWT lifetime, rate-limit value, refresh-reuse grace, stuck-upload threshold) is a Zod env var with a default in `backend/src/config/env.ts`, added to `backend/.env.example` and `context/documents/10-maintenance-guide.md`. A number that is an owner business choice is not introduced in Wave 0.
- Migrations are expand-only. Task 1 is the only migration; it adds a nullable column and nothing else. The model already carries `organizationId`, its relation and index, so the tenant registry test needs no change (run `backend/src/utils/tenant-integrity.test.ts` and `check-tenant-integrity.ts` to prove it).
- Frontend changes: read `frontend/AGENTS.md` and `node_modules/next/dist/docs/` (`proxy.md`, `headers.md`) first. The Next version differs from older releases (`middleware` is now `proxy`).
- Live verification uses the Compose stack: `docker compose build backend frontend && docker compose up -d`, then `docker compose logs backend --tail 200`. Use a disposable database for anything that mutates data.
- Wave 0 PRs touch only the files listed per task, plus the docs listed in the Definition of Done.

## Branch and PR slicing

| PR | Branch | Conventional Commit and PR title | Closes | Effort | Depends on |
|---|---|---|---|---|---|
| 0 | `docs/audit-register-status-column` | `docs(requirements): add a status column to the findings register` | none (bookkeeping) | S | none |
| 1 | `fix/silent-session-refresh` | `fix(auth): keep sessions alive across access-token expiry` | F-01 | M | PR 0 |
| 2 | `fix/recording-read-scoping` | `fix(video): scope recording reads by role` | F-04, F-06 | S | PR 0 |
| 3 | `fix/attendance-read-scoping` | `fix(attendance): scope attendance reads by role` | F-09 | S | PR 0 |
| 4 | `fix/scan-identity-resolution` | `fix(attendance): make scan identity resolution unambiguous` | F-07 | M | PR 0, collision report run first |
| 5 | `fix/webhook-validation-hardening` | `fix(attendance): harden webhook endpoint validation` | F-54 | S | PR 0 |
| 6 | `fix/rate-limit-keying` | `fix(infra): stop shared addresses exhausting rate limits` | F-02 | M | PR 1 |
| 7 | `fix/prod-bunny-key-check` | `fix(infra)!: require the Bunny keys actually used in production` | F-55 | S | PR 0 |
| 7B (optional) | `feature/bunny-upload-reconciler` | `feat(video): reconcile uploads stuck in UPLOADING` | F-55 follow-up | M | PR 7 |
| 8 | `fix/owner-account-safety` | `fix(users): protect the owner account` | F-28, F-31 | M | PR 4 (helper) |

F-04 and F-06 share one PR because D-ACCESS-8 puts list, metadata and stream behind one access function in one service; they share one access function. Each other finding has its own PR, except F-28 and F-31, which share PR 8.

---

## Task 0: Add a status column to the findings register (PR 0)

**Files:**
- Modify: `context/documents/18-flow-audit-findings-register.md`

**Closes:** nothing; removes merge conflicts for the eight PRs below (nine with 7B), each of which edits its own register row.

- [ ] **Step 1: Add the column once, before any fix merges.** Append a `Status` column to the §1 table, value `Open` for all 127 rows. Allowed values from here on: `Open`, `Partial`, `Fixed (#<pr>, vX.Y.Z)`, `Won't fix (<decision id>)`. Add one sentence under the table defining them. Do not touch the "Fix guidance" bullets under §1.
- [ ] **Step 2: Verify.** The table still renders (no row has a different cell count): limit the check to the §1 table (the §2 second-check table also has rows starting `| F-` with a different shape): `awk '/^## 1\./{f=1;next} /^## /{f=0} f && /^\| F-/' <file> | awk -F'|' '{print NF}' | sort | uniq -c` returns a single value (the second `## ` heading ends the section).

**Tests:** none. **Live:** none. **Migration:** none. **Effort:** S. **Rollback:** revert the PR.

## Task 1: Keep the session alive past access-token expiry (F-01), PR 1

**Why first:** critical; every student and staff member is signed out 15 minutes after login (the browser drops the access cookie when its `Max-Age` equals the JWT lifetime, so the backend never reports `expired` and the silent refresh never fires). The fix pairs the cookie change with a short server-side tolerance for duplicate refreshes and a single client-side refresh in flight; token-handling mechanics are in the private notes.

**Design decision (alternatives rejected):** the access cookie outlives the JWT (the JWT's own `exp` stays authoritative), a Next `proxy.ts` sends navigations that carry an expired access cookie to a small client route that performs one coordinated refresh, and the browser client refreshes once on `expired`. Rejected: refreshing inside `proxy.ts` (needs the refresh cookie path widened from `/api/auth` to `/`, which exposes the 7-day token to every Next route, needs `Set-Cookie` forwarding into the same request, and multiplies the reuse race); extending the JWT lifetime (weakens revocation, which is already coarse until F-15).

**Files:**
- Modify: `backend/src/config/env.ts` (new `REFRESH_REUSE_GRACE_SECONDS`, default 10, range 0-60, 0 disables the tolerance), `backend/.env.example`
- Modify: `backend/prisma/schema.prisma` (`RefreshToken.rotatedAt DateTime?`), Create: `backend/prisma/migrations/<timestamp>_refresh_token_rotated_at/migration.sql` (new)
- Modify: `backend/src/services/auth.service.ts` (`refreshTokens`, `logout`), `backend/src/utils/auth-cookies.ts` (`setAuthCookies`)
- Modify tests: `backend/src/services/auth.service.test.ts`; Create: `backend/src/utils/auth-cookies.test.ts` (new); extend `backend/src/config/env.production-guard.test.ts` or add a small env test for the new variable
- Create: `frontend/proxy.ts` (new), `frontend/lib/session-hint.ts` (new: pure `isAccessTokenExpired(cookieValue, nowSeconds)` that base64url-decodes the payload `exp`, no verification, hint only), `frontend/lib/safe-next.ts` (new: accepts only a relative path starting with a single `/`, rejects `//`, backslashes and absolute URLs, default `/dashboard`), `frontend/app/auth/session/page.tsx` (new, client component)
- Modify: `frontend/lib/api.ts` (single-flight `refresh()` with a module-level promise plus `navigator.locks` when available), `frontend/app/auth/login/page.tsx` (honour `?next=`), `frontend/app/(app)/layout.tsx` (replace the stale comment that says a server render cannot refresh)
- Create tests: `frontend/lib/session-hint.test.ts`, `frontend/lib/safe-next.test.ts`, `frontend/lib/api.test.ts` (new), `frontend/proxy.test.ts` (new), `frontend/app/auth/session/page.test.tsx` (new)

**Behaviour change:**
1. `refreshTokens`: a presented token that is unknown (never issued, or deleted) keeps today's behaviour (revoke all, `REFRESH_TOKEN_REUSED`). A token whose row has `rotatedAt` set is a legitimate duplicate if `now - rotatedAt <= REFRESH_REUSE_GRACE_SECONDS`: issue a fresh pair without revoking anything; older than the grace window is reuse, revoke all. First use rotates by `updateMany({ where: { id, rotatedAt: null }, data: { rotatedAt: now } })` instead of `delete`, so two concurrent first uses cannot both "win" (count 0 means take the grace branch). Rotated rows are deleted opportunistically per user (older than the grace window) inside the same call, and `logout` deletes by hash as today. Deactivated or soft-deleted users still get `ACCOUNT_DEACTIVATED`; signature and expiry checks stay first.
2. `setAuthCookies`: access cookie `maxAge` becomes the refresh lifetime. The backend still rejects an expired JWT and answers `data.expired = true`.
3. `frontend/proxy.ts`: on `GET` requests (not Server Actions, which are POST) whose access cookie is present but expired per `isAccessTokenExpired`, redirect to `/auth/session?next=<safe path and search>`. This covers hard loads and in-app soft navigations (RSC fetches also pass through the proxy; the client router follows the redirect). Prefetches are excluded in the matcher with the `missing` header conditions shown in `proxy.md` (`next-router-prefetch`, `purpose: prefetch`), because Next strips those headers from `request.headers` inside the proxy and they cannot be tested in code. The matcher is a constant object excluding `api`, `_next/static`, `_next/image`, `favicon.ico`, other static files and `auth/`. No cookie means no action (public pages and the layout's own login redirect behave as today).
4. `/auth/session` page: calls the single-flight refresh; success replaces the URL with `safeNext(next)`; a 401 or 403 from refresh calls `POST /auth/logout` (clears the dead cookies so the proxy stops bouncing) and replaces with `/auth/login?next=...`; a 429, 5xx or network error shows a retry state and keeps the cookies (the session may still be valid). It shows a neutral "Signing you back in" state with no flash of protected UI.
5. `api.ts` `refresh()`: one in-flight promise per tab, serialised across tabs with `navigator.locks.request('lms-auth-refresh', ...)`; a caller that waited re-reads nothing and simply retries its request, which now carries the rotated cookie. Behaviour when the refresh fails is unchanged (the ApiError is thrown).
6. Login honours `?next=` via `safeNext` after a successful sign-in.

**Vitest cases:**
- `auth.service.test.ts` `refreshTokens` matrix: token state `{fresh, rotated 1 s ago, rotated at grace boundary, rotated 11 s ago, unknown hash, bad signature, expired JWT}` x user state `{active, soft-deleted, missing}` x grace `{10, 0}`; assert revoke-all fires only for unknown and beyond-grace; two concurrent first uses (second `updateMany` returns count 0) both succeed and neither revokes; opportunistic cleanup removes only that user's old rotated rows; check order: signature before lookup, lookup before user status.
- `auth-cookies.test.ts`: access cookie `maxAge` equals refresh `maxAge`; refresh cookie path stays `/api/auth`; clear removes both.
- Frontend: `isAccessTokenExpired` (valid, expired, malformed, missing `exp`, one second either side of now); `safeNext` (`/classes/1`, `//evil.com`, `/\evil`, `https://evil.com`, empty, encoded variants); `api.ts` single flight (ten parallel 401-expired calls produce exactly one refresh request and ten replays; a failed refresh rejects all; a second tab simulated by a mocked `navigator.locks` serialises); proxy decision table (expired, valid, absent, POST, an RSC soft-navigation GET carrying the `rsc` request header, `/auth/*`, static; prefetch exclusion asserted on the exported matcher config, not in code); session page success and failure paths including the logout call, and the distinction that a 429, 5xx or network error keeps the cookies and shows a retry state while 401 and 403 log out.

**Live verification:** set `JWT_ACCESS_EXPIRES_IN=1m` in the local compose env, restart backend. (1) Log in as a student, wait 70 seconds, reload a deep link such as a class page: you land on that page, not on login; the network log shows one redirect through `/auth/session` and one `POST /api/auth/refresh`. (2) Open three tabs, wait past expiry, reload all three together: all stay signed in and `docker compose logs backend` shows no `Refresh token reuse detected`. (3) Delete the `refresh_token` cookie, wait past expiry, reload: you reach login with the page you wanted in `?next=`, and the second reload does not bounce again. (4) Soft navigation: stay on a page past expiry without reloading, then click an in-app link: the app lands on the target page after a brief "Signing you back in" step, with no error overlay and no broken payload, and one refresh request. (5) Notification bell: after a silent refresh the stream is re-established on the next mount (note in the PR if the SSE connection needs a reconnect hook; add it only if the bell goes stale). (6) Set `REFRESH_REUSE_GRACE_SECONDS=0` and confirm the previous strict behaviour.

**Migration steps:** expand only: `ALTER TABLE "RefreshToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);`. No backfill (null means not rotated). No contract step. Prove fresh deploy and upgrade on a copy of the dev database; zero drift.

**Effort:** M (3 days including live checks). **Rollback:** revert the PR. Before reverting the backend code run `DELETE FROM "RefreshToken" WHERE "rotatedAt" IS NOT NULL;`, because the previous code would treat a rotated row as a live token. The column can stay. Frontend revert alone is safe (cookie lifetime change is inert without the proxy: the browser then sends an expired JWT and the existing client refresh path handles it for SPA calls).

## Task 2: Scope recording reads by role (F-04, F-06), PR 2

**Defect class (doc 18):** recording stream, metadata and list reads are not restricted to enrolled students, the owning teacher and the owner. Fix: one access function used by the list, metadata and stream paths in the video service, backed by route-level role guards, with front-desk and marker accounts refused at both layers. Mechanism and exact changes: private notes, Task T2.

**Files (modules only):** video routes, video controller (audit write and comments), video service and its test file, class-session service (the `hasRecording` boolean), the class page and the recording page under `frontend/app/(app)/classes/[classId]/`, `frontend/lib/types.ts`. New files: none.

**Behaviour change:** readers are student (enrolled; payment rules unchanged in Wave 0), owning teacher and owner; everyone else gets 403 `FORBIDDEN_ROLE` at the route and in the service. Non-student stream opens write an audit row (always on; the toggle arrives with the settings registry). Staff see a `hasRecording` flag on sessions, and the class page shows them a plain "Recordings are available to students and the class teacher" message instead of the enrollment-lock state. Student-facing responses carry only the fields a student needs. Stale comments claiming stream URLs are IP-bound are corrected (they are token-authenticated with a 4-hour TTL and not IP-bound). The recording window, grace and alumni rules (D-ACCESS-9, D-MONEY-1, D-STRUCTURE-6) are not part of this PR.

**Vitest cases:** actor x role matrix (owner, owning teacher, other teacher, front desk, marker, student enrolled and paid, student enrolled and unpaid, student not enrolled) x (list, metadata, stream) with the expected status and error code; not-found cases (video, course) per actor; check ordering (role is checked before existence so refused roles learn nothing; enrollment is checked before payment); response-shape test for student-facing payloads; audit-row test (written for teacher and owner stream opens, not for students).

**Live verification:** with the demo accounts, check the role and enrollment matrix per the private notes; an unpaid enrolled student can list but not stream (402); a paid student streams as before; the owning teacher streams and an audit row appears in the audit screen; another teacher gets 403. Class page renders correctly for each role.

**Migration:** none. **Effort:** S (1.5 days with the frontend). **Rollback:** revert the PR; the audit rows already written remain valid history.

## Task 3: Scope attendance reads by role (F-09), PR 3

**Defect class (doc 18):** attendance read scoping needs tightening: Fix: scope the read per role and return only the fields each role needs. Mechanism and exact changes: private notes, Task T3.

**Files (modules only):** attendance routes, controller, service and its test file. New files: none.

**Behaviour change:** as above; a non-student or unknown target returns the same not-found; responses return only the identity fields each role needs. The session and course attendance reads are unchanged.

**Vitest cases:** actor (owner, front desk, owning teacher, other teacher, marker, student self, student other) x target (student, staff id, soft-deleted student, missing id), asserting the filter applied to the query for teachers, the response shape per role, and refusal ordering (role gate, then target lookup, then scope filter, with no database read for refused roles).

**Live verification:** each demo role against its own and others' histories; the front-desk attendance page and the student's own attendance page still render.

**Migration:** none. **Effort:** S (1 day). **Rollback:** revert the PR.

## Task 4: Make scan identity resolution unambiguous (F-07), PR 4

**Defect class (doc 18):** scan identity resolution can be ambiguous in some cases; a scan code must identify exactly one student whichever kind of code it is. Fix: one resolver used by the entrance scan and the desk lookup that never picks a winner among several students, write-time uniqueness for new and changed codes across both code kinds under a lock, a request-context validation, and an operator report of existing collisions produced before the change deploys. Mechanism and exact changes: private notes, Task T4. D-ACCESS-4's random QR scheme, reissue endpoint and scanner photo are Wave 1.

**Files:** attendance service (scan path), user service (resolver, code writers) and its test file, the auth service's card-issue step, `backend/src/services/attendance.service.test.ts`. New files: a scan-identity service and its test (name in the private notes), `backend/src/utils/advisory-lock.ts` (new: `withAdvisoryLock(tx, namespace, organizationId, key)`, a namespaced key so it cannot collide with the existing inline per-id locks; Wave 1 reuses it), and a read-only operator report script under `backend/src/scripts/` (path and output rules in the private notes; output is never committed).

**Behaviour change:** ambiguity returns a distinct error and the scanner and desk fall back to searching by index number or name; a code unavailable at write time returns a generic "code unavailable" message that does not name the other holder; write-time uniqueness applies to every code writer; behaviour for deactivated and non-student targets is unchanged.

**Vitest cases:** resolver matrix over the combinations of code kinds, institutes and student states (including zero, one and several holders, deactivated and non-student holders); write-path matrix for every code writer (every code writer, including concurrent writers with the lock mocked); privileged-target guard still fires before the uniqueness check; regression of the existing institute-aware scan tests; ambiguity and unavailable-code cases.

**Live verification (disposable stack):** seed an artificial collision and confirm both the scanner and the desk lookup show the ambiguity message; run the report and confirm the rows are listed; confirm normal scans (LMS card, institute card) are unchanged.

**Deploy ordering (hard):** run the report against production first and have the front desk resolve every listed collision. If the report lists many existing collisions, stop and ask the owner for a one-line confirmation of the alternative (narrow candidates by the scanning branch) before enforcing organization-wide uniqueness. This is the only point in Wave 0 where a decision may reopen.

**Migration:** none (no new unique constraint before M3). **Effort:** M (2.5 days). **Rollback:** revert the PR; no data changes were made, only reads and rejected writes.

## Task 5: Harden the Zoom webhook endpoint validation (F-54), PR 5

**Defect class (doc 18):** the webhook's endpoint-validation handling needs hardening; rate-limit the route. Do this before any further Zoom webhook work. Mechanism and exact changes: private notes, Task T5.

**Files (modules only):** the Zoom webhook middleware (new test file next to it), the attendance controller, the attendance routes, `backend/src/config/rate-limiter.ts` (a limiter for the route), `backend/src/config/env.ts` (limit as an env knob with a default), `backend/.env.example`.

**Behaviour change:** validation requests are accepted under stricter checks; the route is rate-limited; every other event keeps today's signature and timestamp rules.

**Vitest cases:** accepted and rejected validation inputs (valid, empty, malformed), signature present-but-wrong, valid signed event, stale timestamp, missing secret, limiter wiring (the full test list is in the private notes, Task T5).

**Live verification:** re-run the Zoom staging app's endpoint validation after deploy (Zoom validates only on demand), then confirm one real participant event still records attendance and a forged or unsigned event is rejected. Production deploy needs the staging check first.

**Migration:** none. **Effort:** S (0.5 day plus the staging check). **Rollback:** revert the PR; if the provider rejects validation after deploy, revert before changing anything else.

## Task 6: Stop shared addresses exhausting rate limits (F-02), PR 6

**Defect (doc 18):** server-rendered requests reach the API from one address, and users behind one campus or carrier address share the 10-per-minute login limit; any `/auth/me` failure on a page then looks like a logout (26 `(app)` pages and the layout each redirect to login on any error). Capacity estimate, not an observed outage.

**Files:**
- Modify: `backend/src/config/rate-limiter.ts` (`createLimiter` accepts a `keyGenerator`; new limiters), `backend/src/config/env.ts` (`RATE_LIMIT_GLOBAL_ANON_MAX` 100, `RATE_LIMIT_GLOBAL_USER_MAX` 200, `RATE_LIMIT_LOGIN_ACCOUNT_MAX` 10, `RATE_LIMIT_LOGIN_IP_MAX` 60, `RATE_LIMIT_REGISTER_IP_MAX` 30, `RATE_LIMIT_REFRESH_MAX` 20; all per one-minute window; existing `RATE_LIMIT_*` constants in `backend/src/utils/constants.ts` become the defaults' source), `backend/.env.example`
- Modify: `backend/src/index.ts` (limiter wiring, `/api/auth/refresh` skipped by the global limiter), `backend/src/routes/auth.routes.ts` (`createAuthRouter` takes named limiters)
- Create: `backend/src/config/rate-limiter.test.ts` (new)
- Modify: `frontend/lib/api.ts` (server branch forwards the client address), `frontend/app/(app)/layout.tsx`
- Create: `frontend/lib/session.ts` (new: `requireUser(cookie)` wrapped in React `cache()` so layout and page share one `/auth/me` per render), `frontend/app/error.tsx` (new: an `error.tsx` does not wrap the layout of its own segment, so failures raised by `app/(app)/layout.tsx` need the boundary one level up; verify against `error.md` and, if the root layout itself is affected, add `app/global-error.tsx`, which must render its own `<html>` and `<body>`), `frontend/app/(app)/error.tsx` (new: retry state for failures raised by pages), `frontend/lib/session.test.ts` (new)
- Modify: the 26 pages under `frontend/app/(app)/**/page.tsx` that contain `redirect("/auth/login")` (list with `grep -rln 'redirect("/auth/login")' frontend/app`): replace each local try/catch with `await requireUser(cookie)` (the recording page under `classes/[classId]/videos/[videoId]/` is one of them)

**Behaviour change:**
0. `backend/package.json` has `express-rate-limit` 8.5.x, which validates custom key generators: the address fallback must be `ipKeyGenerator(req.ip)` (imported from the package) so IPv6 clients are bucketed by subnet and the limiter does not fail its boot-time validation. Apply it to every address-based key below.
1. Global limiter key: `u:<userId>` when the access cookie verifies, else `ip:<req.ip>`. An expired or invalid token falls back to the address key. Authenticated traffic from SSR therefore never shares a bucket across users, in any topology.
2. Login limited per normalised email plus address (default 10/min) and separately per address (default 60/min, so a campus is not locked out by one wrong password); register has its own bucket; refresh has its own limiter keyed by the verified refresh token's user (anonymous fallback by address) and is skipped by the global one, so silent refreshes (Task 1) cannot consume the shared bucket.
3. Server-rendered requests forward the client address as `X-Forwarded-For` taken from nginx's `X-Real-IP` (nginx overwrites it, so a browser cannot spoof it), and only when `INTERNAL_API_URL` is set, i.e. the direct container-to-container path that browsers cannot reach (backend port 5000 is not published in Compose). Public server-rendered pages (`/courses`, `/teachers`) thereby stop sharing the server's address.
4. `requireUser` redirects to login only on 401. 429, 5xx and network errors throw to the `error.tsx` boundaries, which show a retry state instead of logging the user out (a layout failure is caught by the root `app/error.tsx`, a page failure by `app/(app)/error.tsx`). Expired sessions are handled by the Task 1 proxy before pages run.
5. Rate-limit numbers move to the settings registry only if the owner later wants to tune them; they are operator knobs and stay env vars.

**Vitest cases:** `rate-limiter.test.ts`: key generator for valid access token, expired token, garbage, missing cookie; two users behind one address get separate buckets; login key normalises case and whitespace of the email; register and login use different prefixes; global limiter skips only the refresh path; limiter built with and without Redis. `session.test.ts`: 401 redirects, 403 propagates, 429/502/network throw the retry error, success returns the user, two calls with the same cookie in one render produce one request.

**Client address per topology:** the limiter keys on the address the backend sees, so determine it for each supported topology before relying on the per-address caps: through nginx on the VPS it is the `X-Real-IP` nginx sets (behind a CDN or proxy in front of nginx, configure nginx `real_ip` for that proxy so the end user, not the edge address, is used); through a Vercel rewrite of `/api` every browser request arrives from the rewrite layer, so use the forwarded client header Vercel supplies and trust it only from that source. Record the chosen setting per topology in doc 10 and verify it with one request per topology after deploy. Also exempt the refresh path from the global limiter in PR 1 if PR 6 cannot ship in the same release.

**Live verification:** set `RATE_LIMIT_GLOBAL_ANON_MAX=5` locally and hammer a public endpoint from one address (429 after five), while two logged-in users from the same address both keep working; login attempts for different emails from one address succeed until the per-address cap; stop the backend briefly and reload an `(app)` page (retry screen, not login, and not Next's default error page); trigger a page-level failure and confirm the `(app)` boundary shows; confirm in backend logs that a server-rendered request records the browser's address, not the frontend container's.

**Migration:** none. **Effort:** M (3 days; the 27-page edit is mechanical). **Rollback:** revert the PR; limits return to the previous values because the constants are unchanged.

## Task 7: Require the Bunny keys actually used in production (F-55), PR 7

**Files:**
- Modify: `backend/src/config/env.ts` (production missing-list: add `BUNNY_READ_ONLY_API_KEY` and `BUNNY_TOKEN_KEY`, drop `BUNNY_WEBHOOK_SECRET`, which nothing reads; keep the field optional in the schema so existing env files still parse)
- Modify: `backend/src/config/env.production-guard.test.ts`
- Modify: `backend/src/schemas/video.schema.ts` (stale comment about a shared-secret query parameter), `backend/.env.example`, `context/frontend/06-frontend-roadmap.md` (the stale `BUNNY_WEBHOOK_SECRET` line)
- Check: `docker-compose.yml` backend and worker services both load `backend/.env` (they do; the worker imports `env` through its shared modules and will also refuse to start if a key is missing)

**Behaviour change:** a production boot without the read-only API key or the token key exits with the missing list, instead of starting and then answering 401 to every Bunny webhook (uploads stay `UPLOADING`) and 503 at stream time.

**Vitest cases:** extend the guard test with a complete production fixture helper: each of the two keys missing alone and together (exit 1 and listed), both present with no legacy secret (boots), local-driver and presign-endpoint checks still run first, non-production never requires them.

**Live verification:** `docker compose up` with `NODE_ENV=production` and each key removed in turn (backend and worker both stop with the listed names); then with both set it boots. Do this on the local stack with its production-like env, not on the live VPS.

**Migration:** none. **Effort:** S (0.5 day). **Rollback:** revert the PR. **Release-blocking note:** set both keys on the VPS before deploying, or the backend and worker will not boot.

### Task 7B (optional, own PR): reconcile uploads stuck in UPLOADING

**Files:** `backend/src/utils/bunny.ts` (new `getBunnyVideoStatus(guid)` using the management API and the existing status mapper), `backend/src/services/video.service.ts` (new `reconcileStuckUploads`), `backend/src/jobs/` (new queue file following `notification.queue.ts`), `backend/src/worker.ts` (register the repeatable job), `backend/src/config/env.ts` (`BUNNY_STUCK_UPLOAD_MINUTES`, default 30), tests beside each. Behaviour: a repeatable BullMQ job (no `setTimeout`) polls rows `UPLOADING` longer than the threshold and applies the same idempotent status update the webhook uses. Tests: stuck vs fresh rows, provider says ready, failed, unknown GUID, provider error (row untouched, job retried), idempotent second run. Effort M; rollback by reverting and removing the repeatable job (`queue.removeRepeatable`). F-55 is marked Fixed when Task 7 merges; this follow-up is tracked in the register notes and is not required to ship Wave 0.

## Task 8: Protect the owner account (F-28, F-31 slice of D-IDENTITY-5), PR 8

**Why Wave 0:** the container entrypoint currently runs the admin seed on every start, and the seed upserts the owner's password, role, setup flag and active state from environment values, so every restart can silently reset the owner. Making the seed create-only removes the only recovery path, so the recovery command ships in the same PR.

**Files:**
- Modify: `backend/src/scripts/seed-admin.ts` (create-only), `backend/docker-entrypoint.sh` (messages only; it still calls the seed when the env pair is present)
- Create: `backend/src/scripts/owner-lib.ts` (new: pure functions over an injected Prisma client, unit-tested), `backend/src/scripts/owner-add.ts` (new), `backend/src/scripts/owner-reset-password.ts` (new), `backend/src/scripts/owner-lib.test.ts` (new); Modify: `backend/package.json` (`owner:add`, `owner:reset-password`)
- Modify: `backend/src/services/user.service.ts` (`updateRole` gains the actor; `updateStatus` gains the actor id; shared `assertOwnerInvariants`), `backend/src/controllers/user.controller.ts` (pass `req.user!`), `backend/src/schemas/user.schema.ts` (`updateRoleSchema` no longer accepts `SUPER_ADMIN`), `backend/src/services/user.service.test.ts`, `backend/src/utils/constants.ts` (audit action names `OWNER_ADDED`, `OWNER_PASSWORD_RESET`)
- Uses: `withAdvisoryLock` from PR 4

**Behaviour change:**
1. Inside one transaction that first takes a per-organization advisory lock (namespace `owner`): the API can never assign `SUPER_ADMIN`; nobody changes the role or active status of their own account (403); the last active `SUPER_ADMIN` can never be demoted or deactivated (409 `LAST_OWNER`). A second `SUPER_ADMIN` may deactivate the other, never themselves. Check order: the privileged-target guard (existing for status and card changes; added to `updateRole`, which has no actor parameter today, so its signature gains one), then self-target, then last-owner; the route-level role gate is tested separately. Deactivation and role change also revoke the target's refresh tokens (`revokeAllRefreshTokens`); per-request revocation of live access tokens stays F-15, Wave 1.
2. Seed is create-only: if any `SUPER_ADMIN` row exists (active or not) it does nothing and says so; if the configured email already belongs to a non-owner it refuses to promote it and logs a warning; otherwise it creates the owner. It never updates an existing row.
3. `npm run owner:reset-password` (run in the container as `docker compose exec -it backend node dist/scripts/owner-reset-password.js --email <address>`): prompts for the new password with no echo, or with `--generate` prints a generated password once on the operator's terminal; never accepts a password as an argument; sets the password, clears the soft-delete flag only with an explicit `--reactivate`, deletes the user's refresh tokens, and writes an audit row (the audit table requires an actor, so the actor is the target owner with `via: operator-cli` in the metadata). `npm run owner:add` creates a further owner the same way with no cap in Wave 0 (every owner action is audited and CLI-only); the configurable `identity.maxOwners` (D-IDENTITY-5 default 2) and the API step-up are deliberately deferred to Wave 1, because Wave 0 adds no business-number settings before the settings registry exists; doc 19 records this deferral. Secrets never appear in shell history, logs or audit metadata.

**Vitest cases:** `user.service.test.ts`: actor (owner, other owner, front desk) x target (student, teacher, front desk, other owner, self, last owner) x operation (role change to each allowed role, deactivate, reactivate) with expected status and code; schema rejects `SUPER_ADMIN`; two concurrent demotions with the lock mocked (the second sees one owner left and gets `LAST_OWNER`); the privileged-target guard still wins over the self check for a front-desk actor. `owner-lib.test.ts`: seed with no owner, with an existing owner (no write), with the env email held by a non-owner (no promotion), with a deactivated sole owner (does nothing, points to the reset command); reset (token revocation, audit row, reactivation only on flag, no password in the logged payload); add (creates an owner with a hashed password and an audit row; refuses an existing email); the `updateRole` actor guard runs at service level for every actor and target in the matrix; the entrypoint continues to start the backend when the create-only seed skips or refuses.

**Live verification:** restart the backend three times after changing the owner password in the UI: the password stays changed. Run the reset command and sign in with the new password; old sessions are gone. Try the self-demotion, self-deactivation and last-owner cases through the Users screen and `curl`; all refused. Confirm a front-desk user still cannot touch an owner.

**Migration:** none. **Effort:** M (2 days). **Rollback:** revert the PR; run `owner:reset-password` first if the reverted seed would reset the owner on the next start, or unset `LMS_ADMIN_EMAIL` / `LMS_ADMIN_PASSWORD` before restarting.

---

## Combined regression checklist (run on the Compose stack after the last Wave 0 PR is on `dev`, then again on the release candidate)

- [ ] **Session:** with `JWT_ACCESS_EXPIRES_IN=1m`, a student stays signed in across three tabs and a deep-link reload; no `Refresh token reuse detected` in the backend log; a deleted refresh cookie lands on login with `?next=` and does not loop; logout from one tab signs the others out on their next call.
- [ ] **Recordings:** the role x action matrix from Task 2 on live accounts; the owning teacher can still upload, edit, delete and stream; an enrolled paid student's playback and the player watermark work; class page for every role.
- [ ] **Attendance:** front desk scans an LMS card and an institute card (unchanged); ambiguous code shows the search fallback; teacher session and course attendance views unchanged; teacher and student per-student history scoped; marker refused.
- [ ] **Webhooks:** Zoom staging re-validation passes; a real participant join records attendance; an unsigned or forged event is rejected; Bunny webhook still flips an upload to `READY` with both keys set.
- [ ] **Rate limits:** two users behind one address are independent; login per-account and per-address limits as designed; public server-rendered pages stay reachable under a scripted burst; a backend outage shows the retry screen, not login.
- [ ] **Production boot:** backend and worker start with the two Bunny keys and refuse to start without them.
- [ ] **Owner:** three consecutive restarts keep the owner password; reset command works; self and last-owner protections hold.
- [ ] **Unchanged flows (smoke):** register and login, enroll, cash collection at the desk, PayHere sandbox payment, exam sitting, marker grading, notification bell.
- [ ] **Quality gates on each PR and on `dev`:** `cd backend && npm run lint && npx tsc --noEmit && npm test`; `cd frontend && npm run lint && npm run build && npm test`; `backend/src/scripts/check-tenant-integrity.ts` and the tenant registry test pass; Prisma migration deploys on a fresh database and on a copy of the current one with zero drift.

## Release note (paste into the next `dev` to `main` release PR; public text)

> **Wave 0: stability and access hardening.**
> - **Sessions now stay signed in.** Students and staff are no longer signed out 15 minutes after login; the app renews the session in the background and returns you to the page you were on. Opening several tabs no longer risks signing out every device. One additive database column (`RefreshToken.rotatedAt`) ships with this release; `REFRESH_REUSE_GRACE_SECONDS` (default 10) is a new optional setting.
> - **Access hardening.** Recording access, attendance history reads, scan-identity handling and the live-class webhook endpoint were tightened. Access to recordings, attendance history and scan-identity handling was tightened to the intended roles. The front desk may see a "code unavailable" or "ambiguous code" message at the door in rare cases and should search by index number.
> - **Fewer false "too many requests" errors.** Rate limits now count each signed-in user separately, so a campus or shared network no longer exhausts the limit for everyone; a temporary backend error now shows a retry screen instead of logging you out. New optional settings: `RATE_LIMIT_*`.
> - **Owner account protection.** The owner password is no longer reset on server restart; the last owner cannot be demoted or deactivated, and nobody can change their own role or status. Recovery commands: `npm run owner:reset-password` and `npm run owner:add` (see the maintenance guide).
> - **Operator actions before deploying:** (1) set `BUNNY_READ_ONLY_API_KEY` and `BUNNY_TOKEN_KEY` in the backend environment (the backend and worker will not start in production without them; `BUNNY_WEBHOOK_SECRET` is no longer required); (2) run the scan-identity report on production and resolve what it lists before deploying the identity change (see the maintenance guide); (3) after deploy, re-validate the Zoom webhook endpoint in the Zoom app and confirm a test join records attendance.
> - **Rollback:** each change is a separate revertable PR; before reverting the session change run `DELETE FROM "RefreshToken" WHERE "rotatedAt" IS NOT NULL;`.

## Definition of Done

Wave 0 is done when all of the following hold:

1. PRs 0-8 are squash-merged into `dev` through green `Quality Gate` runs and review, each branch deleted, no attribution lines anywhere; Task 7B is either merged or recorded as a tracked follow-up.
2. The combined regression checklist above passes on a Compose stack built from `dev`, with the results recorded in the release PR description.
3. Every guard added has its actor x target matrix, not-found cases and check-order test in Vitest; new env variables are in `backend/.env.example` and the maintenance guide.
4. No private detail leaked: `git grep` of the public repo for the private notes' mechanism terms returns nothing outside this plan's defect-class wording, and no collision report or reproduction output is committed.
5. The P-TOPO deploy check passed and is recorded in the Task 1 PR; the Task 4 collision report was run before Task 4 deployed.
6. The docs below are updated in the same PR as the change that makes them true (not afterwards).

### Docs to update, per PR

| PR | Docs (same PR) |
|---|---|
| 0 | `18-flow-audit-findings-register.md` (Status column). |
| 1 | `context/documents/09-cost-and-hosting.md` (production topology: same-origin `/api`; the split-host variant is unsupported with the server-side guard) the matching comments in `nginx/nginx.conf` and `docker-compose.yml` (both say the frontend ships to Vercel and the service is removed for production), doc 09's later "production keeps the split" and "Reverting for production" sections, and the `trust proxy` hop count (nginx comment says `true`, `backend/src/index.ts` sets `1`), `context/frontend/04-api-integration.md` (§6 silent refresh, proxy, single flight), `context/api_endpoints/auth.endpoints.md` (cookie lifetime, refresh tolerance, `expired` semantics), `context/documents/02-architecture.md` (auth section), `context/documents/08-database-design.md` (`RefreshToken.rotatedAt`), `context/documents/10-maintenance-guide.md` (`REFRESH_REUSE_GRACE_SECONDS`, `JWT_*` guidance). |
| 2 | `context/api_endpoints/video.endpoints.md`, `context/api_endpoints/classes.endpoints.md` (`hasRecording`), `context/documents/02-architecture.md` (content protection; recordings are not IP-bound), `CLAUDE.md` (remove F-04 from the "Known gaps" sentence; leave F-05 and F-23), `17-roles-permissions-and-flows.md` (§5 recording rows, §9 item 12 recordings half decided). |
| 3 | `context/api_endpoints/attendance.endpoints.md`, `17-...` (§5 attendance rows). |
| 4 | `context/api_endpoints/attendance.endpoints.md`, `payments.endpoints.md`, `account-setup.endpoints.md`, `users.endpoints.md`, `context/documents/01-project-overview.md` (§4.1), `context/documents/10-maintenance-guide.md` (collision report runbook, without any real data), `14-multi-tenancy-readiness.md` §13 item 2 (partial: uniqueness and resolver decided, random scheme in Wave 1), `15-requirements-traceability.md` (R-STU-02, R-ATT-01), `17-...` (§9 item 12 scan half decided). |
| 5 | `context/api_endpoints/attendance.endpoints.md`, `context/documents/10-maintenance-guide.md` (re-validate the Zoom endpoint after changes). |
| 6 | `context/documents/02-architecture.md` (rate limiting, keying, SSR address forwarding), `context/api_endpoints/auth.endpoints.md`, `context/documents/10-maintenance-guide.md` (`RATE_LIMIT_*`). |
| 7 | `context/api_endpoints/video.endpoints.md`, `context/documents/16-local-development.md`, `context/documents/10-maintenance-guide.md` (required production keys), `context/documents/14-multi-tenancy-readiness.md` (the Bunny credential row still lists `BUNNY_WEBHOOK_SECRET`), `context/frontend/06-frontend-roadmap.md` (stale line). |
| 8 | `context/documents/10-maintenance-guide.md` (owner runbook: add, reset, seed behaviour), `context/api_endpoints/users.endpoints.md`, `context/documents/01-project-overview.md` (owners), `17-...` (§2), `CLAUDE.md` (one line: owner invariants and operator-only owner recovery). |
| Every PR | `18-flow-audit-findings-register.md` Status cell for its findings; `06-progress-tracker.md` (tick the Wave 0 bullet and add a dated entry); `13-product-roadmap.md` (P0.5 row 0 status); `15-requirements-traceability.md` (status of every row whose notes cite the finding); `17-roles-permissions-and-flows.md` §7 (Wave 0 progress). |

## Plan Self-Review

- **Coverage:** F-01, F-02, F-04, F-06, F-07, F-09, F-54, F-55 each map to one task; F-28 and F-31 are added because the sequencing places them in Wave 0.
- **Precondition:** P-TOPO is decided (same-origin `/api`); doc 09's split-host description contradicts it and is corrected in PR 1.
- **Findings that changed on contact with the code:** the register's F-01 fix needed a refresh-tolerance companion (private notes). F-02 reaches 28 pages, not just the layout. F-55's poller is separable from its boot check. F-07's organization-wide uniqueness may conflict with existing data; the collision report decides.
- **Placeholders:** none; every path was checked with `grep` or `ls` on 2026-11-20. Paths marked "new" do not exist yet.

## Notes added after review (2026-11-20)

- **Release coupling.** PR 1 (session refresh) and PR 6 (rate-limit keying) ship in the same release; the refresh path must never share the global per-address bucket with page traffic.
- **Size rule.** Tasks 1 and 6 touch more than five files or two domains (doc 11 section 1). Each is still one PR because the pieces are not independently safe; the PR description lists the slices.
- **Gate scope.** In Wave 0 the stream gate stays as today (current month, payment rules unchanged); mode eligibility and the recording window arrive with the single content gate in Wave 2 (doc 19 D-MONEY-1, D-ACCESS-9). Doc 19 D-ACCESS-8 and D-MONEY-1 agree: list and metadata are visible to every enrolled student; stream and token issue are payment-gated.
- **Doc updates owed by PR 4 and PR 8.** `withAdvisoryLock` lands in Wave 0 (PR 4), as doc 19 section 4 states; doc 18 F-28 names the operator command `owner:reset-password`.
