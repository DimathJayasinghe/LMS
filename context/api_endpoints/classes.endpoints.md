
# Classes + Class Sessions API Endpoints

This document describes class (course) and class session endpoints in the backend.

## Base URL

```
http://localhost:5000/api/classes
```

## Auth

All classes endpoints require the `access_token` cookie **except**
`GET /public`, which is deliberately unauthenticated (marketing `/courses`
page, before login). Its select list is public-safe only — no email, phone,
NIC, enrollment counts, or anything else beyond what a prospective student
needs to decide whether to sign up.

## Roles

Enum: `SUPER_ADMIN`, `TEACHER`, `ADMIN`, `MARKER`, `STUDENT`.

- `SUPER_ADMIN` — institution owner; full access.
- `TEACHER` — manages **their own** courses' sessions/exams/videos/timetable.
- `ADMIN` — front-desk staff (attendance, payments, timetable edits, account verification).
- `MARKER` — grades assigned exams.
- `STUDENT` — enrolled learner; content gated on active enrollment (+ paid month for video).

> **Reading older tables below**: where a row says `ADMIN` it now means **`SUPER_ADMIN`**, and `STAFF` now means **`ADMIN`**. Course-content routes (courses, sessions, exams, videos) now also allow the owning **`TEACHER`**; front-desk `ADMIN` may also edit sessions (timetable).

## What changed (2026-07-09)

> **Teacher workspace completed 2026-08-20:** `GET /` returns only the acting TEACHER's courses;
> `GET /:classId` rejects cross-teacher reads; POST always assigns a TEACHER caller as owner; and
> SUPER_ADMIN may select/reassign only a teacher approved through `SubjectTeacher`. Create and update
> require `Idempotency-Key`. The frontend exposes `/classes/new` and `/classes/:classId/edit` only to
> TEACHER/SUPER_ADMIN and derives subject/teacher choices from the assignment endpoints.

- **Course create/update** now requires `subjectId` and (for SUPER_ADMIN) `teacherId`; a TEACHER creating a course owns it automatically.
- Course gained `bannerUrl` / `backdropUrl` (image URLs).
- **Students** only see sessions for courses they are **actively enrolled** in (`403 NOT_ENROLLED` otherwise). Enrollments are created/listed via `enrollments.endpoints.md`.
- Sessions may be **generated from the timetable** (see `timetable.endpoints.md`); `timetableSlotId` links them.

## Response Shapes (Current Implementation)

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
		{ "field": "name", "message": "Required" }
	]
}
```

### Service error (AppError)

```json
{
	"status": "error",
	"message": "Class not found.",
	"code": "CLASS_NOT_FOUND"
}
```

## Data Shapes

### Class (Course)

```json
{
	"id": "uuid",
	"name": "2025 A/L Theory",
	"year": 2025,
	"description": "...",
	"monthlyFee": "2500.00",
	"isActive": true,
	"subjectId": "uuid",
	"teacherId": "uuid",
	"bannerUrl": "https://.../banner.png",
	"backdropUrl": "https://.../backdrop.png",
	"createdAt": "2026-05-13T06:00:00.000Z",
	"updatedAt": "2026-05-13T06:00:00.000Z"
}
```

### Class Session

```json
{
	"id": "uuid",
	"title": "Revision Session",
	"description": "...",
	"classType": null,
	"date": "2026-05-13T10:00:00.000Z",
	"durationMinutes": 90,
	"zoomLink": "https://zoom.us/...",
	"zoomMeetingId": "123456789",
	"courseId": "uuid",
	"deletedAt": null,
	"createdAt": "2026-05-13T06:00:00.000Z",
	"updatedAt": "2026-05-13T06:00:00.000Z"
}
```

## Endpoints Summary

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/public` | None (public) | List active courses, marketing-safe fields only. |
| POST | `/` | ADMIN, STAFF | Create a class (course). |
| GET | `/` | Any authenticated | List classes. |
| GET | `/:classId` | Any authenticated | Get class detail. |
| PATCH | `/:classId` | ADMIN, STAFF | Update class (including active status). |
| POST | `/:classId/sessions` | ADMIN, STAFF | Create a class session. |
| GET | `/:classId/sessions` | Any authenticated | List class sessions. |
| GET | `/:classId/sessions/:sessionId` | Any authenticated | Get class session detail. |
| PATCH | `/:classId/sessions/:sessionId` | ADMIN, STAFF | Update class session. |
| DELETE | `/:classId/sessions/:sessionId` | ADMIN, STAFF | Soft delete class session. |

