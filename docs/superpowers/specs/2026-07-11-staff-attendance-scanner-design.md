# Staff Attendance Scanner — Design

_Date: 2026-07-11 · Branch: `feature/attendance-scanner` (off `dev`)_

## 1. Goal

Replace the staff-side `ComingSoon` on `/attendance` with a working entrance scanner: front-desk
picks the class session, then checks students in by **scanner-gun (keyboard-wedge)** or **camera QR**,
with a live roster and a **manual "mark by name"** fallback. Wires already-built endpoints; no new
backend behavior is required (backend changes allowed if a gap appears, but none is expected).

## 2. Backend contract (existing — verify, don't rebuild)

| Method | Path | Role | Notes |
|---|---|---|---|
| `GET` | `/classes` | any authed | Class/course list for the picker. |
| `GET` | `/classes/:classId/sessions` | any authed | Sessions for a class (filter `classType?`). |
| `POST` | `/attendance/scan` | SUPER_ADMIN, ADMIN | `{barcode, classSessionId}` → upsert; resolves `User.barcode`. |
| `POST` | `/attendance/manual` | SUPER_ADMIN, ADMIN | `{userId, classSessionId}` → upsert. |
| `GET` | `/attendance/session/:sessionId` | SUPER_ADMIN, ADMIN, TEACHER | Roster for a session (`ApiList<AttendanceRecord>`). |
| `GET` | `/users?search=&role=STUDENT` | SUPER_ADMIN, ADMIN | Student search for manual mark. |

Scan/manual return the `AttendanceRecord` with `user { id, name, email, indexNumber, barcode }`.
Error codes to map: `BARCODE_NOT_FOUND` (404), `STUDENT_DEACTIVATED` (403),
`INVALID_ROLE_FOR_ATTENDANCE` (400), `CLASS_SESSION_NOT_FOUND` (404), `USER_NOT_FOUND` (404).

> **Verify during implementation:** that `GET /users` and `GET /classes/:id/sessions` both admit
> `ADMIN` (front-desk). If `GET /users` is SUPER_ADMIN-only, add `ADMIN` there (authorized) so the
> manual-mark search works for front-desk — that's the one plausible backend touch.

## 3. Access (role-aware `page.tsx`)

Fetch `/auth/me`. **STUDENT** → existing QR + history (unchanged). **SUPER_ADMIN / ADMIN** →
`StaffScanner`. **TEACHER / MARKER** → keep `ComingSoon` (teacher read-only roster is out of scope).
Unauthenticated → `redirect("/auth/login")`.

## 4. Architecture

```
app/(app)/attendance/
  page.tsx              server: role branch; for staff fetch GET /classes → pass to StaffScanner
  _components/
    AttendanceQr.tsx     (exists — student QR)
    StaffScanner.tsx     client: session picker + scan field + camera + roster + manual mark
lib/api.ts               (reuse; no change)
```

Keep the student branch as-is (extract only if it reads cleaner). One client `StaffScanner` owns all
interactivity. Camera QR via **`@zxing/browser`** (`BrowserQRCodeReader.decodeFromVideoDevice` into a
styled `<video>`; no worker-file config, unlike `html5-qrcode`).

## 5. Data flow

1. Server `page.tsx` fetches `GET /classes` and passes the list to `StaffScanner`.
2. Staff picks a **class** → `StaffScanner` fetches `GET /classes/:id/sessions` (newest first, today
   highlighted) → picks a **session**. Scan inputs are disabled until a session is chosen. On select,
   fetch `GET /attendance/session/:sessionId` to seed the roster.
3. **Scan:** a focused text input captures the scanner gun (barcode + Enter) → `POST /attendance/scan
   {barcode, classSessionId}`. **Camera toggle** starts `@zxing/browser` continuous decode → on a
   decoded QR string, same submit (debounced so one physical scan fires once). After submit, clear +
   refocus the field.
4. **Roster update:** each successful scan/manual response carries the `AttendanceRecord` (with
   `user`); prepend to the roster **deduped by `userId`** (upsert means a re-scan just refreshes
   `lastSeenAt`, not a new row). Show a running count.
5. **Manual mark:** debounced search `GET /users?search=&role=STUDENT` → pick → `POST
   /attendance/manual {userId, classSessionId}` → same roster path.

## 6. Error handling & edge cases

- Every scan result is a transient inline line, non-blocking; the field stays focused for the next
  scan. Map: `BARCODE_NOT_FOUND` → "No student for this code", `STUDENT_DEACTIVATED` → "Account
  deactivated", `INVALID_ROLE_FOR_ATTENDANCE` → "Not a student code", generic otherwise.
- **Duplicate scan** → upsert → roster dedupes by `userId` (updates last-seen; no second row/line).
- **Camera:** `getUserMedia` needs a **secure context** (HTTPS or `localhost`) + permission. On
  deny/unavailable/insecure-origin → hide camera, keep the wedge field, show a one-line note. Always
  stop the stream on unmount / camera-off / session change (no leaked camera light).
- **No session selected** → scan + manual inputs disabled with a "pick a session first" hint.
- **Empty states:** no classes → "No classes yet."; empty roster → "No check-ins yet."; manual
  search no match → "No students found."
- **Concurrent front-desks:** last-write-wins on upsert (acceptable; low contention).

## 7. Out of scope (YAGNI)

Institute-scoped `(instituteId, barcode)` scanning (documented backend follow-up); teacher read-only
roster; offline queueing; `AttendanceSource.QR` tagging (backend writes `BARCODE`); editing/removing
a check-in (no delete endpoint).

## 8. Testing & verification

- **Backend:** no new behavior expected → no new Vitest. If `GET /users` needs an `ADMIN` role add,
  that IS behavior → back it with a Vitest role test per §3.4.
- **Frontend Vitest+RTL** (`StaffScanner`): wedge scan (Enter → `POST /scan`, success prepends to
  roster, error mapped inline), duplicate scan deduped in roster, manual search + mark, session-gating
  (inputs disabled until a session is picked). Camera decode is mocked out (no `getUserMedia` in
  jsdom).
- **System:** `tsc` + `next build` green; backend `npm run build` if touched.
- **Live smoke (headless Chromium on the Docker stack):** staff pick class → session → type a real
  student `barcode` + Enter → student appears in roster with count; manual search a student → mark →
  appears; re-scan same student → no duplicate; STUDENT sees their QR (not the scanner); TEACHER sees
  `ComingSoon`. Camera: verify the toggle starts a stream via Playwright's fake media device without
  crashing; **full QR-decode-from-camera is the one path headless can't drive end-to-end** — flag it
  explicitly (the decoded-string → submit path is identical to the wedge path, which is covered).

## 9. Definition of done

- Staff `/attendance` shows the scanner; wedge + camera + manual all check students into the selected
  session with a live roster; role branch intact (STUDENT QR, TEACHER ComingSoon).
- Full gate green: frontend unit + `tsc`/build + the live smoke matrix in §8 (camera caveat noted).
- Docs updated alongside code: `context/api_endpoints/attendance.endpoints.md` (mark the staff
  scanner as built + note the camera secure-context requirement), `context/documents/06-progress-tracker.md`,
  `context/frontend/06-frontend-roadmap.md`.
