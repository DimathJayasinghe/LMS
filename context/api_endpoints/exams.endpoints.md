# Exams API Endpoints

This document describes the exam system endpoints in the LMS backend.

## Base URL

```
http://localhost:5000/api/exams
```

## Auth

All exam endpoints require the `access_token` cookie.

## Roles (Current Implementation)

The Prisma enum currently uses `ADMIN`, `STAFF`, `MARKER`, and `STUDENT`.

Temporary mapping for this phase:

- `ADMIN` = Super Admin (full access)
- `STAFF` = Admin (daily ops)

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
    { "field": "title", "message": "Required" }
  ]
}
```

### Service error (AppError)

```json
{
  "status": "error",
  "message": "Exam not found.",
  "code": "EXAM_NOT_FOUND"
}
```

## Exam Record Shape

```json
{
  "id": "uuid",
  "title": "2026 Term 1 MCQ",
  "type": "MCQ",
  "paperPdfUrl": null,
  "mcqPayload": { "questions": [] },
  "startTime": "2026-05-19T09:00:00.000Z",
  "endTime": "2026-05-19T10:00:00.000Z",
  "totalMarks": 100,
  "isPublished": false,
  "courseId": "uuid",
  "deletedAt": null,
  "createdAt": "2026-05-19T08:00:00.000Z",
  "updatedAt": "2026-05-19T08:00:00.000Z"
}
```

### Notes

- `paperPdfUrl` is returned as a presigned URL for students only within the exam time window.
- `mcqPayload` for students excludes `isCorrect` and is returned only inside the exam window.
- Admins always receive full MCQ payloads and can access paper URLs at any time.

## Endpoint Summary

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/` | ADMIN | Create a new exam. |
| GET | `/` | Any authenticated | List exams (filterable). |
| GET | `/:id` | Any authenticated | Get exam details (time-gated for students). |
| PATCH | `/:id` | ADMIN | Update an exam. |
| DELETE | `/:id` | ADMIN | Soft delete an exam. |
| POST | `/:id/upload-url` | ADMIN | Generate presigned upload URL for paper PDF. |
| POST | `/:id/assign-markers` | ADMIN | Assign markers to an exam. |

## Endpoint Details

### POST `/`

Create a new exam.

**Request body**

```json
{
  "title": "2026 Term 1 MCQ",
  "type": "MCQ",
  "courseId": "uuid",
  "startTime": "2026-05-19T09:00:00.000Z",
  "endTime": "2026-05-19T10:00:00.000Z",
  "totalMarks": 100,
  "mcqPayload": {
    "questions": [
      {
        "id": "q1",
        "text": "Which are prime numbers?",
        "order": 1,
        "marks": 2,
        "options": [
          { "id": "o1", "text": "2", "isCorrect": true },
          { "id": "o2", "text": "4", "isCorrect": false }
        ]
      }
    ]
  }
}
```

**Rules**

- `startTime` must be before `endTime`.
- `mcqPayload` is required for `MCQ` and `HYBRID` exams.
- `paperPdfUrl` is only allowed for `WRITTEN`, `HYBRID`, and `INCLASS` exams.

**Success (201)**

```json
{
  "status": "success",
  "data": { "...exam" },
  "message": "Exam created successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)

### GET `/`

List exams. Non-admin users only see non-deleted exams.

**Query params**

- `courseId`: UUID of the course
- `type`: `MCQ` | `WRITTEN` | `HYBRID` | `INCLASS`
- `status`: `all` | `upcoming` | `active` | `ended` (default `all`)

**Success (200)**

```json
{
  "status": "success",
  "data": ["...exams"],
  "count": 2
}
```

**Errors**

- 400 validation error
- 401 auth middleware error

### GET `/:id`

Get a single exam. Student responses are time-gated.

**Success (200)**

```json
{
  "status": "success",
  "data": { "...exam" }
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 404 `EXAM_NOT_FOUND`

### PATCH `/:id`

Update exam details.

**Request body** (partial)

```json
{
  "title": "2026 Term 1 MCQ (Updated)",
  "endTime": "2026-05-19T10:30:00.000Z"
}
```

**Success (200)**

```json
{
  "status": "success",
  "data": { "...exam" },
  "message": "Exam updated successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `EXAM_NOT_FOUND`

### DELETE `/:id`

Soft delete an exam.

**Success (200)**

```json
{
  "status": "success",
  "data": { "...exam" },
  "message": "Exam deleted successfully."
}
```

**Errors**

- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `EXAM_NOT_FOUND`

### POST `/:id/upload-url`

Generate a presigned upload URL for a PDF exam paper.

**Request body**

```json
{
  "fileName": "paper-2026-term-1.pdf",
  "contentType": "application/pdf",
  "fileSizeBytes": 1048576
}
```

**Success (200)**

```json
{
  "status": "success",
  "data": {
    "uploadUrl": "https://...",
    "paperKey": "exams/<examId>/paper-2026-term-1.pdf",
    "expiresAt": "2026-05-19T09:15:00.000Z"
  },
  "message": "Upload URL generated successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `EXAM_NOT_FOUND`
- 503 `R2_NOT_CONFIGURED` or `R2_BUCKET_MISSING`

### POST `/:id/assign-markers`

Assign markers to an exam.

**Request body**

```json
{
  "markerIds": ["uuid-1", "uuid-2"]
}
```

**Success (200)**

```json
{
  "status": "success",
  "data": {
    "examId": "uuid",
    "assignedMarkerIds": ["uuid-1", "uuid-2"],
    "assignedCount": 2
  },
  "message": "Markers assigned successfully."
}
```

**Errors**

- 400 validation error
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `EXAM_NOT_FOUND`
- 400 `INVALID_MARKER_IDS`
