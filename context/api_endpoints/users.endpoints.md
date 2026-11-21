# Users API Endpoints

This document describes the currently available user management endpoints in the backend.

## Base URL

```
http://localhost:5000/api/users
```

## Auth

All users endpoints require the `access_token` cookie.

## Roles

Enum: `SUPER_ADMIN`, `TEACHER`, `ADMIN`, `MARKER`, `STUDENT`.

- Only `SUPER_ADMIN` changes roles (`PATCH /:id/role`).
- `SUPER_ADMIN` + `ADMIN` (front-desk) may list users and set status/barcode.

> **Reading older tables below**: `ADMIN` now means **`SUPER_ADMIN`**, `STAFF` now means **`ADMIN`**.

> **Account setup** (implemented 2026-07-10): `setupCompleted` (bool) is exposed on `/auth/me`
> along with `nicFrontUploaded`/`nicBackUploaded` (presence-only booleans — `/auth/me` never
> returns the raw R2 key or a signed URL, to keep every SSR page's auth check cheap). The
> NIC-upload and institute-barcode endpoints themselves live under `/api/users/me/...` — see
> the dedicated `account-setup.endpoints.md` rather than duplicating them here.
>
> **`User.barcode` (the LMS QR) is now auto-generated at registration** (`LMS-<indexNumber
> padded to 6 digits>`), not left null until an admin assigns one. `PATCH /:id/barcode` below
> still exists for admin override/reassignment (e.g. a lost card) — it just no longer has to be
> the *first* time a student gets a value.

## Response Shapes (Current Implementation)

Current error shapes in use today:

### Success (controllers)

```json
{
	"status": "success",
	"data": {},
	"message": "..."
}
```

### List success (arrays)

```json
{
	"status": "success",
	"data": [],
	"count": 0
}
```

### Validation error (middleware)

```json
{
	"status": "error",
	"message": "Validation failed",
	"data": [
		{ "field": "page", "message": "Expected number" }
	]
}
```

### Service error (AppError)

```json
{
	"status": "error",
	"message": "User not found.",
	"code": "USER_NOT_FOUND"
}
```

### Auth middleware error (verifyToken)

```json
{
	"status": "error",
	"message": "Token expired. Please refresh.",
	"data": { "expired": true }
}
```

## User Object Shape

Returned in list and detail endpoints:

```json
{
	"id": "uuid",
	"indexNumber": 1,
	"email": "user@example.com",
	"name": "User Name",
	"role": "STUDENT",
	"phone": "0771234567",
	"nic": "200012345678",
	"barcode": "BC-001",
	"deletedAt": null,
	"createdAt": "2026-05-12T06:00:00.000Z"
}
```

## Endpoints Summary

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/` | ADMIN, STAFF | List users (paginated, filterable). |
| GET | `/me` | Any authenticated | Get current user profile. |
| GET | `/:id` | ADMIN, STAFF | Get a user by id. |
| PATCH | `/:id/role` | ADMIN | Update user role. |
| PATCH | `/:id/status` | ADMIN, STAFF | Activate or deactivate a user. |
| PATCH | `/:id/barcode` | ADMIN, STAFF | Assign a barcode to a user. |
| GET | `/resolve-barcode` | ADMIN, STAFF | Resolve a scanned barcode to a student. |
| GET | `/academic-staff?role=TEACHER|MARKER` | SUPER_ADMIN; TEACHER for MARKER only | Minimal active staff directory (id/name/role only). |

`GET /academic-staff` intentionally excludes email, phone, NIC, account status metadata, and other
PII. SUPER_ADMIN uses it for subject/course ownership; an owning TEACHER may request only MARKER
rows for exam assignment.

## Endpoint Details

### GET `/`

List users with pagination and filters.

**Query params**

- `page`: integer, default `1`
- `limit`: integer, default `20`, max `100`
- `role`: one of `ADMIN`, `STAFF`, `MARKER`, `STUDENT`
- `status`: `active` | `inactive` | `all` (default `active`)
- `search`: matches name, email, nic, barcode, and indexNumber

**Success (200)**

```json
{
	"status": "success",
	"data": ["...users"],
	"count": 42
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)

### GET `/me`

Returns the current authenticated user profile.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" }
}
```

**Errors**

- 401 auth middleware error
- 404 `USER_NOT_FOUND` (service error shape)

### GET `/:id`

Returns the user profile by id.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" }
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `USER_NOT_FOUND` (service error shape)

### GET `/resolve-barcode`

Resolves a scanned/typed barcode to a student, for staff-facing flows (entrance payment
collection today). Roles: `SUPER_ADMIN`, `ADMIN`.

Uses the same resolver as the entrance scanner (`POST /attendance/scan`): the code is looked up
case-insensitively in both the global `User.barcode` and every institute `StudentBarcode`. Exactly one
distinct student is returned, with `instituteId` set only when exactly one of that student's institute
cards matched (otherwise `null`). A code held by more than one student is refused with
`409 AMBIGUOUS_CODE` (never guessed); the front desk finds the student by index number or name instead.
A deactivated or non-student holder is still returned, as before.

**Query params**

- `code`: string, required, 1–50 printable ASCII characters after trimming — the scanned/typed barcode value.

**Success (200)**

```json
{
	"status": "success",
	"data": {
		"user": { "id": "...", "name": "...", "indexNumber": 123 },
		"instituteId": "uuid | null",
		"matchedBarcode": "NUG-00123"
	}
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `BARCODE_NOT_FOUND` — no `StudentBarcode` or `User.barcode` matches the code.
- 409 `AMBIGUOUS_CODE` — the code matches more than one student.

### PATCH `/:id/role`

Updates the user's role. Only SUPER_ADMIN may call this endpoint. The API cannot assign SUPER_ADMIN. A caller cannot change their own role, and the last active owner cannot be demoted. A role change revokes refresh sessions; existing access tokens expire normally until per-request revocation is implemented.

**Required header:** `Idempotency-Key: <uuid>` — a fresh v4 UUID per request. Missing or malformed
keys return 400; replaying the same key returns the original stored response.

**Request body**

```json
{
	"role": "MARKER"
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "User role updated successfully."
}
```

**Errors**

- 400 validation error, including attempted owner assignment
- 401 auth middleware error
- 403 forbidden (role guard)
- 403 `FORBIDDEN` for self changes
- 409 `LAST_OWNER` when the last active owner would be demoted
- 404 `USER_NOT_FOUND` (service error shape)

### PATCH `/:id/status`

Activates or deactivates a user.

**Required header:** `Idempotency-Key: <uuid>` — a fresh v4 UUID per request. Missing or malformed
keys return 400; replaying the same key returns the original stored response.

> An ADMIN cannot change an ADMIN or SUPER_ADMIN target. Nobody can change their own status; the last active SUPER_ADMIN cannot be deactivated. Deactivation revokes refresh sessions; existing access tokens expire normally until per-request revocation is implemented.

**Request body**

```json
{
	"isActive": true
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "User activated successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 403 `FORBIDDEN` — actor is `ADMIN` and target is `ADMIN`/`SUPER_ADMIN`, or the target is the actor
- 409 `LAST_OWNER` when the last active owner would be deactivated
- 404 `USER_NOT_FOUND` (service error shape)

### PATCH `/:id/barcode`

Assigns a barcode to a user. The code is trimmed printable ASCII, 3–50 characters. The user’s own default `LMS-<index padded to 6 digits>` card can be restored.

**Required header:** `Idempotency-Key: <uuid>` — a fresh v4 UUID per request. Missing or malformed
keys return 400; replaying the same key returns the original stored response.

**Request body**

```json
{
	"barcode": "BC-2026-001"
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "Barcode assigned successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 403 `FORBIDDEN` — actor is `ADMIN` and target is `ADMIN`/`SUPER_ADMIN` (same guard as `/:id/status`)
- 404 `USER_NOT_FOUND` (service error shape)
- 409 `CODE_UNAVAILABLE` — the code is held by another user as an LMS card or an institute card (compared case-insensitively), or is in the reserved `LMS-<number>` format other than the user’s own default card. The message never names the other holder. Re-assigning an existing code is checked against other holders.
