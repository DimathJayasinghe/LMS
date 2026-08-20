# Submissions + Marking API Endpoints

> Step 9 — Students submit answers, markers grade, admin publishes results.

---

## Endpoints Overview

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/api/submissions` | STUDENT | Start submission (get upload URL or submit MCQ/typed) |
| PATCH | `/api/submissions/:id/complete` | STUDENT | Mark PDF upload as complete |
| GET | `/api/submissions/mine` | STUDENT | List the caller's own submissions (marks gated on publish) |
| GET | `/api/submissions/exam/:examId` | ADMIN, MARKER (assigned) | List submissions for an exam |
| PATCH | `/api/submissions/:id/marks` | MARKER (assigned) | Submit marks (idempotent) |
| POST | `/api/submissions/exam/:examId/publish` | ADMIN | Publish results for an exam |
| PATCH | `/api/submissions/:id/result-correction` | Owning TEACHER, SUPER_ADMIN | Correct a published result with an audited reason |

> **Roles updated (2026-07-09)**: `ADMIN` → **`SUPER_ADMIN`**; list + publish now also allow the exam's **`TEACHER`**; grading stays **`MARKER`** (assigned).
>
> **Released-result control (2026-08-20):** assigned markers may grade only before publication.
> After publication, only the owning TEACHER or SUPER_ADMIN may call `PATCH
> /:id/result-correction` with `{ marks, feedback?, reason }`. `reason` is required (5–500 chars),
> marks remain bounded by the exam total, and `RESULT_CORRECTED` records before/after/reason.
>
> **Typed answers (2026-07-10)**: alongside `answers` (MCQ) and `answerPdfUrl` (scanned upload), students may submit typed essay/structured answers via **`writtenAnswers`** (JSON, keyed by question/part). The exam's `allowTypedAnswers` / `allowPdfUpload` flags decide which channels are accepted. A typed-only written submission needs no PDF upload, so it finalizes immediately (`status = COMPLETED`, `marks = null` until a marker grades).

---

## POST `/api/submissions`

**Start Submission** — Students call this to begin their exam submission.

- **MCQ exams**: Answers are submitted inline and auto-graded immediately
- **WRITTEN exams**: Returns a presigned R2 upload URL for the answer PDF
- **HYBRID exams**: MCQ answers inline + upload URL for written portion

### Auth
- Requires: `access_token` cookie
- Role: `STUDENT`

### Request Body

```json
{
  "examId": "uuid",
  "fileName": "my-answers.pdf",          // Required for WRITTEN/HYBRID
  "contentType": "application/pdf",       // Required for WRITTEN/HYBRID
  "fileSizeBytes": 5242880,              // Required for WRITTEN/HYBRID (max 50MB)
  "answers": {                           // Required for MCQ/HYBRID
    "q1": ["o1", "o3"],
    "q2": ["o2"]
  },
  "writtenAnswers": {                    // Optional typed answers for WRITTEN/HYBRID
    "q3": "The derivation follows from …"  //   (only if allowTypedAnswers = true)
  }
}
```

**Written channel (WRITTEN / HYBRID):** the written portion must arrive via **exactly one** channel — either typed `writtenAnswers` (when `allowTypedAnswers`) **or** a PDF upload via `fileName`/`contentType`/`fileSizeBytes` (when `allowPdfUpload`). Typed-only submissions return no `uploadUrl` and are `COMPLETED` immediately; PDF submissions return an upload URL and stay `UPLOADING` until `PATCH /:id/complete`.

**Additional error codes:** `TYPED_NOT_ALLOWED` (400), `PDF_NOT_ALLOWED` (400), `WRITTEN_ANSWER_REQUIRED` (400 — neither channel supplied for a WRITTEN/HYBRID exam).

### Success Response (201)

```json
{
  "status": "success",
  "data": {
    "submission": {
      "id": "uuid",
      "status": "UPLOADING",
      "answerPdfUrl": "answers/examId/userId/file.pdf",
      "answers": null,
      "marks": null,
      "feedback": null,
      "examId": "uuid",
      "userId": "uuid",
      "submittedAt": "2026-05-20T08:00:00.000Z",
      "gradedAt": null,
      "updatedAt": "2026-05-20T08:00:00.000Z"
    },
    "uploadUrl": "https://r2-presigned-url...",
    "uploadKey": "answers/examId/userId/file.pdf",
    "uploadExpiresAt": "2026-05-20T08:15:00.000Z"
  },
  "message": "Submission started successfully."
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `EXAM_NOT_FOUND` | 404 | Exam doesn't exist or is deleted |
| `EXAM_NOT_STARTED` | 400 | Server time is before exam start |
| `EXAM_ENDED` | 400 | Server time is after exam end |
| `ALREADY_SUBMITTED` | 409 | Student already has a submission |
| `MCQ_ANSWERS_REQUIRED` | 400 | MCQ/HYBRID exam but no answers provided |
| `FILE_NAME_REQUIRED` | 400 | WRITTEN/HYBRID exam but no file name |
| `INVALID_QUESTION_ID` | 400 | Answer references unknown question |
| `INVALID_OPTION_ID` | 400 | Answer references unknown option |

---

## PATCH `/api/submissions/:id/complete`

**Complete Upload** — Called after the browser finishes uploading the PDF to R2.

### Auth
- Requires: `access_token` cookie
- Role: `STUDENT`

### URL Params
- `id` — Submission UUID

### Body (optional)
```json
{ "key": "answers/<examId>/<userId>/file.pdf" }
```
> Changed 2026-07-13: the PDF channel's presign (`POST /submissions`) no longer eagerly writes
> `answerPdfUrl`. The client passes the presigned `key` here; the server HeadObject-verifies it in R2
> and only then persists `answerPdfUrl` before flipping `status = COMPLETED` — so a blocked/failed
> PUT can't leave a "submitted" answer that isn't stored. The key must match
> `answers/<examId>/<callerId>/` (→ `403 FORBIDDEN_KEY`); a missing object → `409 UPLOAD_NOT_FOUND`.
> Typed-only/MCQ completions send no `key` and skip the R2 check.

### Success Response (200)

```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "status": "COMPLETED",
    "answerPdfUrl": "answers/examId/userId/file.pdf",
    "marks": null,
    "feedback": null,
    "submittedAt": "2026-05-20T08:00:00.000Z",
    "gradedAt": null
  },
  "message": "Submission marked as complete."
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `SUBMISSION_NOT_FOUND` | 404 | Submission doesn't exist |
| `FORBIDDEN` | 403 | Not the student's own submission |
| `EXAM_ENDED` | 400 | Exam window + grace period expired |

---

## GET `/api/submissions/mine`

**List My Submissions** — A student reads their **own** submissions across exams (or one exam via `?examId=`). This is how the student UI shows "already submitted" and, once published, the result.

### Auth
- Requires: `access_token` cookie
- Role: `STUDENT`

### Query Params

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `examId` | UUID | No | Restrict to a single exam. Omit to list all. |

### Success Response (200)

```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "status": "COMPLETED",
      "answers": { "q1": ["o1"] },
      "writtenAnswers": null,
      "answerPdfUrl": "https://presigned-download-url...",
      "marks": 85,
      "feedback": "Good work",
      "published": true,
      "examId": "uuid",
      "exam": { "id": "uuid", "title": "Physics Midterm", "type": "MCQ", "totalMarks": 100, "isPublished": true },
      "submittedAt": "2026-05-20T08:00:00.000Z",
      "gradedAt": "2026-05-20T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

> **`marks`, `feedback`, and `gradedAt` are `null` until the exam's results are published** (`exam.isPublished = true`). `answerPdfUrl` is a short-lived presigned URL to the student's own uploaded answer PDF (or `null`).

---

## GET `/api/submissions/exam/:examId`

**List Submissions** — View all submissions for a specific exam.

A `TEACHER` caller gets `403 FORBIDDEN_COURSE` if the exam's course isn't one they teach — distinct
from a `MARKER`'s `403 MARKER_NOT_ASSIGNED`, which checks assignment rather than course ownership.

### Auth
- Requires: `access_token` cookie
- Role: `ADMIN` or `MARKER` (must be assigned to the exam)

### URL Params
- `examId` — Exam UUID

### Query Params

| Param | Type | Default | Options |
|-------|------|---------|---------|
| `status` | string | `all` | `all`, `UPLOADING`, `COMPLETED` |
| `graded` | string | `all` | `all`, `graded`, `ungraded` |

> **Grading context (2026-07-10)**: the list now also returns `answers` (MCQ selections) and
> `writtenAnswers` (typed essay/structured answers) so the marker UI can grade without a second fetch.
> `answerPdfUrl` remains a short-lived presigned download URL (or `null`).

### Success Response (200)

```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "status": "COMPLETED",
      "answerPdfUrl": "https://presigned-download-url...",
      "answers": { "q1": ["o1"] },
      "writtenAnswers": { "q3": "The derivation follows from …" },
      "marks": 85,
      "feedback": "Good work",
      "submittedAt": "2026-05-20T08:00:00.000Z",
      "gradedAt": "2026-05-20T10:00:00.000Z",
      "user": {
        "id": "uuid",
        "name": "John Doe",
        "email": "john@example.com",
        "indexNumber": 42
      }
    }
  ],
  "count": 1
}
```

---

## PATCH `/api/submissions/:id/marks`

**Submit Marks** — Marker grades a specific submission.

### Auth
- Requires: `access_token` cookie
- Role: `MARKER` (must be assigned to the exam)
- Requires: `Idempotency-Key` header (UUID)

### URL Params
- `id` — Submission UUID

### Request Body

```json
{
  "marks": 85,
  "feedback": "Good work on the essay section."
}
```

### Success Response (200)

```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "status": "COMPLETED",
    "marks": 85,
    "feedback": "Good work on the essay section.",
    "gradedAt": "2026-05-20T10:00:00.000Z"
  },
  "message": "Marks submitted successfully."
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `SUBMISSION_NOT_FOUND` | 404 | Submission doesn't exist |
| `MARKER_NOT_ASSIGNED` | 403 | Marker not assigned to this exam |
| `SUBMISSION_INCOMPLETE` | 400 | Submission still uploading |
| `MARKS_EXCEED_TOTAL` | 400 | Marks > exam.totalMarks |

---

## POST `/api/submissions/exam/:examId/publish`

**Publish Results** — Makes marks visible to students.

### Auth
- Requires: `access_token` cookie
- Role: `ADMIN` (Super Admin)

### URL Params
- `examId` — Exam UUID

### Success Response (200)

```json
{
  "status": "success",
  "data": {
    "examId": "uuid",
    "examTitle": "Physics Midterm",
    "publishedAt": "2026-05-20T14:00:00.000Z",
    "totalSubmissions": 120,
    "gradedSubmissions": 118
  },
  "message": "Results published successfully."
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `EXAM_NOT_FOUND` | 404 | Exam doesn't exist or is deleted |
| `ALREADY_PUBLISHED` | 400 | Results already published |
| `EXAM_STILL_ACTIVE` | 400 | Exam hasn't ended yet |
