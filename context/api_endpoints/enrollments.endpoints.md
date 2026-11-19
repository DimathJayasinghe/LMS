# Enrollments API Endpoints

Links a **student** to a **course** in a given mode (`ONLINE` | `PHYSICAL`). An
**active** enrollment is the prerequisite for everything paid: it gates content
access (see `access.service` / `classes.endpoints.md` — sessions return
`403 NOT_ENROLLED` otherwise) and every `Payment` hangs off an `enrollmentId`
(see `payments.endpoints.md`).

## Base URL

```
http://localhost:5000/api/enrollments
```

## Auth

All endpoints require the `access_token` cookie.

## Roles

- **Create** (`POST /`) — `STUDENT` (self-enroll), or `ADMIN`/`SUPER_ADMIN`
  (front-desk enrolling a specific student via `userId`).
- **My enrollments** (`GET /my`) — `STUDENT`.
- **Learning summary/seen marker** (`GET /learning`, `POST /learning/:courseId/seen`) — `STUDENT`.
- **List all** (`GET /`) — `SUPER_ADMIN`, `ADMIN` (oversight; paginated).
- **Get one** (`GET /:id`) — the owning `STUDENT`, or `ADMIN`/`SUPER_ADMIN`.
- **Cancel** (`DELETE /:id`) — the owning `STUDENT`, or `ADMIN`/`SUPER_ADMIN`.

## Data Shape

### Enrollment

```json
{
  "id": "uuid",
  "classType": "ONLINE",
  "isActive": true,
  "userId": "uuid",
  "courseId": "uuid",
  "createdAt": "2026-07-10T06:00:00.000Z",
  "updatedAt": "2026-07-10T06:00:00.000Z",
  "course": {
    "id": "uuid",
    "name": "2025 A/L Theory",
    "year": 2025,
    "monthlyFee": "2500.00",
    "bannerUrl": "https://.../banner.png",
    "isActive": true,
    "subjectId": "uuid",
    "teacherId": "uuid"
  }
}
```

- `classType` — `ONLINE` | `PHYSICAL` today. A student may hold **one enrollment per
  `(course, classType)`** (unique on `userId + courseId + classType`), so the same
  course can be taken both online and physically as two enrollments, **each billed separately**.
  *Planned (2026-11-19, not implemented):* a `HYBRID` value meaning one enrollment, one fee, both
  modes, and one **active** enrollment per `(user, course)`; see the
  [payment channels and HYBRID design](../../docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md) §4.
  The content gate (`assertStudentContentAccess`) currently checks enrollment and payment only, not `classType`.
- `isActive` — `false` means cancelled/dropped; history (payments) is retained.
- The admin list (`GET /`) additionally embeds a `user` summary
  (`{ id, name, indexNumber, email }`).

## Endpoints Summary

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/` | STUDENT, ADMIN, SUPER_ADMIN | Create (or reactivate) an enrollment. |
| GET | `/my` | STUDENT | List the caller's own enrollments. |
| GET | `/learning` | STUDENT | Current active enrollments with new lessons/upcoming sessions. |
| POST | `/learning/:courseId/seen` | STUDENT | Advance the caller's course-content seen marker. |
| GET | `/` | ADMIN, SUPER_ADMIN | List all enrollments (paginated). |
| GET | `/:id` | Owner, ADMIN, SUPER_ADMIN | Get one enrollment. |
| DELETE | `/:id` | Owner, ADMIN, SUPER_ADMIN | Soft-cancel (set `isActive: false`). |

## Endpoint Details

### GET `/learning` and POST `/learning/:courseId/seen`

The learning list is bounded to 50 active enrollments. Each enrollment includes `learning` with
`newLessonCount` (READY recordings created after `lastSeenAt`), `latestLessonAt`,
`upcomingSessionCount`, `nextSessionAt`, and `lastSeenAt`. The seen endpoint requires an active
enrollment and upserts a private `(userId, courseId)` marker; it never accepts another user's ID.

### POST `/`

Enroll into a course. A `STUDENT` enrolls **themselves** — any `userId` in the
body is ignored. An `ADMIN`/`SUPER_ADMIN` **must** pass the `userId` of the
student being enrolled.

Re-enrolling into a `(course, classType)` you previously cancelled **reactivates**
the existing row (does not duplicate). Enrolling into one you already hold
actively is a `409`.

**Request body**

```json
{
  "courseId": "uuid",
  "classType": "ONLINE",
  "userId": "uuid"
}
```

- `courseId` — **required**; the course must exist and be **active**.
- `classType` — **required**; `ONLINE` | `PHYSICAL`.
- `userId` — required for `ADMIN`/`SUPER_ADMIN`; ignored for `STUDENT`.

**Success (201)**

```json
{
  "status": "success",
  "data": { "...enrollment" },
  "message": "Enrolled successfully."
}
```

**Errors**

- 400 validation error / `USER_ID_REQUIRED` (staff omitted `userId`) / `NOT_A_STUDENT`
- 401 auth middleware error
- 403 forbidden (role guard)
- 404 `CLASS_NOT_FOUND` (course missing/inactive) / `USER_NOT_FOUND`
- 409 `ALREADY_ENROLLED`

### GET `/my`

List the caller's own enrollments (most recent first), each with its `course`.

**Query params** (all optional): `courseId`, `classType`, `isActive` (`true`/`false`).

**Success (200)**

```json
{
  "status": "success",
  "data": ["...enrollments"],
  "count": 3
}
```

### GET `/`

Admin oversight. Paginated and filterable; embeds a `user` summary per row.

**Query params**: `page` (default 1), `limit` (default 20, max 100), `userId`,
`courseId`, `classType`, `isActive` (`true`/`false`).

**Success (200)**

```json
{
  "status": "success",
  "data": ["...enrollments"],
  "count": 42,
  "page": 1,
  "limit": 20
}
```

> `count` is the **total** matching rows (not the page size).

### GET `/:id`

Get one enrollment. A `STUDENT` may only fetch their own (others return `404`).

**Success (200)** → `{ status, data: { ...enrollment } }`

**Errors**: 404 `ENROLLMENT_NOT_FOUND`.

### DELETE `/:id`

Soft-cancel: sets `isActive: false`. Content access and new payments stop; the
row and its payment history are retained (payments are `onDelete: Restrict`).
A `STUDENT` may only cancel their own.

**Success (200)**

```json
{
  "status": "success",
  "data": { "...enrollment (isActive: false)" },
  "message": "Enrollment cancelled."
}
```

**Errors**: 404 `ENROLLMENT_NOT_FOUND`.

## Related

- `payments.endpoints.md` — `POST /payments/initiate` takes the `enrollmentId`
  from here plus a `paymentMonth` (`YYYY-MM`).
- `classes.endpoints.md` — course (class) shapes; sessions are enrollment-gated.
