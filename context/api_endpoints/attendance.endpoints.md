# Attendance API Endpoints

This document describes the attendance endpoints in the backend.

## Base URL

```
http://localhost:5000/api/attendance
```

## Cookies

The attendance endpoints require authentication (except for the Zoom webhook). They use the standard `access_token` HTTP-only cookie.

## Roles & recent changes (2026-08-17)

Enum: `SUPER_ADMIN/TEACHER/ADMIN/MARKER/STUDENT`. In the tables below, `ADMIN` = **`SUPER_ADMIN`** and `STAFF` = **`ADMIN`** (front-desk scans at the entrance).

- `AttendanceSource` includes **`QR`** alongside `BARCODE`, `ZOOM_WEBHOOK`, and `MANUAL`.
- Entrance scanning is institute-aware for the session (the institute must match the timetable slot),
  but a **code identifies exactly one student across the LMS card (`User.barcode`) and every
  institute card (`StudentBarcode`)** (2026-11-21, audit F-07). One shared resolver
  (`scan-code.service.ts`) serves the scanner and the desk's `GET /users/resolve-barcode`; a code held
  by several students is refused with `409 AMBIGUOUS_CODE`, never guessed, and the desk searches by
  index number or name instead. Codes are compared case-insensitively. Writers of every code kind
  check uniqueness under a lock (see `users.endpoints.md` and `account-setup.endpoints.md`).
- **`TEACHER` can now read attendance for their own courses (2026-07-10)** — `GET /session/:sessionId`
  and `GET /class/:classId` were `SUPER_ADMIN`+`ADMIN` only; added `TEACHER`, scoped via
  `assertCourseAccess` (same ownership gate as session/exam/video mutations).
- **`GET /student/:userId` is role-scoped (2026-11-21, audit F-09).** Owner and front desk read any
  student; a `TEACHER` sees only rows from their own courses; a `STUDENT` only their own history;
  `MARKER` is refused. The route now has a role gate (`FORBIDDEN_ROLE`), the target must be a student,
  and history rows omit the student's email and barcode.
- **Zoom reconciliation is available to `SUPER_ADMIN` and the owning `TEACHER` (2026-08-17).**
  A read-only preview compares Zoom's completed-meeting participants with LMS attendance; the
  idempotent apply endpoint inserts only missing, actively enrolled students and writes an audit
  event. Front-desk `ADMIN` remains read-only for online attendance.

## Attendance channels — current state vs. intent (clarified 2026-07-10)

There are three intended ways attendance gets marked; here's exactly what's real today for each,
since the schema anticipates more than the code currently does:

1. **Entrance scan (`POST /scan`).** The request carries an institute and a device source. The
   service resolves the code to one student across both code kinds (an ambiguous code is refused). A
   timetable-generated session can only be scanned at its configured institute. Keyboard-wedge
   input records `BARCODE`; camera input records `QR`.
   - **Frontend (updated 2026-08-13):** the staff `/attendance` scanner (`StaffScanner`) supports
     institute → class → session selection, then check-in by **keyboard-wedge** (a focused field a
     scan-gun types into + Enter) **or camera QR** (`@zxing/browser`), with a live source-labelled roster and a
     **manual mark-by-name** fallback (`GET /users?search` → `POST /manual`). ⚠️ **Camera mode needs
     a secure context** — `getUserMedia` only works over **HTTPS or `localhost`**; on a plain-HTTP
     LAN IP the camera is hidden and staff use the wedge field.
2. **Live Zoom join (`POST /zoom-webhook`).** Fully automatic — Zoom's `meeting.participant_joined`
   webhook fires on join, matched by `classSession.zoomMeetingId`. This is real and working
   (subject to real Zoom credentials being configured — see `live-class.endpoints.md`).
3. **Recorded video watch (`POST /video`).** **Wired (2026-07-12).** `VideoPlayer.tsx` now attaches
   to Bunny's iframe via **Player.js** and fires `POST /attendance/video { classSessionId }` **once**
   the student has actually watched **≥ 30s** (accumulated forward playback only — seeks/scrubs don't
   count; `lib/watch.ts` `accumulateWatch`), or on `ended` for shorter clips. Best-effort (never
   blocks/erroring over the player). The endpoint upserts (`source: ZOOM_WEBHOOK`, unchanged) and is
   now **enrollment-gated**: `markVideoAttendance` runs `assertStudentContentAccess(actor, courseId,
   { requirePaid: false })`, so a student can only mark attendance for a course they're enrolled in
   (previously any student could POST for any session). Payment is already enforced when the stream
   token is issued, so enrollment is the gate here.
