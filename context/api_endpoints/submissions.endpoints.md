# Submissions + Marking API Endpoints

## Scoped marker access (2026-09-07)

For exams with non-null `paperRevisionId`, every answer-bearing marker operation requires a confirmed
grant for the student's frozen participant audience. Membership in a marker group alone grants no
access. Legacy null-paper-revision exams retain their whole-exam assignment behavior.

- `GET /api/submissions/exam/:examId` filters rows in the database through participant audience grants.
  Its `count` is the length of that filtered result, and signed answer-PDF URLs are issued only for
  those rows. This API has no separate marker submission-detail or answer-download endpoint; the list
  contains answers and signed download links.
- `PATCH /api/submissions/:id/marks` resolves the submission's participant in the same exam and checks
  its exact audience. Missing participant/audience returns `403 EXAM_PARTICIPANT_NOT_FOUND`; another
  audience or revoked assignment returns `403 MARKER_NOT_ASSIGNED`.
- Grading requires a UUID `Idempotency-Key`. Fresh audience authorization runs before cached replay;
  response keys are bound to actor, method and request URL, so a key cannot retrieve another
  submission's answers. Removing a grant blocks fresh lists, new download URLs and grade retries.

Previously issued signed URLs remain usable until their existing short expiry. Marker exam detail
still strips MCQ answer keys, and student `/mine` responses still hide marks, feedback and graded time
until results are published. No marker physical-entry roster endpoint exists in this slice.

> Step 9 — Students submit answers, markers grade, admin publishes results.

---

## Endpoints Overview

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/api/submissions` | STUDENT | Start submission (get upload URL or submit MCQ/typed) |
| PATCH | `/api/submissions/:id/complete` | STUDENT | Mark PDF upload as complete |
| GET | `/api/submissions/mine` | STUDENT | List the caller's own submissions (marks gated on publish) |
| GET | `/api/submissions/exam/:examId` | SUPER_ADMIN, TEACHER (own course), MARKER (assigned) | List submissions for an exam |
| PATCH | `/api/submissions/:id/marks` | SUPER_ADMIN, TEACHER (own course), MARKER (assigned) | Submit marks (idempotent) |
| POST | `/api/submissions/exam/:examId/publish` | SUPER_ADMIN, TEACHER (own course) | Publish results for an exam |
| PATCH | `/api/submissions/:id/result-correction` | Owning TEACHER, SUPER_ADMIN | Correct a published result with an audited reason |

> **Roles updated (2026-07-09)**: `ADMIN` → **`SUPER_ADMIN`**; list + publish now also allow the exam's **`TEACHER`**; grading also allows the owning **`TEACHER`** and **`SUPER_ADMIN`**.
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

**Integrity checks (2026-09-06):** an active enrollment in the exam's course is required,
for both physical and online students. This adds no monthly-payment gate. `INCLASS` papers
cannot be self-submitted through this endpoint, and published exams are closed to new attempts.
Automatically calculated MCQ marks are saved server-side but `marks`, `feedback`, and `gradedAt`
remain null in the student response until results are published.

**Scoped exams and the audience (Wave 1, #117):** the client never chooses an audience. For an exam with a
paper revision the server reads the student's own participant row (unique on exam and student) and applies it:
an `ONLINE` audience starts; a `PHYSICAL` audience answers `409 EXAM_PHYSICAL_AUDIENCE` (the paper is sat in the
hall); no row answers `403 EXAM_PARTICIPANT_NOT_FOUND`. `audienceId` in the body is optional; if sent it must be
the student's own, otherwise `400 EXAM_AUDIENCE_MISMATCH`. The row is read again inside the locked transaction.
Check order: exam, enrollment (`NOT_ENROLLED`), participant and audience, published, time window, duplicate or
resume. Legacy exams are unchanged.

**Resume after a failed upload:** a submission that is `UPLOADING` with no stored PDF is an unfinished attempt.
While the window is open, starting again by the same student reuses that row instead of `409 ALREADY_SUBMITTED`:
a PDF start returns a fresh upload URL, and a typed-answers start completes the row without an upload (a hybrid
exam needs its MCQ answers again). A `COMPLETED` row, or an `UPLOADING` row that already holds a stored file,
still answers `409 ALREADY_SUBMITTED`. After the exam ends nothing starts.

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

`NOT_ENROLLED` (403) rejects absent/inactive enrollment; `INCLASS_SUBMISSION_NOT_ALLOWED` (400)
rejects student-created physical-paper records; `RESULTS_ALREADY_PUBLISHED` (409) closes published
exams. `MULTIPLE_WRITTEN_CHANNELS` (400) rejects typed answers together with a PDF. All three PDF
metadata fields are required together (`FILE_METADATA_REQUIRED`, 400), before a submission is created.

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
| `ALREADY_SUBMITTED` | 409 | Student already has a finished submission (an unfinished upload is resumed instead) |
| `EXAM_PHYSICAL_AUDIENCE` | 409 | Scoped exam: the student's paper is sat in the hall |
| `EXAM_PARTICIPANT_NOT_FOUND` | 403 | Scoped exam: the student is not on the exam's list |
| `EXAM_AUDIENCE_MISMATCH` | 400 | A sent `audienceId` is not the student's own |
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
> Typed-only/MCQ attempts are already completed when created; replaying their completion needs no key
> and performs no write. An `UPLOADING` attempt requires a key (`400 UPLOAD_KEY_REQUIRED`), continued
> active enrollment, and an exam that has not been deleted or published. Publication closes upload
> completion even within the grace period. The grace after the exam's end is the owner setting
> `exams.uploadGraceSeconds` (default 180, was a fixed 60 seconds); a start is never accepted after the end. Completion responses never reveal
> unpublished marks, feedback, or grading time; already-completed historical results remain readable
> by their owner after publication, independently of current enrollment.

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
| `EXAM_ENDED` | 400 | Exam end plus `exams.uploadGraceSeconds` has passed |

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
- Role: `SUPER_ADMIN`, owning `TEACHER`, or assigned `MARKER`

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

**Submit Marks** — An assigned marker, owning teacher, or owner grades a specific submission before publication. The actor is recorded in `gradedById`; a marker cannot overwrite marks last set by a teacher or owner. Legacy or automatically graded rows without a grader remain editable by assigned markers. `source` is `ONLINE` by default; `HALL` is reserved for hall submissions.

### Auth
- Requires: `access_token` cookie
- Role: `SUPER_ADMIN`, owning `TEACHER`, or assigned `MARKER`
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
    "source": "ONLINE",
    "gradedById": "grader-uuid",
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
| `MARKS_SET_BY_TEACHER` | 409 | A marker cannot overwrite marks set by a teacher or owner |
| `RESULTS_ALREADY_PUBLISHED` | 409 | Use the correction route for published results |

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
