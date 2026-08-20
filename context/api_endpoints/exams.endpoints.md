# Exams API Endpoints

This document describes the exam system endpoints in the LMS backend.

## Base URL

```
http://localhost:5000/api/exams
```

## Auth

All exam endpoints require the `access_token` cookie.

## Roles

Enum: `SUPER_ADMIN`, `TEACHER`, `ADMIN`, `MARKER`, `STUDENT`.

- **Manage exams** (create/update/delete/upload-url/assign-markers) — `SUPER_ADMIN` or the course's `TEACHER` (own courses only).
- **Read** — `SUPER_ADMIN` sees all; `TEACHER` own courses; `MARKER` only assigned exams (paper yes, MCQ answers stripped); `STUDENT` enrolled courses only, paper/MCQ returned only within the exam window and answers stripped. Front-desk `ADMIN` has no read access at all.

> **Reading older tables below**: `ADMIN` now means **`SUPER_ADMIN`**; course-content routes now also allow the owning **`TEACHER`**.

## What changed (2026-07-09)

- One exam serves both online + physical cohorts. New flags: **`allowTypedAnswers`**, **`allowPdfUpload`** (default `true`) control the submission channels.
- `type`: `MCQ` | `WRITTEN` | `HYBRID` | `INCLASS`; `HYBRID` = mixed paper (MCQ + structured/essay).
- Student exam reads are gated to enrolled courses (`403 NOT_ENROLLED`).

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
  "allowTypedAnswers": true,
  "allowPdfUpload": true,
  "courseId": "uuid",
  "deletedAt": null,
  "createdAt": "2026-05-19T08:00:00.000Z",
  "updatedAt": "2026-05-19T08:00:00.000Z"
}
```

### Notes

- `allowTypedAnswers` / `allowPdfUpload` are returned on both list and detail reads (2026-07-10) so the client knows which written-answer channels the exam accepts.
- `paperPdfUrl` is returned as a presigned URL for `STUDENT` only within the exam time window (`SUPER_ADMIN`/`TEACHER`/`MARKER` receive it at any time — see line below).
- `mcqPayload` for students excludes `isCorrect` and is returned only inside the exam window.
- `SUPER_ADMIN`/`TEACHER` always receive full MCQ payloads and can access paper URLs at any time (`MARKER` receives the paper but has `isCorrect` stripped; front-desk `ADMIN` has no exam access — see GET `/`/`/:id` below).

## Endpoint Summary

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/` | SUPER_ADMIN, TEACHER (own) | Create a new exam. |
| GET | `/` | SUPER_ADMIN, TEACHER, MARKER, STUDENT | List exams (filterable). |
| GET | `/:id` | SUPER_ADMIN, TEACHER, MARKER, STUDENT | Get exam details (time-gated for students). |
| PATCH | `/:id` | SUPER_ADMIN, TEACHER (own) | Update an exam. |
| DELETE | `/:id` | SUPER_ADMIN, TEACHER (own) | Soft delete an exam. |
| POST | `/:id/upload-url` | SUPER_ADMIN, TEACHER (own) | Generate presigned upload URL for paper PDF. |
| POST | `/:id/assign-markers` | SUPER_ADMIN, TEACHER (own) | Assign markers to an exam. |
| GET | `/:id/markers` | SUPER_ADMIN, TEACHER (own) | List the exact marker assignment set. |
| PUT | `/:id/markers` | SUPER_ADMIN, TEACHER (own) | Replace the exact marker assignment set; idempotency key required. |

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

List exams, scoped by the caller's role: `SUPER_ADMIN` sees all; `TEACHER` sees only their own
courses' exams; `MARKER` sees only exams they are assigned to; `STUDENT` sees only exams for courses
they are actively enrolled in. Front-desk `ADMIN` has **no exam access** (`403`). Non-`SUPER_ADMIN`
callers never see soft-deleted exams.

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
- 403 `FORBIDDEN` (front-desk `ADMIN`, or any role without exam-read access)

### GET `/:id`

Get a single exam. Student responses are time-gated. A `MARKER` assigned to the exam receives the question paper but **not** the MCQ answer key (the `isCorrect` flags are stripped, as they are for students). `TEACHER`/`SUPER_ADMIN` receive the full payload.

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
- 403 `FORBIDDEN` (front-desk `ADMIN`, or any role without exam-read access)
- 403 `FORBIDDEN_COURSE` (a `TEACHER` calling for an exam whose course they don't teach)
- 403 `MARKER_NOT_ASSIGNED` (a `MARKER` requesting an exam they are not assigned to)
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

> Presign **persists nothing** (changed 2026-07-13). `paperPdfUrl` is written only by
> `POST /:id/paper/confirm` after the browser PUT, so a failed/blocked upload never marks a paper
> attached that isn't in R2. See `account-setup.endpoints.md` for the rationale.

### POST `/:id/paper/confirm`

Confirms the paper PDF reached R2 (HeadObject) and persists `paperPdfUrl`. Same role + MCQ/deleted
guards as the presign. Body: `{ "key": "exams/<examId>/paper.pdf" }` (must match this exam's key
prefix → `403 FORBIDDEN_KEY`). Errors: `409 UPLOAD_NOT_FOUND` if the object never landed. Idempotent.

### GET/PUT `/:id/markers` (2026-08-20)

Owning TEACHER or SUPER_ADMIN may list and replace the exact marker set. PUT accepts
`{ "markerIds": ["uuid"] }`, allows an empty set, requires `Idempotency-Key`, rejects inactive or
non-MARKER accounts, and emits `MARKERS_ASSIGNED`. The older additive `/assign-markers` route remains
for compatibility; new clients use the exact-set endpoint.

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
