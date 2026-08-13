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

Resolution order: tries the institute-scoped `StudentBarcode` table first (barcode uniqueness
is enforced **per institute**, not globally); if exactly one institute match is found, returns
it with that `instituteId`. Otherwise (zero or more-than-one institute matches — ambiguous
matches are treated as unresolved rather than guessed) falls back to the global `User.barcode`
field, returning `instituteId: null`.

**Query params**

- `code`: string, required, 1–50 chars — the scanned/typed barcode value.

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

### PATCH `/:id/role`

Updates the user's role. ADMIN only.

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

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `USER_NOT_FOUND` (service error shape)

### PATCH `/:id/status`

Activates or deactivates a user.

**Required header:** `Idempotency-Key: <uuid>` — a fresh v4 UUID per request. Missing or malformed
keys return 400; replaying the same key returns the original stored response.

> **Privileged-target guard (fixed 2026-07-10):** an `ADMIN` (front-desk) actor can no longer
> change the status of an `ADMIN` or `SUPER_ADMIN` target — only `SUPER_ADMIN` can. Previously
> the route was gated only by `requireRole(SUPER_ADMIN, ADMIN)` with no check on the *target's*
> role, so front-desk could deactivate a super-admin account (this happened for real — see
> `AuditLog`). The check lives in `UserService.updateStatus` via `assertCanManagePrivilegedTarget`,
> shared with `PATCH /:id/barcode` below (same actor/target pattern, same fix).

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
- 403 `FORBIDDEN` — actor is `ADMIN` and target is `ADMIN`/`SUPER_ADMIN`
- 404 `USER_NOT_FOUND` (service error shape)

### PATCH `/:id/barcode`

Assigns a barcode to a user.

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
- 409 `BARCODE_IN_USE` (service error shape)
