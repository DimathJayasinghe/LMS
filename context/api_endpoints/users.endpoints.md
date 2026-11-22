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

- Only `SUPER_ADMIN` changes roles (`PATCH /:id/role`), and only among `TEACHER`, `ADMIN` and `MARKER`: a student is never promoted, staff are never demoted to student, and the owner role is never assigned through the API.
- `SUPER_ADMIN` + `ADMIN` (front-desk) may list users and set barcode. `ADMIN` may set the **status of a student only** (never of staff, never their own); `SUPER_ADMIN` may set the status of any account other than their own, with the owner rules below. One policy decides this (`backend/src/services/account-change-policy.ts`) and runs before any password check or hand-over, so a refused caller learns nothing about the target.

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

Beyond an expired token, `verifyToken` reads the account row on every request (primary key lookup): the role comes from the database, and the token must carry the account's current `tokenVersion`. A deactivated account, a role change, a password change or a staff reset therefore applies on the very next request:

```json
{
	"status": "error",
	"code": "SESSION_REVOKED",
	"message": "Your session has ended. Please log in again.",
	"data": { "expired": false }
}
```

`403 PASSWORD_CHANGE_REQUIRED` is returned for every route except `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/refresh` and `PATCH /api/users/me/password` while the account has `mustChangePassword` set (after a staff reset).

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
| PATCH | `/:id/role` | SUPER_ADMIN | Change a staff member's role, with a reason, the owner's password and a class hand-over. |
| PATCH | `/:id/status` | SUPER_ADMIN; ADMIN for students only | Activate or deactivate a user. |
| GET | `/orphaned-classes` | SUPER_ADMIN | Running classes whose teacher left, grouped by teacher. |
| POST | `/:id/handover` | SUPER_ADMIN | Hand the classes of an account that already left to working teachers. |
| PATCH | `/:id/barcode` | ADMIN, STAFF | Assign a barcode to a user. |
| POST | `/staff` | SUPER_ADMIN | Create a teacher, front-desk or marker account with a one-time temporary password, shown once. |
| POST | `/:id/reset-password` | SUPER_ADMIN, ADMIN | Staff-assisted reset: one-time temporary password, shown once. |
| GET | `/resolve-barcode` | ADMIN, STAFF | Resolve a scanned barcode to a student. |
| GET | `/lookup?q=` | SUPER_ADMIN, ADMIN | Find students by name, index number or phone, returning only what the desk needs to pick one. |
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

### GET `/lookup`

Student search for the front-desk screens (collect payment, enrol a student); it returns only what
is needed to pick the right student. Roles: `SUPER_ADMIN`, `ADMIN`; any other role gets `403 FORBIDDEN`.

Searches **active students of the caller's organization** only (staff and deactivated accounts never
appear). A match is any of: name contains the text (case-insensitive); the text is 1–9 digits and
equals the index number (that student is always listed first, even when many phone numbers contain the
same digits); the text looks like a phone number (3+ digits, optional leading `+`, spaces and dashes
ignored) and is contained in the stored phone. The phone is searched but never returned, and is
matched as stored, so a number typed with `+94` does not match one stored as `07…`.

**Query params**

- `q`: string, required, 2–60 characters after trimming.

**Success (200)** — at most 8 rows, ordered by name then index number; `Cache-Control: no-store`.

```json
{
	"status": "success",
	"data": [{ "id": "uuid", "name": "Nimal Perera", "indexNumber": 42, "profileImage": null }],
	"count": 1
}
```

**Errors**

- 400 validation error (`q` missing, shorter than 2 or longer than 60 characters)
- 401 auth middleware error
- 403 forbidden (role guard)

### PATCH `/:id/role`

Changes a staff member's role among `TEACHER`, `ADMIN` (front desk) and `MARKER`. Only SUPER_ADMIN may call this endpoint. The API cannot assign SUPER_ADMIN or STUDENT, and a student account is never a target. A caller cannot change their own role, and the last active owner cannot be demoted. A role change ends every session of the account at once (`tokenVersion` bump plus refresh-token deletion); the next request of an existing session answers `401 SESSION_REVOKED`. A role change to the same role succeeds and changes, ends and records nothing.

**Required header:** `Idempotency-Key: <uuid>` — a fresh v4 UUID per request. Missing or malformed
keys return 400; replaying the same key returns the original stored response, including a stored 4xx, so each attempt needs a new key.