## Endpoint Details

### GET `/public`

No auth. Query (all optional): `search`, `year`. Always filtered to
`isActive: true` regardless of caller — there is no "see inactive" escape
hatch here, unlike `GET /` for `SUPER_ADMIN`.

**Success (200)**

```json
{
	"status": "success",
	"data": [
		{
			"id": "uuid",
			"name": "2027 A/L Theory",
			"year": 2027,
			"description": "...",
			"monthlyFee": "2500.00",
			"bannerUrl": "https://.../banner.png",
			"backdropUrl": "https://.../backdrop.png",
			"subject": { "name": "Physics" },
			"teacher": { "name": "Ms. Perera" }
		}
	],
	"count": 1
}
```

### POST `/`

Creates a class (course).

**Request body**

```json
{
	"name": "2025 A/L Theory",
	"year": 2025,
	"description": "...",
	"monthlyFee": 2500,
	"isActive": true,
	"subjectId": "uuid",
	"teacherId": "uuid",
	"bannerUrl": "https://.../banner.png",
	"backdropUrl": "https://.../backdrop.png"
}
```

- `subjectId` — **required**. `teacherId` — required when the caller is `SUPER_ADMIN`; omitted by a `TEACHER` (they own it). `bannerUrl`/`backdropUrl` — optional image URLs.

**Success (201)**

```json
{
	"status": "success",
	"data": { "...class" },
	"message": "Class created successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 409 `CLASS_ALREADY_EXISTS` (service error shape)

### GET `/`

List classes. Non-admin users only see active classes.

**Query params**

- `search`: filters by name or description
- `year`: filters by class year

**Success (200)**

```json
{
	"status": "success",
	"data": ["...classes"],
	"count": 2
}
```

**Errors**

- 400 validation error
- 401 auth middleware error

### GET `/:classId`

Get class detail. Non-admin users only see active classes.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...class" }
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 404 `CLASS_NOT_FOUND` (service error shape)

### PATCH `/:classId`

Update class details.

**Request body**

```json
{
	"description": "Updated class description",
	"isActive": true
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...class" },
	"message": "Class updated successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `CLASS_NOT_FOUND` (service error shape)
- 409 `CLASS_ALREADY_EXISTS` (service error shape)

### POST `/:classId/sessions`

Create a class session.

**Request body**

```json
{
	"title": "Revision Session",
	"description": "...",
	"classType": "ONLINE",
	"date": "2026-05-13T10:00:00.000Z",
	"durationMinutes": 90,
	"zoomLink": "https://zoom.us/...",
	"zoomMeetingId": "123456789"
}
```

**Success (201)**

```json
{
	"status": "success",
	"data": { "...session" },
	"message": "Class session created successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `CLASS_NOT_FOUND` (service error shape)

### GET `/:classId/sessions`

List class sessions. Non-admin users only see non-deleted sessions.

A `TEACHER` caller gets `403 FORBIDDEN_COURSE` if the class isn't one they teach.

**Query params**

- `classType`: filters by class type

**Success (200)**

```json
{
	"status": "success",
	"data": ["...sessions"],
	"count": 2
}
```

**Errors**

- 400 validation error
- 401 auth middleware error

### GET `/:classId/sessions/:sessionId`

Get class session detail.

A `TEACHER` caller gets `403 FORBIDDEN_COURSE` if the class isn't one they teach.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...session" }
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 404 `CLASS_SESSION_NOT_FOUND` (service error shape)

### PATCH `/:classId/sessions/:sessionId`

Update class session details.

**Request body**

```json
{
	"title": "Revision Session Updated",
	"classType": null
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...session" },
	"message": "Class session updated successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `CLASS_SESSION_NOT_FOUND` (service error shape)

### DELETE `/:classId/sessions/:sessionId`

Soft deletes a class session.

**Success (200)**

```json
{
	"status": "success",
	"data": { "...session" },
	"message": "Class session deleted successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `CLASS_SESSION_NOT_FOUND` (service error shape)
