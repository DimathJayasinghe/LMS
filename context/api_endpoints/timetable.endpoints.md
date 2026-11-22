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

All endpoints require the `access_token` cookie **except** `GET /public/upcoming`,
which is deliberately unauthenticated (consumed by the marketing landing page
before login).

## Roles

- **Slot writes** (`POST/PATCH/DELETE /slots`) — `SUPER_ADMIN`, the course's `TEACHER`, or `ADMIN` (front-desk scheduler). A TEACHER may only touch slots for **their own** courses (`403 FORBIDDEN_COURSE` otherwise).
- **Reads** (`GET /slots`, `/sessions`) — `SUPER_ADMIN`/`ADMIN` see all, an owning
  `TEACHER` sees only owned courses, and a `STUDENT` sees active enrolled courses
  matching their online/physical cohort. `MARKER` receives `403`.
- **Preview/generate** — `SUPER_ADMIN`, `ADMIN`, and `TEACHER`; teacher operations are
  server-scoped to owned courses. Slot create/update/disable and generation require
  `Idempotency-Key`; preview is read-only and does not.
- **Public read** (`GET /public/upcoming`) — no auth. Select list is
  deliberately narrow (`id`, `title`, `date`, `durationMinutes`, `classType`,
  `course.name`, `course.subject.name`) — **never** `zoomLink` /
  `zoomMeetingId` / `zoomPassword`, since those are the actual join
  credentials for a live class and must stay behind the enrolled+paid gate
  (see CLAUDE.md "Content protection"). Covered by the existing global rate
  limiter (`/api` — 100 req/min/IP).

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
  "isActive": true,
  "courseId": "uuid",
  "instituteId": "uuid",
  "createdAt": "…",
  "updatedAt": "…",
  "course": { "name": "Physics 2026", "year": 2026 },
  "institute": { "name": "Colombo" }
}
```

- `dayOfWeek` — `0`=Sunday … `6`=Saturday.
- `startTime` — `"HH:mm"`, 24h, **Asia/Colombo** local.
- `classType` — `ONLINE` (online only) | `PHYSICAL` (in hall only) | `null` (in hall + live stream).
- `title` — optional; generated sessions fall back to the course name.

## Endpoints

| Method | Path | Roles | Description |
| ------ | ---- | ----- | ----------- |
| GET | `/api/timetable/public/upcoming` | None (public) | Combined upcoming sessions, marketing-safe fields only |
| POST | `/api/timetable/slots` | SUPER_ADMIN, TEACHER(own), ADMIN | Create a weekly slot |
| GET | `/api/timetable/slots` | Any | List slots (the timetable) |
| GET | `/api/timetable/slots/:id` | Any | Get a slot |
| GET | `/api/timetable/sessions` | SUPER_ADMIN, TEACHER(own), ADMIN, STUDENT(enrolled cohort) | Dated upcoming sessions with `liveScheduled`, never meeting credentials |
| PATCH | `/api/timetable/slots/:id` | SUPER_ADMIN, TEACHER(own), ADMIN | Update a slot |
| DELETE | `/api/timetable/slots/:id` | SUPER_ADMIN, TEACHER(own), ADMIN | Soft-disable a slot |
| POST | `/api/timetable/generate/preview` | SUPER_ADMIN, TEACHER(own), ADMIN | Preview `CREATE`/`EXISTS` occurrences |
| POST | `/api/timetable/generate` | SUPER_ADMIN, TEACHER(own), ADMIN | Materialize sessions for a date range |

### GET `/api/timetable/public/upcoming`

Query (all optional): `days` (1–30, default 14), `limit` (1–50, default 20).

`200` →
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "title": "Physics Theory",
      "date": "2026-07-14T10:30:00.000Z",
      "durationMinutes": 120,
      "classType": "PHYSICAL",
      "course": { "name": "Advanced Level Physics 2027", "subject": { "name": "Physics" } }
    }
  ],
  "count": 1
}
```
Only sessions on **active** courses, not soft-deleted. Ordered by date ascending.

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
  "isActive": true
}
```
- `courseId` — required. `dayOfWeek` (0–6) + `startTime` ("HH:mm") required.
- `instituteId`, `title`, `durationMinutes` (default 60), `classType`, `isActive` — optional.
- Slots must finish on the same local calendar day. An active slot returns `409
  TIMETABLE_CONFLICT` if it overlaps the same course, teacher, or non-null institute.
- A recurring slot never accepts or returns a Zoom link. Each generated online or in-hall + live-stream occurrence
  is scheduled separately through the embedded live-class endpoint.

`201` → `{ status, data: TimetableSlot, message }`. Not the course's teacher → `403`. Bad `startTime` → `400`.

### GET `/api/timetable/slots`

Query (all optional): `courseId`, `instituteId`, `dayOfWeek`. `200` → `{ status,
data: TimetableSlot[], count }`, ordered by day then time. SUPER_ADMIN/ADMIN see all;
teachers see owned active/inactive slots; students see active enrolled-cohort slots.

### PATCH `/api/timetable/slots/:id`

Body: any subset of `instituteId`, `title`, `dayOfWeek`, `startTime`,
`durationMinutes`, `classType`, and `isActive`. `courseId` is immutable; create a new
slot to move a recurring schedule to another course. `200` → updated slot. Send
`{ "isActive": true }` to restore a disabled slot; repeating the restore is safe.

### DELETE `/api/timetable/slots/:id`

`200` → `{ status, data: null, message }`. The row is retained with
`isActive: false`, so repeating the request is safe. Already-generated sessions
and their `timetableSlotId` links are **kept**. Future generation ignores the
disabled slot until it is restored through `PATCH`.

### POST `/api/timetable/generate`

Body:
```json
{ "from": "2026-07-09T00:00:00.000Z", "to": "2026-07-23T00:00:00.000Z" }
```
Creates a `ClassSession` for every occurrence of every active slot in the range.
**Idempotent** — re-running does not duplicate (unique on `(timetableSlotId, date)`)
and never clobbers a hand-edited session. Slots of a class whose teacher is deactivated are skipped, in the preview, the manual run and the weekly job alike: nobody can run those sessions until the class is handed over.

The range is bounded to 90 days. Call `POST /generate/preview` with the same body
first to receive `rows`, `createCount`, and `existingCount`. Generated online and in-hall + live-stream sessions
contain no reusable raw link; authorized staff schedule the occurrence through
`POST /classes/:classId/sessions/:sessionId/live/schedule`.

`200` →
```json
{ "status": "success", "data": { "created": 3, "skipped": 5 }, "message": "…" }
```

> A **weekly BullMQ job** (Sun 20:00 UTC) auto-generates the next `timetable.generateAheadDays` days (default 14, range 7–365; at least the weekly interval, so no days are skipped) using the default organization’s setting, so
> `/generate` is mainly for backfilling or on-demand refresh.
