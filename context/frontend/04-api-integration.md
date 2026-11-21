# 04 — API Integration

> How the frontend talks to the Express/Prisma backend. The contract for every endpoint lives in
> `context/api_endpoints/*.endpoints.md` — this doc is the **client-side plumbing**: base URL, cookie auth,
> the `api` wrapper, response/error shapes, and the role model.

---

## 1. Base URL & environment

- All backend routes are under **`/api`** (e.g. `http://localhost:5000/api`). Base URL comes from
  `NEXT_PUBLIC_API_URL` (Doc 00 §5).
- Access it through a typed helper, never `process.env` scattered around:

```ts
// lib/env.ts
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
```

---

## 2. Authentication = HTTP-only cookies

The backend issues two **HTTP-only** cookies on login/register (see `auth.endpoints.md`):

| Cookie | Scope | Used for |
|---|---|---|
| `access_token` | path `/`, lives as long as the refresh cookie (7 days) | Every protected request. The JWT inside still expires after 15 minutes; the cookie outlives it on purpose so the backend can answer `expired` instead of seeing an anonymous request. |
| `refresh_token` | path `/api/auth` | Only `POST /api/auth/refresh`. |

Consequences for the frontend:
- These cookies are **not readable by JS** (that's the point — XSS-safe). We never store tokens in
  `localStorage`. "Am I logged in?" is answered by calling **`GET /api/auth/me`**, not by inspecting a token.
- **Browser requests** must send `credentials: 'include'` or the cookie won't be attached.
- **Server-side requests** (from Server Components / route handlers) don't automatically carry the browser's
  cookies — you must **forward them**: read `await cookies()` and pass a `Cookie` header to the backend.
- On a `401` with `{ data: { expired: true } }`, call `POST /api/auth/refresh` once, then retry the original
  request (browser only; see §3 and §6 for how a server render is covered). If refresh fails, the session is over → redirect to `/auth/login`.

---

## 3. The `api` client (`lib/api.ts`)

**All backend calls go through one wrapper.** It centralizes base URL, credentials, cookie forwarding (server),
JSON handling, error normalization, and 401→refresh→retry. Never call the backend with a raw `fetch`.

Target shape (implement in `lib/api.ts`):

```ts
// lib/api.ts
import { API_URL } from './env'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,       // service error code, e.g. "NOT_ENROLLED"
    public fields?: { field: string; message: string }[], // validation errors
  ) { super(message) }
}

type Options = RequestInit & { cookie?: string } // `cookie` = forwarded header for server calls

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    credentials: 'include',                 // send cookies from the browser
    headers: {
      'Content-Type': 'application/json',
      ...(opts.cookie ? { Cookie: opts.cookie } : {}), // forward cookies on the server
      ...opts.headers,
    },
  })

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.message ?? 'Request failed',
      body?.code,
      Array.isArray(body?.data) ? body.data : undefined,
    )
  }
  return body as T
}

export const api = {
  get:  <T>(p: string, o?: Options) => request<T>(p, { ...o, method: 'GET' }),
  post: <T>(p: string, data?: unknown, o?: Options) => request<T>(p, { ...o, method: 'POST', body: JSON.stringify(data) }),
  patch:<T>(p: string, data?: unknown, o?: Options) => request<T>(p, { ...o, method: 'PATCH', body: JSON.stringify(data) }),
  del:  <T>(p: string, o?: Options) => request<T>(p, { ...o, method: 'DELETE' }),
}
```

**Server-side usage** — forward cookies so the backend sees the session:

```tsx
import { cookies } from 'next/headers'
import { api } from '@/lib/api'

export default async function Page() {
  const cookie = (await cookies()).toString()
  const { data } = await api.get<{ data: Subject[] }>('/subjects', { cookie })
  return <SubjectList subjects={data} />
}
```

**Client-side usage** (mutations, interactive forms) — cookies ride along via `credentials: 'include'`:

```tsx
'use client'
await api.post('/submissions', { examId, answers })
```

> `lib/api.ts` already does refresh-and-retry for `401 + expired` in the browser. The refresh is **single flight**: parallel
> callers in one tab share one `POST /auth/refresh`, and `navigator.locks` (`lms-auth-refresh`) serialises it across tabs.
> `refreshSession()` returns `{ ok: true }` or `{ ok: false, status }` (`status` is `null` for a network error). The request is
> aborted after 10 s so a stalled connection cannot hold the cross-tab lock, and a network error or 5xx is retried once after
> 1 s (inside the server's duplicate-tolerance window, so a lost response does not look like token reuse); 401, 403 and 429 are not retried.

---

## 4. Response & error shapes (uniform across the API)

Every endpoint returns one of these envelopes (confirmed in the endpoint docs):

**Success (object):**
```json
{ "status": "success", "data": { }, "message": "..." }
```
**Success (list):**
```json
{ "status": "success", "data": [ ], "count": 0, "page": 1, "limit": 20 }
```
**Validation error (400):**
```json
{ "status": "error", "message": "Validation failed", "data": [ { "field": "email", "message": "Invalid email address" } ] }
```
**Service error (AppError):**
```json
{ "status": "error", "message": "Not enrolled.", "code": "NOT_ENROLLED" }
```
**Auth-expired (401):**
```json
{ "status": "error", "message": "Token expired. Please refresh.", "data": { "expired": true } }
```

Handling rules:
- Read payloads from **`body.data`**; lists also carry `count` (+ `page`/`limit` when paginated).
- On error, surface `body.message`. When `code` is present, you can map specific codes to friendlier UI
  (e.g. `PAYMENT_REQUIRED` → "Pay this month's fee to watch"). When `data` is a `field[]` array, map each to its
  form field via react-hook-form's `setError`.
- Treat `body.data.expired === true` on a 401 as "refresh then retry", not "logged out".

---

## 5. Roles & authorization

Role enum (backend, current): **`SUPER_ADMIN`, `TEACHER`, `ADMIN`, `MARKER`, `STUDENT`**.

```ts
// lib/types.ts
export type Role = 'SUPER_ADMIN' | 'TEACHER' | 'ADMIN' | 'MARKER' | 'STUDENT'
```

- The **backend is the source of truth** for authorization — every protected route enforces roles server-side.
  The frontend's role checks are **UX only** (hide buttons/links the user can't use); never rely on them for security.
- Reading older endpoint tables: some pre-date the role rename — `ADMIN` there means **`SUPER_ADMIN`**, `STAFF`
  means **`ADMIN`**, and content routes now also allow the owning **`TEACHER`**. Each updated endpoint doc has a
  "Roles updated (2026-07-09)" note; trust that note.
- Content gates a student can hit (from `video`/`exams`/`submissions` docs): `NOT_ENROLLED` (403),
  `PAYMENT_REQUIRED` (402), `EXAM_NOT_STARTED`/`EXAM_ENDED` (400), `ALREADY_SUBMITTED` (409). Design the UI to
  anticipate these (enroll CTA, pay CTA, exam-window messaging) rather than only reacting to the error.

---

## 6. Auth context (client)

Expose the current user app-wide via a small provider (Doc 02 §4 pattern). Fetch `/auth/me` once, share it.

```tsx
// lib/hooks/useAuth.tsx  ("use client")
// AuthProvider fetches GET /auth/me, holds { user, loading, refresh(), logout() },
// exposes useAuth(). Mount <AuthProvider> in app/layout.tsx around {children}.
// logout() → POST /auth/logout, then clear user + redirect to /auth/login.
```

- **Route protection:** the authenticated shell `app/(app)/layout.tsx` checks the session (server-side
  `/auth/me` with forwarded cookies); if unauthenticated, `redirect('/auth/login')`.
- **Silent refresh for server renders:** a Server Component cannot set cookies, so `frontend/proxy.ts` (Next 16's
  replacement for `middleware.ts`) runs first. On a `GET` navigation whose `access_token` cookie is present but
  expired (it reads the unverified `exp` claim, a routing hint only; the backend still verifies), it redirects to
  `/auth/session?next=<path>`. That client page runs one `refreshSession()` and returns to `next` (validated by
  `safeNext`, relative paths only). A `401`/`403` from refresh calls `POST /auth/logout` to clear the dead cookies
  and goes to `/auth/login?next=…`; a `429`, `5xx` or network error keeps the cookies and shows a retry button.
  The matcher excludes `api`, Next internals, static files, `/auth/session`, `/auth/login`, `/auth/signup` and prefetch requests; `/auth/account-setup` is covered because it is a server-guarded page. The login page honours `?next=`.
  This needs the supported same-origin topology (doc 09): the proxy must be able to read the cookie.
- **Role-gated UI:** `useAuth().user.role` decides which nav items/actions render.

---

## 7. Endpoint map (screen → contract)

Wire each screen to its documented endpoints. Full details (bodies, query params, errors) live in the endpoint docs.

| Area | Doc | Key endpoints |
|---|---|---|
| Auth / session | `auth.endpoints.md` | `POST /auth/register·login·refresh·logout`, `GET /auth/me` |
| Users / staff | `users.endpoints.md` | `GET /users`, `GET /users/:id`, `PATCH /users/:id/{role,status,barcode}` |
| Subjects | `subjects.endpoints.md` | `GET/POST /subjects`, `GET/PATCH /subjects/:id` |
| Courses / classes | `classes.endpoints.md` | `GET/POST /classes`, `GET/PATCH /classes/:id`, sessions (enrolled-gated) |
| Timetable | `timetable.endpoints.md` | `GET /timetable/slots`, `POST/PATCH/DELETE /slots`, `POST /generate` |
| Institutes | `institutes.endpoints.md` | `GET/POST /institutes`, `GET/PATCH /institutes/:id` |
| Exams | `exams.endpoints.md` | `GET/POST /exams`, channel flags `allowTypedAnswers`/`allowPdfUpload` |
| Submissions / marking | `submissions.endpoints.md` | `POST /submissions`, `PATCH /:id/{complete,marks}`, `POST /exam/:id/publish` |
| Payments | `payments.endpoints.md` | `POST /payments` (`method`, `collectedById`), listing |
| Attendance | `attendance.endpoints.md` | QR/barcode scan, listings (`source: QR`) |
| Video (recorded) | `video.endpoints.md` | `GET /videos/:id/stream` (signed Bunny embed URL + watermark identity; enrolled + paid gate) |
| Live stream | `stream.endpoints.md` | live join details |

---

## 8. Do & don't

- **Do** fetch read-data in Server Components (forward cookies) and stream with `<Suspense>`.
- **Do** run mutations from client components through `api.post/patch/del` (cookies via `credentials: 'include'`).
- **Do** normalize every error to `ApiError` and show `message`; map `code`/`field[]` where it improves UX.
- **Don't** store tokens or read cookies in JS — session state comes from `/auth/me`.
- **Don't** call the backend with raw `fetch` — always the `api` client, so auth/refresh/errors stay uniform.
- **Don't** trust client-side role checks for anything but hiding UI — the backend enforces the real rules.
