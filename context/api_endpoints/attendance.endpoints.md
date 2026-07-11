# Attendance API Endpoints

This document describes the attendance endpoints in the backend.

## Base URL

```
http://localhost:5000/api/attendance
```

## Cookies

The attendance endpoints require authentication (except for the Zoom webhook). They use the standard `access_token` HTTP-only cookie.

## Roles & recent changes (2026-07-09)

Enum: `SUPER_ADMIN/TEACHER/ADMIN/MARKER/STUDENT`. In the tables below, `ADMIN` = **`SUPER_ADMIN`** and `STAFF` = **`ADMIN`** (front-desk scans at the entrance).

- `AttendanceSource` now includes **`QR`** (default) alongside `BARCODE`, `ZOOM_WEBHOOK`, `MANUAL`.
- Institute-scoped scanning (`(instituteId, barcode) → student`, per-institute barcodes) is a follow-up.
- **`TEACHER` can now read attendance for their own courses (2026-07-10)** — `GET /session/:sessionId`
  and `GET /class/:classId` were `SUPER_ADMIN`+`ADMIN` only; added `TEACHER`, scoped via
  `assertCourseAccess` (same ownership gate as session/exam/video mutations).

## Attendance channels — current state vs. intent (clarified 2026-07-10)

There are three intended ways attendance gets marked; here's exactly what's real today for each,
since the schema anticipates more than the code currently does:

1. **Entrance scan (`POST /scan`).** Today this is the **only** scan path, and it resolves purely
   via `User.barcode` (the LMS QR — see `account-setup.endpoints.md`). It always writes
   `source: BARCODE` regardless of whether the front-desk device read a QR code or a plain
   barcode — **`AttendanceSource.QR` is defined in the schema but no code path currently produces
   it.** It does **not** use `StudentBarcode`/`instituteId` at all — an institute's own barcode
   reader scanning a student's institute-issued card has no way to resolve through our system
   yet. Wiring `/scan` (or a new institute-scoped variant) to also check `(instituteId, barcode) →
   student` via `StudentBarcode` is the real follow-up here, not just a docs note.
2. **Live Zoom join (`POST /zoom-webhook`).** Fully automatic — Zoom's `meeting.participant_joined`
   webhook fires on join, matched by `classSession.zoomMeetingId`. This is real and working
   (subject to real Zoom credentials being configured — see `live-class.endpoints.md`).
3. **Recorded video watch (`POST /video`).** The **backend** endpoint is real (`STUDENT`-only,
   upserts attendance immediately on call, tagged `source: ZOOM_WEBHOOK` "same as online" per the
   service comment) — but **nothing on the frontend calls it**. `VideoPlayer.tsx` doesn't invoke
   `POST /attendance/video` anywhere, so watching a recording currently marks no attendance at
   all in practice. There's also no watch-duration/completion gating server-side (it fires
   immediately on the first call) — if this gets wired up, decide then whether "started playing"
   is enough or a minimum watched-duration should gate it.

## Attendance Record Shape

Returned in most endpoints:

```json
{
	"id": "uuid",
	"source": "BARCODE", 
	"scannedAt": "2026-05-18T09:32:03.340Z",
	"lastSeenAt": "2026-05-18T09:32:03.340Z",
	"userId": "uuid",
	"classSessionId": "uuid",
	"createdAt": "2026-05-18T09:32:03.340Z",
	"updatedAt": "2026-05-18T09:32:03.340Z",
	"user": {
		"id": "uuid",
		"name": "Student Name",
		"email": "student@example.com",
		"indexNumber": 123,
		"barcode": "ABC-123"
	},
	"classSession": {
		"id": "uuid",
		"title": "Class Title",
		"date": "2026-05-18T09:32:03.340Z",
		"courseId": "uuid"
	}
}
```
*Note: `user` and `classSession` relations are not included in the `/zoom-webhook` and `/video` endpoint responses to optimize performance, but are present in queries and manual entry endpoints.*

## Endpoints Summary

| Method | Path | Auth Roles | Description |
| --- | --- | --- | --- |
| POST | `/scan` | `ADMIN`, `STAFF` | Scan barcode to log attendance (upsert). |
| POST | `/zoom-webhook` | None | Webhook from Zoom for `participant.joined`. |
| POST | `/manual` | `ADMIN`, `STAFF` | Manually mark attendance (reconciliation). |
| POST | `/video` | `STUDENT` | Log attendance on video playback. |
| GET | `/session/:sessionId` | `SUPER_ADMIN`, `ADMIN`, `TEACHER`* | Get all attendance for a specific session. |
| GET | `/class/:classId` | `SUPER_ADMIN`, `ADMIN`, `TEACHER`* | Get paginated attendance for a course. |
| GET | `/student/:userId` | Any | Get student's attendance history (role-scoped). |

