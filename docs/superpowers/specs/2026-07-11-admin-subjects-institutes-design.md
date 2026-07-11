# Admin: Subjects & Institutes management pages — Design

_Date: 2026-07-11 · Branch: `feature/admin-subjects-institutes` (off `dev`)_

## 1. Goal

Replace the two `ComingSoon` placeholder pages — `/admin/subjects` and `/admin/institutes` —
with working management screens wired to the **already-built, already-tested** backend endpoints.
No backend changes.

## 2. Backend contract (existing — do not change)

Both resources expose the same shape (`backend/src/routes/{subject,institute}.routes.ts`):

| Method | Path | Role | Notes |
|---|---|---|---|
| `POST` | `/api/subjects` · `/api/institutes` | **SUPER_ADMIN** | Create. 409 on duplicate. |
| `GET` | `/api/subjects?search=` · `/api/institutes?search=` | any authed | `ApiList<T>` (`data` + `count`). SUPER_ADMIN sees inactive rows too; others see active only. |
| `GET` | `/api/…/:id` | any authed | Single. |
| `PATCH` | `/api/…/:id` | **SUPER_ADMIN** | Partial update, incl. `isActive` toggle. 409 on duplicate name/code. |

**There is no DELETE.** Deactivation is `PATCH { isActive: false }` (repo soft-delete invariant).

Field shapes (match existing `lib/types.ts` `Subject` / `Institute` exactly — no type changes):
- **Subject:** `name` (2–120, required, unique), `description` (≤500, optional), `isActive`.
- **Institute:** `name` (2–120, required, unique), `code` (2–20, required, unique),
  `city` (≤120, optional), `isActive`.

Error codes to map: `SUBJECT_ALREADY_EXISTS` / `INSTITUTE_ALREADY_EXISTS` (409),
`SUBJECT_NOT_FOUND` / `INSTITUTE_NOT_FOUND` (404).

## 3. Access

Both pages are **SUPER_ADMIN-only** (nav already scopes them that way; mutation endpoints are
SUPER_ADMIN-only). Server component guards: fetch `/auth/me`; if not `SUPER_ADMIN`,
`redirect("/dashboard")`. This is stricter than `/admin/users` (which also admits `ADMIN`), and
intentional — front-desk does not manage the academic taxonomy or the center allowlist.

## 4. Architecture — mirror `/admin/users`, no new dependencies

Two near-identical page trees under `frontend/app/(app)/admin/`:

```
subjects/
  page.tsx            server: SUPER_ADMIN guard + fetch GET /subjects?search → render
  loading.tsx         skeleton (mirror admin/users/loading.tsx)
  _components/
    SubjectManager.tsx  client: search box + create form + table with inline edit
institutes/
  page.tsx
  loading.tsx
  _components/
    InstituteManager.tsx
```

A single client `*Manager` component per resource owns all interactivity (search, create, inline
edit, activate/deactivate). This keeps each file focused and avoids threading state across a
filters/table split — the two resources are small enough that one component reads cleaner than the
Users page's `Filters`+`Table` split. Both use the shared `api` client
(`api.post`/`api.patch`) + `router.refresh()` (server page re-fetches), and the installed
primitives only: `input`, `label`, `switch`, `field`, `button`, `badge`, `separator`.

**No modal / no Radix Dialog** (codebase convention; not installed). Create and edit are **inline**:

- **Create:** a "New subject/institute" button toggles an inline form card at the top of the list
  (name + description/code+city + an `isActive` Switch defaulting on → `POST` → on success reset &
  collapse the form, `router.refresh()`).
- **Edit:** each row has an edit pencil; clicking expands the row's cells into the same inputs
  (pre-filled) with save/cancel → `PATCH`. One row editable at a time.
- **Activate/Deactivate:** a per-row ghost button → `PATCH { isActive }`, exactly like the Users
  status toggle.

## 5. Data flow

1. Server `page.tsx` reads `searchParams.search`, forwards cookies, `GET /…?search=`, passes
   `data` into the client `*Manager`.
2. Client mutations call `api.post`/`api.patch` then `router.refresh()` → the server component
   re-fetches, so the list is always server-truth (no optimistic client cache to drift).
3. Search: a small form pushes `?search=` (server re-fetch), mirroring `UserFilters`. Because
   the viewer is SUPER_ADMIN, the list includes inactive rows; a client-side "Active / Inactive /
   All" segmented filter narrows the already-fetched set (no extra round-trip — the backend has no
   `isActive` query param, and the SUPER_ADMIN list already returns all).

## 6. Error handling & edge cases

Per-form / per-row inline error text (no global toast — none installed), mapping `ApiError.message`:
- **Duplicate name/code (409):** show the backend message on the offending form/row; keep inputs.
- **Validation:** disable submit until `name.length >= 2` (and, for institutes, `code.length >= 2`);
  trim before send. Rely on backend Zod for the authoritative bounds; mirror the min lengths client-side.
- **Empty list / empty search:** dashed empty-state card (mirror `UsersTable`'s empty state).
- **Network/500:** generic "Something went wrong, try again" inline; the row/form stays open.
- **Concurrent edit:** last-write-wins (acceptable; low-contention super-admin-only screen).
- **Create form open + then edit a row:** only one editing context; opening a row-edit collapses
  the create form and vice-versa, to avoid two competing `isActive` switches.

## 7. Out of scope (YAGNI)

- No hard delete (backend has none).
- No pagination (backend list is unpaginated + these sets are tiny — a handful of subjects, a
  short center allowlist). Search is enough.
- No per-institute barcode management here (that lives in student account-setup; this page manages
  the institute records themselves).
- No course-count / usage stats per subject (nice-to-have; not required to unblock course creation).

## 8. Testing & verification

Frontend-only wiring of already-tested backend endpoints → **no new backend behavior**, so no new
Vitest unit (repo §3.4's Vitest requirement targets *backend* behavioral changes). Verification
follows the Done-log convention for frontend tasks:

1. `npm run lint` + `npm run build` (frontend) green.
2. Live-stack smoke test against the running Docker stack, as SUPER_ADMIN:
   create a subject → appears → edit its name/description → deactivate → the Active filter hides it,
   All shows it → duplicate-name create returns the 409 message inline. Same matrix for institutes
   (incl. duplicate `code`). Plus: a non-SUPER_ADMIN (ADMIN) is redirected off both pages (SSR gate).

## 9. Definition of done

- Both pages replace `ComingSoon`; create/edit/activate/deactivate work end-to-end.
- SSR SUPER_ADMIN gate verified (ADMIN bounced).
- `lint` + `build` green; live smoke matrix in §8 passes.
- `context/documents/06-progress-tracker.md` + `context/frontend/06-frontend-roadmap.md` updated
  (move these off the ComingSoon/placeholder list into Done with the date), per CLAUDE.md's
  "update the doc alongside the code" rule.
