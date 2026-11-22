# Owner Console API Endpoints

The owner's read-only overview (F-127). The money panels are answered by composing a service that already answers the same question for its own screen (cash by day, who owes, the financial report), so a figure there can never disagree with the list it summarises. The operations panels (marking, attendance, setup, SMS) are small counting services of their own, each tested against its source tables.

## Base URL

```
http://localhost:5000/api/console
```

## Auth & Roles

`SUPER_ADMIN` (the owner) only. Front desk, teachers, markers and students receive `403 FORBIDDEN`; an unauthenticated caller receives `401`. The role is checked at the route and again in the service.

## Read-only

Every route under `/console` is a `GET`. No mutation endpoint exists, and a route-table test fails if one is added. Responses are `Cache-Control: no-store` because they carry collector names and takings.

## Endpoints

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/api/console/cash` | SUPER_ADMIN | Cash for one day, what needs attention, and the month by method |
| GET | `/api/console/owing` | SUPER_ADMIN | Who owes for a month, in total and by class |
| GET | `/api/console/marking` | SUPER_ADMIN | Exams that ended recently and are not published, with marking progress |
| GET | `/api/console/attendance-today` | SUPER_ADMIN | Today's classes with scans against enrollment, and scans that broke a rule |
| GET | `/api/console/setup` | SUPER_ADMIN | Classes without a working teacher, old batches, students without a phone |
| GET | `/api/console/sms` | SUPER_ADMIN | SMS delivery counts and the latest failures, masked |

### GET `/cash`

Query: `date` (optional, `YYYY-MM-DD`, default today in the organization's zone). A day that has not happened yet is `400 DAY_IN_FUTURE`.

Response `data`:

| Field | Meaning |
| --- | --- |
| `date` | The Colombo day shown |
| `tallyEnabled` | False when the owner turned the end-of-day count off |
| `collectedTotal`, `paymentCount` | Cash the desk took that day, from the payments themselves (a refund does not un-collect it) |
| `rows` | One row per collector and branch, in the shape of `GET /payments/cash`, with the count when there is one |
| `flagged` | Rows whose count differs from the system figure beyond `tally.varianceFlagAmount` and that the owner has not reconciled: that day's, and older days still waiting |
| `unreconciled` | `{ count, rows, from, to }`: counted days before `date` that the owner has not reconciled, newest first; `rows` holds at most 20, `count` is the true total. `from`..`to` is the window searched: `console.lookbackDays` back (capped at the 92 days the cash list allows) to the day before `date`; pass it to `GET /payments/cash-tally?unreconciled=true` to list exactly these days |
| `month` | `{ month, byMethod }`: fees for the billing month of `date`, by method, as in the financial report (successful payments net of refunds, grouped by the month they pay for). Near a month end this is not the same as what was taken in the calendar month, and it is not the day's cash total above |

### GET `/owing`

Query: `month` (optional, `YYYY-MM`, default the current billing month). A month that has not started is `400 MONTH_IN_FUTURE`.

Response `data`: `{ month, students, amount, courses, otherCourses }`. `students` counts different students (one who owes two classes counts once, so it can be lower than the row count of `GET /payments/outstanding`, which lists each student and class); `amount` totals every class; `courses` lists the five classes owed the most (largest first, ties by name) with `{ courseId, name, count, expected }`; `otherCourses` counts the rest. The full list is `GET /payments/outstanding`. "Owes" has one definition (`outstandingWhere`), shared with that list, the financial report and the reminders.

### GET `/marking`

No query. Looks back `console.lookbackDays` (default 30) from now. Response `data`: `{ lookbackDays, total, exams }`. `exams` holds the newest 20 exams that ended inside the lookback, are not deleted and are not published; `total` is the true number waiting. Each exam: `{ examId, title, courseName, type, endedAt, submitted, graded, ungraded, incomplete, hall }`.

- `submitted` counts finished submissions (`COMPLETED`), online and hall-entered together.
- `ungraded` is the finished submissions with no marks yet; `graded` is `submitted - ungraded`.
- `incomplete` is uploads that were started and never finished (`UPLOADING`); they are not in `submitted`.
- `hall` is the finished submissions that came from hall mark entry (`source = HALL`).

### GET `/attendance-today`

No query. Response `data`: `{ date, sessions, flagged }`.

- `sessions`: every class not deleted that starts on `date` (today in the organization's zone), earliest first, as `{ sessionId, title, courseName, startsAt, durationMinutes, classType, instituteName, scanned, enrolled }`. `scanned` leaves out voided scans. `enrolled` is the active enrollments of non-deactivated students in the course, for the class's mode when it has one and for every mode when `classType` is null. `instituteName` is the branch of the timetable slot that generated the class and is null for one scheduled by hand.
- `flagged`: `{ from, to, withoutEnrollment, onlineOnly, unpaid }` for scans in the lookback days up to and including today, voided scans left out. They come from the columns written at the entrance scan: `withoutEnrollment` is `enrollmentStateAtScan = NOT_ENROLLED`, `onlineOnly` is `MODE_MISMATCH`, `unpaid` is `paidAtScan = false`. A scan can count in `unpaid` and in one of the others.

### GET `/setup`

No query. Response `data`: `{ orphanedClasses, oldBatches, studentsWithoutPhone }`.

- `orphanedClasses` and `oldBatches` are `{ count, rows }` where `rows` holds at most 10 `{ courseId, name, year, teacherName }` ordered by name, and `count` is the true total. Orphaned: active courses whose teacher's account is deactivated. Old batches: active courses whose `year` is before the current year in the organization's zone.
- `studentsWithoutPhone`: active students whose phone is missing or blank.

### GET `/sms`

No query. Response `data`: `{ week, month, failures }`.

- `week`: `{ from, sent, failed, pending }` for the seven days ending today, counted from the start of `from`. `month`: `{ month, sent, failed, pending }` from the start of the current billing month.
- `failures`: the newest 10 failed messages as `{ id, at, phone, reason }`. `phone` shows only the last three digits. `reason` is the provider's failure text, shortened to 120 characters, with any run of seven or more digits hidden, or null. **Message text is never read or returned.**

## Not here yet

The audited view-as mode, a security-event panel (needs F-121), teacher statements and the request and reversal queues belong to later waves.
