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
