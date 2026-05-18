# Attendance API Endpoints

This document describes the attendance endpoints in the backend.

## Base URL

```
http://localhost:5000/api/attendance
```

## Cookies

The attendance endpoints require authentication (except for the Zoom webhook). They use the standard `access_token` HTTP-only cookie.

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
| GET | `/session/:sessionId` | `ADMIN`, `STAFF` | Get all attendance for a specific session. |
| GET | `/class/:classId` | `ADMIN`, `STAFF` | Get paginated attendance for a course. |
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

Zoom webhook endpoint for `meeting.participant_joined`. Uses upsert to handle reconnect storms. No authentication required (secured by Zoom's webhook challenge flow and implicit knowledge of meetings).

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

- 401 unauthorized (requires ADMIN or STAFF role)
- 404 `CLASS_SESSION_NOT_FOUND`

### GET `/class/:classId`

Get paginated attendance history across all sessions in a specific course.

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

- 401 unauthorized (requires ADMIN or STAFF role)
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