4. **Completed-meeting recovery (`GET/POST /session/:sessionId/reconciliation`).** The report uses
   Zoom's past-meeting participants endpoint after a meeting ends. It matches the server-controlled
   `(#indexNumber)` display-name suffix first and email as a fallback, refuses conflicting matches,
   excludes students without an active enrollment in the course, and aggregates reconnect rows.
   The `/attendance` report UI previews before applying. The Zoom Server-to-Server
   OAuth app needs `meeting:read:list_past_participants:admin` (or the equivalent admin meeting-read
   scope), and the account must be Pro or higher.

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
| POST | `/scan` | `ADMIN`, `STAFF` | Institute-aware QR/barcode check-in (upsert). |
| POST | `/zoom-webhook` | None | Webhook from Zoom for `participant.joined`. |
| POST | `/manual` | `ADMIN`, `STAFF` | Manually mark attendance (reconciliation). |
| POST | `/video` | `STUDENT` | Log attendance on video playback. |
| GET | `/session/:sessionId/reconciliation` | `SUPER_ADMIN`, `TEACHER`* | Preview Zoom/LMS attendance differences without writing. |
| POST | `/session/:sessionId/reconciliation` | `SUPER_ADMIN`, `TEACHER`* | Idempotently add matched missing rows and audit the action. |
| GET | `/session/:sessionId` | `SUPER_ADMIN`, `ADMIN`, `TEACHER`* | Get all attendance for a specific session. |
| GET | `/class/:classId` | `SUPER_ADMIN`, `ADMIN`, `TEACHER`* | Get paginated attendance for a course. |
| GET | `/student/:userId` | `SUPER_ADMIN`, `ADMIN`, `TEACHER`*, `STUDENT` (own) | Get a student's attendance history (role-scoped). |

## Endpoint Details

### POST `/scan`

Admin scans a student's code at a physical institute. Uses upsert to prevent duplicate records
from rapid scans. The code is resolved to one student across the LMS `User.barcode` and every
institute `StudentBarcode` (case-insensitive); several holders is `409 AMBIGUOUS_CODE`. If the session
came from a timetable slot, its configured institute must match.

**Request body**

```json
{
	"barcode": "ABC-12345",
	"classSessionId": "uuid",
	"instituteId": "uuid",
	"source": "BARCODE"
}
```

`barcode` is trimmed printable ASCII, 3–64 characters. `source` accepts `BARCODE` or `QR` and defaults to `BARCODE` for older clients.

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
- 404 `INSTITUTE_NOT_FOUND`
- 404 `BARCODE_NOT_FOUND`
- 409 `AMBIGUOUS_CODE` (the code matches more than one student; no attendance is written)
- 409 `SESSION_INSTITUTE_MISMATCH`

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
*Note: A verified participant event returns 200 OK even if the student or meeting is not found.*

**Zoom URL validation (endpoint.url_validation)**

Zoom expects a raw response payload with `plainToken` and `encryptedToken` (no standard wrapper). The token must contain 8–64 ASCII letters, digits, underscores or hyphens. Validation requests with either signature header must pass the same signature and timestamp checks as other events. Other events require both headers and a timestamp within five minutes. The route is limited to 60 requests per minute per IP by default; `ZOOM_WEBHOOK_RATE_LIMIT_MAX` changes that limit. Re-run endpoint validation in Zoom staging after deployment and verify a real participant event before production deployment.

### GET `/session/:sessionId/reconciliation`

Fetch a read-only Zoom comparison for an ended live session. `TEACHER` is restricted to the
course they own. A matched participant is syncable only when the user is an active `STUDENT`, has
an active enrollment in the session's course, and does not already have attendance for the session.
Unknown, conflicting, and not-enrolled identities are returned for review and are never inserted.

**Success (200)**

```json
{
  "status": "success",
  "data": {
    "sessionId": "uuid",
    "zoomMeetingId": "123456789",
    "summary": {
      "zoomRows": 4,
      "matchedStudents": 2,
      "alreadyRecorded": 1,
      "missing": 1,
      "unmatched": 1,
      "ignored": 1
    },
    "participants": [],
    "unmatched": []
  }
}
```

### POST `/session/:sessionId/reconciliation`

Re-fetch and apply the current comparison. Requires an `Idempotency-Key` UUID header and no request
body. The database's `(userId, classSessionId)` unique constraint and `createMany(skipDuplicates)`
make concurrent/repeated application safe. Writes `ATTENDANCE_RECONCILED` to the audit trail.

**Errors for both reconciliation endpoints**

- 403 `FORBIDDEN_COURSE` — teacher does not own the course
- 404 `CLASS_SESSION_NOT_FOUND`
- 409 `LIVE_CLASS_NOT_SCHEDULED`
- 409 `ZOOM_ATTENDANCE_NOT_READY` — meeting has not ended or Zoom has not processed it yet
- 429 `ZOOM_RATE_LIMITED`
- 502 `ZOOM_PARTICIPANTS_FAILED`

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

Get a student's attendance history, newest first. Who sees what:

- `SUPER_ADMIN` and `ADMIN`: any student, including a deactivated one.
- `TEACHER`: only rows from sessions of courses they teach (other courses' rows are omitted, not refused).
- `STUDENT`: only their own history.
- `MARKER`: refused.

The target must be an active-or-deactivated `STUDENT`; a staff id or an unknown id returns `404 USER_NOT_FOUND`, and a deactivated student is `404` for a teacher. Rows from deleted sessions are omitted. Each row carries only `user.id`, `user.name` and `user.indexNumber` for the student (no email or barcode) plus the session summary (`id`, `title`, `date`, `courseId`).

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
- 403 `FORBIDDEN_ROLE` (a role outside the table above, such as `MARKER`)
- 403 `FORBIDDEN` (student attempting to view another student's history)
- 404 `USER_NOT_FOUND` (unknown id, not a student, or a deactivated student for a teacher)