## Endpoint Details

### POST `/scan`

Admin scans a student's barcode at the physical entrance. Uses upsert to prevent duplicate records from rapid scans.

**Request body**

```json
{
	"barcode": "ABC-12345",
	"classSessionId": "uuid"
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...attendanceRecord" },
	"message": "Attendance recorded successfully."
}
```

**Errors**

- 400 validation error
- 400 `INVALID_ROLE_FOR_ATTENDANCE` (user is not a student)
- 403 `STUDENT_DEACTIVATED`
- 404 `CLASS_SESSION_NOT_FOUND`
- 404 `BARCODE_NOT_FOUND`

### POST `/zoom-webhook`

Zoom webhook endpoint for `meeting.participant_joined`. Uses upsert to handle reconnect storms. Verified using Zoom's webhook signature headers (`x-zm-request-timestamp`, `x-zm-signature`) and `ZOOM_WEBHOOK_SECRET`.

**Request body**

```json
{
	"event": "meeting.participant_joined",
	"payload": {
		"object": {
			"id": "1234567890",
			"participant": {
				"user_id": "zoom_user_1",
				"user_name": "John Doe",
				"email": "student@example.com",
				"join_time": "2026-05-18T10:00:00Z"
			}
		}
	}
}
```

**Success (200)**

```json
{
	"status": "success",
	"message": "Webhook processed."
}
```
*Note: Always returns 200 OK to Zoom to prevent webhook retries, even if the student or meeting isn't found.*

**Zoom URL validation (endpoint.url_validation)**

Zoom expects a raw response payload with `plainToken` and `encryptedToken` (no standard wrapper).

### POST `/manual`

Manually mark attendance for a student (admin reconciliation fallback).

**Request body**

```json
{
	"userId": "uuid",
	"classSessionId": "uuid"
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...attendanceRecord" },
	"message": "Attendance manually recorded."
}
```

**Errors**

- 400 validation error
- 400 `INVALID_ROLE_FOR_ATTENDANCE`
- 403 `STUDENT_DEACTIVATED`
- 404 `CLASS_SESSION_NOT_FOUND`
- 404 `USER_NOT_FOUND`

### POST `/video`

Student logs attendance for watching a recorded video.

**Request body**

```json
{
	"classSessionId": "uuid"
}
```

**Success (200)**

```json
{
	"status": "success",
	"data": { "...attendanceRecordWithoutRelations" },
	"message": "Video attendance recorded."
}
```

**Errors**

- 400 validation error
- 401 unauthorized (requires STUDENT role)
- 404 `CLASS_SESSION_NOT_FOUND`

### GET `/session/:sessionId`

Get a list of all attendance records for a specific class session.

> **`TEACHER`-scoped (2026-07-10):** a `TEACHER` may only view sessions belonging to a course they
> own (`assertCourseAccess`, the same ownership gate used by session/exam/video mutations —
> `context/documents/06-progress-tracker.md` Phase S). `SUPER_ADMIN`/`ADMIN` are unrestricted.

**Success (200)**

```json
{
	"status": "success",
	"data": [
		{ "...attendanceRecord" }
	],
	"count": 1
}
```

**Errors**

- 401 unauthorized (requires SUPER_ADMIN, ADMIN, or TEACHER)
- 403 `FORBIDDEN_COURSE` — TEACHER does not own the session's course
- 404 `CLASS_SESSION_NOT_FOUND`

### GET `/class/:classId`

Get paginated attendance history across all sessions in a specific course.

> **`TEACHER`-scoped (2026-07-10):** same `assertCourseAccess` gate as `/session/:sessionId` above
> — a TEACHER only sees courses they own.

**Query Parameters**

- `page` (optional, default: 1)
- `limit` (optional, default: 20, max: 100)

**Success (200)**

```json
{
	"status": "success",
	"data": [
		{ "...attendanceRecord" }
	],
	"count": 1,
	"page": 1,
	"limit": 20
}
```

**Errors**

- 401 unauthorized (requires SUPER_ADMIN, ADMIN, or TEACHER)
- 403 `FORBIDDEN_COURSE` — TEACHER does not own the course
- 404 `CLASS_NOT_FOUND`

### GET `/student/:userId`

Get a student's attendance history. Students can only view their own history. Admins can view any student's history.

**Query Parameters**

- `page` (optional, default: 1)
- `limit` (optional, default: 20, max: 100)

**Success (200)**

```json
{
	"status": "success",
	"data": [
		{ "...attendanceRecord" }
	],
	"count": 1,
	"page": 1,
	"limit": 20
}
```

**Errors**

- 401 unauthorized
- 403 `FORBIDDEN` (student attempting to view another student's history)
- 404 `USER_NOT_FOUND`
