# Audit Log API Endpoints

## Base URL

```
http://localhost:5000/api/audit-logs
```

## Auth & Roles

`SUPER_ADMIN` only.

> **Role-guard fix (2026-07-10):** this route was written 2026-05-25 as `requireRole(Role.ADMIN)`,
> before the 2026-07-09 `Role` enum remap (old `ADMIN` meant owner/super-admin; new `ADMIN` means
> front-desk). It was missed in that remap — until fixed, front-desk could read the full audit
> trail (every admin's IPs, user-agents, and before/after state of privileged mutations) while the
> actual super-admin was locked out. Now `requireRole(Role.SUPER_ADMIN)` only. Found while building
> the frontend viewer below, in the same session as the front-desk/super-admin privilege-escalation
> fix on `PATCH /users/:id/status` — see `users.endpoints.md` and `04-ai-workflow-rules.md §3.4`.

## Endpoints

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/api/audit-logs` | SUPER_ADMIN | List audit log entries (paginated, filterable) |

### GET `/api/audit-logs`

**Query params** (`backend/src/schemas/audit.schema.ts`)

- `page`: integer, default `1`
- `limit`: integer, default `20`, max `100`
- `action`: string, exact match (see `AUDIT_ACTION` in `backend/src/utils/constants.ts` for the
  current set — free-text on the backend, so an unlisted value still filters correctly)
- `actorId`: UUID — filter to one actor
- `targetType` / `targetId`: filter to one target resource (e.g. `targetType=User`)
- `from` / `to`: ISO date — filters `createdAt` with `gte`/`lte`; either may be given alone

**Success (200)**

```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "action": "USER_DEACTIVATED",
      "description": "Account deactivated",
      "targetType": "User",
      "targetId": "uuid",
      "metadata": { "before": {}, "after": {} },
      "ip": "203.0.113.4",
      "userAgent": "Mozilla/5.0 ...",
      "actorId": "uuid",
      "actorRole": "ADMIN",
      "createdAt": "2026-07-10T18:21:54.200Z",
      "actor": { "id": "uuid", "name": "Front Desk", "email": "frontdesk@lms.com", "role": "ADMIN" }
    }
  ],
  "count": 1,
  "page": 1,
  "limit": 20
}
```

Sorted newest-first (`createdAt desc`). `actorRole` is denormalized at write-time (historical
accuracy if the actor's role later changes) — trust it over `actor.role` for "what could this
actor do at the time," and `actor.role` for "what can they do now."

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard) — anything but `SUPER_ADMIN`

## Writing new audit events

The 2026-08-20 academic-workspace slice added these filterable actions:
`SUBJECT_TEACHERS_ASSIGNED`, `COURSE_TEACHER_ASSIGNED`, `LIVE_CLASS_SCHEDULED`,
`VIDEO_UPLOAD_INITIATED`, `VIDEO_ATTACHED`, `VIDEO_UPDATED`, `VIDEO_DELETED`,
`EXAM_PAPER_ATTACHED`, and `RESULT_CORRECTED`. Corrections include structured before/after values and
the mandatory reason; teacher/subject/marker replacements include the resulting IDs.

The secure class-artwork slice adds `COURSE_ASSET_UPLOAD_URL`, `COURSE_ASSET_UPDATED`, and
`COURSE_ASSET_REMOVED`. Metadata records the asset kind and safe upload attributes, never the signed
PUT URL or a secret. No-op repeated removal does not create a misleading removal event.

Any privileged mutation should call `AuditService.log(...)` from the controller layer (fire-and-
forget — never blocks the response, write failures are logged not thrown). See
`backend/src/services/audit.service.ts` and the `AUDIT_ACTION` constant map. When adding a new
action, add it to the frontend's `ACTIONS` list in
`frontend/app/(app)/admin/audit/_components/AuditFilters.tsx` too (the filter dropdown is a
hardcoded mirror, not fetched from the backend).

## Frontend

`/admin/audit` (`frontend/app/(app)/admin/audit/page.tsx`) — SUPER_ADMIN-gated (redirects everyone
else to `/dashboard`), action + date-range filters, paginated table with an expandable row per
entry for IP/user-agent/metadata. Nav entry under "Administration" in `frontend/lib/nav.ts`.
