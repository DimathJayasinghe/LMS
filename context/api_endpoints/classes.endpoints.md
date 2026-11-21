
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

> **Secure class artwork completed 2026-08-20:** arbitrary client-supplied image URLs are no longer
> accepted by create/update. The owner or SUPER_ADMIN uses a course-bound presign → public-R2 PUT →
> confirm flow. Confirmation checks stored size/MIME, fully decoded content, and exact dimensions
> before exposing a server-built CDN URL; replacement/removal cleans up tracked keys.

- **Course create/update** now requires `subjectId` and (for SUPER_ADMIN) `teacherId`; a TEACHER creating a course owns it automatically.
- Course responses include server-controlled `bannerUrl` / `backdropUrl` and accessible alt text.
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
	"bannerAlt": "Students solving equations",
	"backdropUrl": "https://.../backdrop.png",
	"backdropAlt": "Physics laboratory equipment",
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
	"zoomMeetingId": null,
	"liveScheduled": true,
	"hasRecording": false,
	"courseId": "uuid",
	"deletedAt": null,
	"createdAt": "2026-05-13T06:00:00.000Z",
	"updatedAt": "2026-05-13T06:00:00.000Z"
}
```

`hasRecording` is `true` when the session has at least one `READY` recording. Every role that may read sessions sees it, including front desk, who cannot open recordings; it carries no count or identifier.

## Endpoints Summary

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/public` | None (public) | List active courses, marketing-safe fields only. |
| POST | `/` | ADMIN, STAFF | Create a class (course). |
| GET | `/` | Any authenticated | List classes. |
| GET | `/:classId` | Any authenticated | Get class detail. |
| PATCH | `/:classId` | ADMIN, STAFF | Update class (including active status). |
| POST | `/:classId/assets/upload-url` | Owning TEACHER, SUPER_ADMIN | Authorize a course-bound image upload. |
| POST | `/:classId/assets/confirm` | Owning TEACHER, SUPER_ADMIN | Decode, verify, and attach uploaded artwork. |
| PATCH | `/:classId/assets/:kind/alt` | Owning TEACHER, SUPER_ADMIN | Edit accessible description without re-uploading. |
| DELETE | `/:classId/assets/:kind` | Owning TEACHER, SUPER_ADMIN | Remove `banner` or `backdrop` and tracked object. |
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
			"bannerAlt": "Students solving equations",
			"backdropUrl": "https://.../backdrop.png",
			"backdropAlt": "Physics laboratory equipment",
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
	"teacherId": "uuid"
}
```

- `subjectId` — **required**. `teacherId` — required when the caller is `SUPER_ADMIN`; omitted by a `TEACHER` (they own it).
- Image URLs are intentionally rejected as unknown fields. Create the class first, then use the asset flow.

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

### POST `/:classId/assets/upload-url`

Owning TEACHER or SUPER_ADMIN. Allowed types are `image/jpeg`, `image/png`, and `image/webp`;
SVG is rejected. Maximum size is 8 MB.

```json
{
	"kind": "BANNER",
	"fileName": "physics-banner.png",
	"contentType": "image/png",
	"fileSizeBytes": 245760
}
```

The server ignores the filename for placement and creates a randomized key under the matching
`courses/<classId>/<kind>/` prefix.

```json
{
	"status": "success",
	"data": {
		"uploadUrl": "https://signed-r2-put...",
		"key": "courses/<classId>/banner/<uuid>.png",
		"expiresAt": "2026-08-20T15:15:00.000Z",
		"requiredWidth": 1600,
		"requiredHeight": 600,
		"maxSizeBytes": 8388608
	}
}
```

The browser PUTs the raw file to `uploadUrl` with the same `Content-Type`.

### POST `/:classId/assets/confirm`

Requires `Idempotency-Key`.

```json
{
	"kind": "BANNER",
	"key": "courses/<classId>/banner/<uuid>.png",
	"altText": "Students solving equations"
}
```

The key must match the class and kind. Confirmation rechecks the stored 8 MB limit and MIME,
applies a libvips pixel limit, fully decodes JPG/PNG/WebP content, and requires exact dimensions:

- `BANNER`: 1600×600 pixels (8:3).
- `BACKDROP`: 1920×1080 pixels (16:9).

On success the response contains the updated Class shape. Invalid uploaded objects are deleted
best-effort. Relevant errors: `FORBIDDEN_COURSE`, `FORBIDDEN_KEY`, `UPLOAD_NOT_FOUND`,
`UPLOAD_TOO_LARGE`, `INVALID_IMAGE_TYPE`, `IMAGE_TYPE_MISMATCH`, `INVALID_IMAGE_CONTENT`, and
`INVALID_IMAGE_DIMENSIONS`. A concurrent replacement returns `409 COURSE_ASSET_CHANGED` and the
stale request's newly uploaded object is deleted best-effort.

### PATCH `/:classId/assets/:kind/alt`

`kind` is `banner` or `backdrop`. Requires `Idempotency-Key` and an existing image.

```json
{ "altText": "Students solving equations" }
```

The non-empty description is trimmed and limited to 200 characters. The owning TEACHER or
SUPER_ADMIN can update it without re-uploading the file. Returns the updated Class shape; returns
`409 COURSE_ASSET_NOT_FOUND` if no image exists.
If another request replaces/removes the image between read and write, this endpoint returns
`409 COURSE_ASSET_CHANGED` instead of editing the newer asset.

### DELETE `/:classId/assets/:kind`

`kind` is `banner` or `backdrop`. Requires `Idempotency-Key`. Clears URL/key/alt text and deletes a
tracked public-R2 object best-effort. It also clears legacy external URLs that predate tracked keys.
Repeated removal is safe and returns the current Class shape.
Concurrent change returns `409 COURSE_ASSET_CHANGED` rather than clearing the newer image.

### POST `/:classId/sessions`

Create a class session. Creating, updating, soft-deleting, and scheduling a session require an
`Idempotency-Key` UUID.

**Request body**

```json
{
	"title": "Revision Session",
	"description": "...",
	"classType": "ONLINE",
	"date": "2026-05-13T10:00:00.000Z",
	"durationMinutes": 90
}
```

Clients cannot paste provider links or meeting IDs. For an online session, an owning teacher or
SUPER_ADMIN calls the audited live-class schedule endpoint. Session reads expose `liveScheduled`;
students receive `zoomMeetingId: null`, while authorized operational staff retain the meeting
number only for attendance reconciliation.

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

Update class session details. Requires an `Idempotency-Key` UUID. A null `classType` means in hall + live stream; `ONLINE` means online only and `PHYSICAL` means in hall only. Changing the date or duration does not reschedule an existing Zoom meeting. Changing a session with an existing meeting to `PHYSICAL` returns `409 SESSION_HAS_LIVE_CLASS`.

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
- 409 `SESSION_HAS_LIVE_CLASS` when changing an existing live class to hall only

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
