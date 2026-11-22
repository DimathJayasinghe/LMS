# Owner Console API Endpoints

The owner's read-only overview (F-127). Every panel is answered by composing a service that already answers it for its own screen (cash by day, who owes, the financial report), so a figure here can never disagree with the list it summarises.

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

## Not here yet

Marking progress, attendance today, setup problems and the SMS log are F-127 part 2.
