# Timetable API Endpoints

A recurring **weekly template** (`TimetableSlot`) plus **generated dated sessions**.
A weekly BullMQ job (and a manual `/generate`) materializes `ClassSession` rows
from active slots. Cancellations/one-offs are edited as sessions (see
`classes.endpoints.md`).

## Base URL

```
http://localhost:5000/api/timetable
```

## Auth

All endpoints require the `access_token` cookie.

## Roles

- **Slot writes** (`POST/PATCH/DELETE /slots`) — `SUPER_ADMIN`, the course's `TEACHER`, or `ADMIN` (front-desk scheduler). A TEACHER may only touch slots for **their own** courses (`403 FORBIDDEN_COURSE` otherwise).
- **Reads** (`GET /slots`) — any authenticated user (the schedule).
- **Generate** (`POST /generate`) — `SUPER_ADMIN`, `ADMIN`.

## Data Shape

### TimetableSlot

```json
{
  "id": "uuid",
  "title": "Physics Theory",
  "dayOfWeek": 1,
  "startTime": "16:00",
  "durationMinutes": 120,
  "classType": "PHYSICAL",
  "zoomLink": null,
  "isActive": true,
  "courseId": "uuid",
  "instituteId": "uuid",
  "createdAt": "…",
  "updatedAt": "…"
}
```

- `dayOfWeek` — `0`=Sunday … `6`=Saturday.
- `startTime` — `"HH:mm"`, 24h, **Asia/Colombo** local.
- `classType` — `ONLINE` | `PHYSICAL` | `null` (all cohorts).
- `title` — optional; generated sessions fall back to the course name.

## Endpoints

| Method | Path | Roles | Description |
| ------ | ---- | ----- | ----------- |
| POST | `/api/timetable/slots` | SUPER_ADMIN, TEACHER(own), ADMIN | Create a weekly slot |
| GET | `/api/timetable/slots` | Any | List slots (the timetable) |
| GET | `/api/timetable/slots/:id` | Any | Get a slot |
| PATCH | `/api/timetable/slots/:id` | SUPER_ADMIN, TEACHER(own), ADMIN | Update a slot |
| DELETE | `/api/timetable/slots/:id` | SUPER_ADMIN, TEACHER(own), ADMIN | Delete a slot |
| POST | `/api/timetable/generate` | SUPER_ADMIN, ADMIN | Materialize sessions for a date range |

### POST `/api/timetable/slots`

Body:
```json
{
  "courseId": "uuid",
  "instituteId": "uuid",
  "title": "Physics Theory",
  "dayOfWeek": 1,
  "startTime": "16:00",
  "durationMinutes": 120,
  "classType": "PHYSICAL",
  "zoomLink": null,
  "isActive": true
}
```
- `courseId` — required. `dayOfWeek` (0–6) + `startTime` ("HH:mm") required.
- `instituteId`, `title`, `durationMinutes` (default 60), `classType`, `zoomLink`, `isActive` — optional.

`201` → `{ status, data: TimetableSlot, message }`. Not the course's teacher → `403`. Bad `startTime` → `400`.

### GET `/api/timetable/slots`

Query (all optional): `courseId`, `instituteId`, `dayOfWeek`. `200` → `{ status, data: TimetableSlot[], count }`, ordered by day then time. Non–SUPER_ADMIN see active slots only.

### PATCH `/api/timetable/slots/:id`

Body: any subset of the create fields. `200` → updated slot.

### DELETE `/api/timetable/slots/:id`

`200` → `{ status, data: null, message }`. Already-generated sessions are **kept** (their `timetableSlotId` is nulled).

### POST `/api/timetable/generate`

Body:
```json
{ "from": "2026-07-09T00:00:00.000Z", "to": "2026-07-23T00:00:00.000Z" }
```
Creates a `ClassSession` for every occurrence of every active slot in the range.
**Idempotent** — re-running does not duplicate (unique on `(timetableSlotId, date)`)
and never clobbers a hand-edited session.

`200` →
```json
{ "status": "success", "data": { "created": 3, "skipped": 5 }, "message": "…" }
```

> A **weekly BullMQ job** (Sun 20:00 UTC) auto-generates the next 14 days, so
> `/generate` is mainly for backfilling or on-demand refresh.