**Request body**

```json
{
	"role": "MARKER",
	"reason": "Moved to marking after the term ended",
	"currentPassword": "<the acting owner's own password>",
	"handover": [{ "courseId": "<uuid>", "toTeacherId": "<uuid>" }],
	"handoverAllTo": "<uuid>",
	"effectiveMonth": "NEXT"
}
```

- `role` is required. `reason` (3 to 300 characters) is required while the owner setting `identity.roleChange.reasonRequired` is on (default on).
- `currentPassword` is the acting owner's own password (step-up, while `identity.stepUp.required` is on and its actions include `ROLE_CHANGE`). Missing is `403 STEP_UP_REQUIRED`; wrong is `403 ACTOR_PASSWORD_INVALID`.
- `handover` or `handoverAllTo` name who takes the classes of a teacher who stops being a teacher: one new teacher per class, or one new teacher for all (an entry in `handover` wins over `handoverAllTo`). Each class is named once. `effectiveMonth` (`NEXT` or `CURRENT`, default from `handover.defaultEffectiveMonth`) is recorded in the audit row until the income share exists.
- Leaving the `TEACHER` role needs every class in the hand-over list (see Hand-over below); leaving `MARKER` needs the marker to have no open marking.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "User role updated successfully."
}
```

**Errors**

- 400 validation error, including an attempted owner or student role
- 400 `INVALID_HANDOVER_TARGET` (the new teacher is not an active teacher of this organization, or is the leaver), 400 `HANDOVER_COURSE_NOT_OWNED` (a named class is not the leaver's), 400 `REASON_REQUIRED`
- 401 auth middleware error
- 403 forbidden (role guard)
- 403 `FORBIDDEN` for a self change or a caller who is not the owner
- 403 `STEP_UP_REQUIRED`, 403 `ACTOR_PASSWORD_INVALID`
- 409 `LAST_OWNER` when the last active owner would be demoted
- 409 `ROLE_CHANGE_NOT_ALLOWED` (a student account as the target)
- 409 `TEACHER_HAS_CLASSES`, `MARKER_HAS_ALLOCATIONS`, `HANDOVER_SLOT_CONFLICT`: see Hand-over below
- 404 `USER_NOT_FOUND` (service error shape)

### PATCH `/:id/status`

Activates or deactivates a user.

**Required header:** `Idempotency-Key: <uuid>` — a fresh v4 UUID per request. Missing or malformed
keys return 400; replaying the same key returns the original stored response.

> The front desk (`ADMIN`) may change the status of a **student** only: never a teacher, marker, front-desk or owner account. The owner may change any account but their own. Nobody can change their own status; the last active SUPER_ADMIN cannot be deactivated. Deactivation and role changes end every session at once (`tokenVersion` bump plus refresh-token deletion); the next request of an existing session answers `401 SESSION_REVOKED`. A deactivation, reactivation or same-state request that changes nothing succeeds and ends and records nothing.

**Request body**

```json
{
	"isActive": false,
	"reason": "Left the institute",
	"currentPassword": "<the acting owner's own password>",
	"handover": [{ "courseId": "<uuid>", "toTeacherId": "<uuid>" }],
	"handoverAllTo": "<uuid>",
	"effectiveMonth": "NEXT"
}
```

- `reason` is optional on a status change and is recorded in the audit row.
- `currentPassword` is required (step-up) when the owner deactivates a **staff** account (teacher, front desk or marker) while `identity.stepUp.required` is on and its actions include `STAFF_DEACTIVATE`; activating an account and any change to a student's status need no password.
- `handover`, `handoverAllTo` and `effectiveMonth` work as on the role change, and are needed when the account is a teacher with classes in the way (setting `identity.staffDeactivate.requireHandover`, default on).

**Success (200)**

```json
{
	"status": "success",
	"data": { "...user" },
	"message": "User activated successfully."
}
```

**Errors**

- 400 validation error, 400 `INVALID_HANDOVER_TARGET`, 400 `HANDOVER_COURSE_NOT_OWNED`
- 401 auth middleware error
- 403 forbidden (role guard)
- 403 `FORBIDDEN` — `ADMIN` acting on any account that is not a student, or the target is the actor
- 403 `STEP_UP_REQUIRED`, 403 `ACTOR_PASSWORD_INVALID`
- 409 `LAST_OWNER` when the last active owner would be deactivated
- 409 `TEACHER_HAS_CLASSES`, `MARKER_HAS_ALLOCATIONS`, `HANDOVER_SLOT_CONFLICT`: see Hand-over below
- 404 `USER_NOT_FOUND` (service error shape)

### Hand-over of a leaving teacher's classes

A teacher cannot be deactivated or moved to another role while a class they run still needs a person. The classes in the way are the active ones, those with a session in the look-ahead window (`identity.handoverLookaheadDays`, default 14, 1 to 60) and those with an exam waiting for results; an ended class with nothing pending stays with its teacher as the record of who taught it. Sessions, exams and marking follow a class to its new teacher on their own. The new teacher is given the subject's teaching scope if they lack it, and the old teacher loses access straight away. The move happens in the same transaction as the account change, so a refusal leaves everything as it was.

Without a complete hand-over the request answers **409** with the structured list in `data`, which the users screen turns into the hand-over list:

```json
{
	"status": "error",
	"code": "TEACHER_HAS_CLASSES",
	"message": "This teacher still has classes. Choose who takes them over.",
	"data": {
		"courses": [
			{ "id": "<uuid>", "name": "Physics", "year": 2026, "subjectName": "Science", "isActive": true, "upcomingSessions": 1, "openExams": 1 }
		],
		"markerAllocations": []
	}
}
```

- `TEACHER_HAS_CLASSES`: classes still need a teacher (`data.courses`).
- `MARKER_HAS_ALLOCATIONS`: a marker with open marking is refused with the exams listed in `data.markerAllocations`; there is no hand-over for marking (release or reassign it first).
- `HANDOVER_SLOT_CONFLICT`: the new teacher already teaches at an overlapping time in the look-ahead window; `data.conflicts` lists each clash (`courseName`, `dayOfWeek`, `startTime`, `clashesWith`). Choose another teacher or split the classes between several.

The audit row (`ROLE_CHANGED`, `USER_DEACTIVATED` or `USER_ACTIVATED`) carries the reason, the before and after role, and, only when classes moved, the list of moves with the effective month.

### GET `/orphaned-classes`

SUPER_ADMIN only (`Cache-Control: no-store`). Running classes whose teacher has left: deactivated before a leaving teacher had to hand over, or moved to another role. The list uses the same definition as the setup panel of the owner console.

**Success (200)**

```json
{
	"status": "success",
	"data": [
		{
			"teacher": { "id": "<uuid>", "name": "Teacher C", "role": "TEACHER", "deactivated": true },
			"courses": [{ "id": "<uuid>", "name": "Orphan C", "year": 2026 }]
		}
	],
	"count": 1
}
```

### POST `/:id/handover`

SUPER_ADMIN only. Hands the classes of an account that already left to working teachers, the one-click fix for classes left behind.

**Required header:** `Idempotency-Key: <uuid>`.

**Request body:** `{ "handoverAllTo": "<uuid>" }` or `{ "handover": [{ "courseId", "toTeacherId" }] }`, with optional `effectiveMonth`. One of the two is required (400 otherwise).

**Success (200)**: `{ "status": "success", "data": { "handedOver": [{ "courseId", "courseName", "toTeacherId" }] }, "message": "Classes handed over." }`. Doing it again, when nothing is left, succeeds and writes nothing more; one audit row `CLASSES_HANDED_OVER` is written when classes moved.

**Errors**: 404 `USER_NOT_FOUND`; 409 `TEACHER_STILL_ACTIVE` (an active teacher's classes move with the deactivation or role change, not here); 400 `INVALID_HANDOVER_TARGET`, `HANDOVER_COURSE_NOT_OWNED`; 409 `HANDOVER_SLOT_CONFLICT`.

### POST `/staff`

Owner-only creation of a `TEACHER`, `ADMIN` (front desk) or `MARKER` account. It replaces the old "register as a student, then promote" route, which left a student record and an LMS card behind; that route still works but is deprecated. Owners are never created here (operator command, doc 10) and students register themselves.

**Required header:** `Idempotency-Key: <uuid>`. A replay of the same key returns the status of the first answer with a placeholder body that does **not** contain the password; the response carries `Cache-Control: no-store`.

**Request body**

```json
{ "name": "Nimal Perera", "email": "nimal@example.com", "phone": "0771234567", "role": "TEACHER", "currentPassword": "the owner's own password" }
```

`phone` is optional (Sri Lankan format). `role` is `TEACHER`, `ADMIN` or `MARKER`; `SUPER_ADMIN` and `STUDENT` are validation errors. `currentPassword` is the owner's own password (step-up) and is required while `identity.stepUp.required` is on and `STAFF_CREATE` is in `identity.stepUp.actions` (both defaults). The email is lowercased. Unknown fields are dropped: the caller cannot choose the password or waive the forced change.

**Success (201)**

```json
{ "status": "success", "data": { "user": { "id": "uuid", "name": "Nimal Perera", "email": "nimal@example.com", "role": "TEACHER", "phone": "0771234567" }, "temporaryPassword": "…", "mustChangePassword": true }, "message": "Staff account created. Give the temporary password to the new user; it is not shown again." }
```

The account is created active with `mustChangePassword = true` and `setupCompleted = true` (no NIC photos or institute cards), so the new user can sign in only to the forced password-change flow until they choose a password. The temporary password has `identity.tempPassword.length` characters (default 10). One audit row (`STAFF_ACCOUNT_CREATED`, metadata `{ role }`) is written in the same transaction as the account; neither the password nor its hash is stored in it.

**Errors**

- 400 validation error, missing `Idempotency-Key`, or `INVALID_STAFF_ROLE`
- 401 auth middleware error
- 403 `FORBIDDEN_ROLE` (route guard), `STEP_UP_REQUIRED` (no `currentPassword`) and `ACTOR_PASSWORD_INVALID` (wrong password; 403, not 401, so the owner's session is not ended)
- 409 `EMAIL_ALREADY_EXISTS`

### POST `/:id/reset-password`

Staff-assisted password reset for an account holder who forgot the password. Generates a one-time temporary password, forces a change at next sign-in, and ends every session of the target.

**Required header:** `Idempotency-Key: <uuid>`. Missing or malformed keys return 400. A replay of the same key returns `200` with a placeholder body that does **not** contain the password (the secret is never stored or replayed); the response itself carries `Cache-Control: no-store`.

**Who may reset whom:** `ADMIN` (front desk) resets `STUDENT` targets only. `SUPER_ADMIN` resets any other non-self target except another `SUPER_ADMIN` (owner recovery stays an operator command, doc 10). Nobody resets their own account here; use the change-password flow. A deactivated target must be activated first.

**Request body**

```json
{ "identityCheck": "IN_PERSON_CARD", "currentPassword": "actor's own password (staff targets only)" }
```

`identityCheck` is one of `IN_PERSON_CARD`, `GUARDIAN_PHONE`, `OWNER_KNOWS` and is recorded in the audit row (action `PASSWORD_RESET_BY_STAFF`, metadata `{ identityCheck }`, never the password). A staff target (not a student) requires the actor's own `currentPassword` (step-up) while `identity.stepUp.required` is on and `STAFF_PASSWORD_RESET` is in `identity.stepUp.actions`.

**Success (200)**

```json
{ "status": "success", "data": { "temporaryPassword": "…", "mustChangePassword": true }, "message": "Password reset. Give the temporary password to the account holder; it is not shown again." }
```

The temporary password has `identity.tempPassword.length` characters (default 10) from an alphabet without `0 O 1 l I`. The target's `passwordChangedAt` is not touched, so a reset does not start the self-service cooldown, and the forced change is exempt from the cooldown.

**Errors**

- 400 validation error or missing `Idempotency-Key`
- 401 auth middleware error
- 403 `FORBIDDEN_ROLE` (route guard) or `FORBIDDEN` (target not allowed, or self)
- 403 `STEP_UP_REQUIRED` (staff target without `currentPassword`) and `ACTOR_PASSWORD_INVALID` (wrong password; 403, not 401, so the actor's session is not ended)
- 404 `USER_NOT_FOUND`
- 409 `ACCOUNT_DEACTIVATED`
- 409 `TARGET_CHANGED` (the account's role changed while the reset ran; retry)
- 429 `RESET_LIMIT_ACTOR` (`identity.reset.maxPerActorPerDay`, default 40) and `RESET_LIMIT_TARGET` (`identity.reset.maxPerTargetPer24h`, default 3), counted from the audit rows of the last 24 hours

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
