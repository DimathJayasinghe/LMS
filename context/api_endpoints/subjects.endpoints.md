# Subjects API Endpoints

Top of the academic hierarchy: `Subject → Course → ClassSession/Exam`.

## Base URL

```
http://localhost:5000/api/subjects
```

## Auth

All endpoints require the `access_token` cookie.

## Roles

Enum: `SUPER_ADMIN`, `TEACHER`, `ADMIN`, `MARKER`, `STUDENT`.

- **SUPER_ADMIN** — create / update subjects.
- **SUPER_ADMIN** — list/replace the teachers approved for a subject.
- **TEACHER** — list their own assigned active subjects.
- Everyone authenticated — read. Non–SUPER_ADMIN see **active only**.

## Data Shape

### Subject

```json
{
  "id": "uuid",
  "name": "Physics",
  "description": "A/L Physics",
  "isActive": true,
  "createdAt": "2026-07-09T00:00:00.000Z",
  "updatedAt": "2026-07-09T00:00:00.000Z"
}
```

## Endpoints

| Method | Path | Roles | Description |
| ------ | ---- | ----- | ----------- |
| POST | `/api/subjects` | SUPER_ADMIN | Create a subject |
| GET | `/api/subjects` | Any | List subjects (`?search=`) |
| GET | `/api/subjects/:id` | Any | Get a subject |
| PATCH | `/api/subjects/:id` | SUPER_ADMIN | Update a subject |
| GET | `/api/subjects/mine` | TEACHER | List subjects assigned to the caller |
| GET | `/api/subjects/:id/teachers` | SUPER_ADMIN | List approved teachers |
| PUT | `/api/subjects/:id/teachers` | SUPER_ADMIN | Replace the exact teacher set (idempotent) |

### Teacher assignment endpoints

`PUT /api/subjects/:id/teachers` accepts `{ "teacherIds": ["uuid"] }` and requires an
`Idempotency-Key`. A teacher being **added** must be an active TEACHER account; a teacher already on the subject may stay in the list after they are deactivated, so a leaver's link never stops the owner from freeing their classes (F-82). Removing a teacher who still owns a
class in the subject returns `409 TEACHER_OWNS_SUBJECT_COURSE`; reassign the class first. Successful
replacement emits `SUBJECT_TEACHERS_ASSIGNED`. `GET /mine` is the source for the teacher class form.

### POST `/api/subjects`

Body:
```json
{ "name": "Physics", "description": "A/L Physics", "isActive": true }
```
- `name` — required, 2–120 chars, unique.
- `description` — optional, ≤500.
- `isActive` — optional (default `true`).

`201` → `{ status, data: Subject, message }`. Duplicate name → `409 SUBJECT_ALREADY_EXISTS`.

### GET `/api/subjects?search=phys`

`200` → `{ status, data: Subject[], count }`. Non–SUPER_ADMIN receive active subjects only.

### GET `/api/subjects/:id`

`200` → `{ status, data: Subject }`. Missing/inactive (for non-owner) → `404 SUBJECT_NOT_FOUND`.

### PATCH `/api/subjects/:id`

Body: any subset of `{ name, description, isActive }`. `200` → updated Subject. Name clash → `409`.
