# Payment System API Endpoints

## Base URL: `/api/payments`

> **Roles (2026-07-09)**: enum is `SUPER_ADMIN/TEACHER/ADMIN/MARKER/STUDENT`. Below, `ADMIN` = **`SUPER_ADMIN`** and `STAFF` = **`ADMIN`** (front-desk). `PATCH /:id/override` is `SUPER_ADMIN` only.
>
> `Payment.status` is `PENDING | SUCCESS | FAILED | REFUNDED`. `amount` is the original gross
> amount; `refundedAmount` is the sum of completed refunds. Financial totals report the net retained
> amount. A fully refunded row is terminal and cannot be reused by PayHere, entrance, bulk, or override flows.

> **Channels.** Implemented: `ONLINE` (PayHere, endpoints 1–2), `ENTRANCE` (front desk or branch, endpoint 8), `BULK` (endpoint 7), `MANUAL` (override, endpoint 6). **Planned, not implemented (2026-11-19):** `BANK_TRANSFER` — a student uploads a bank-transfer slip, `ADMIN`/`SUPER_ADMIN` approve or reject it, and approval settles the month. The routes (`/api/payments/slips…`), states and edge cases are specified in [`docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md`](../../docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md) §3. Do not call them yet.

### 1. Initiate Payment (PayHere Checkout)
Generates the payload required to redirect a student to PayHere checkout.

- **URL:** `/initiate` or `/payhere/checkout`
- **Method:** `POST`
- **Auth:** Required (Role: `STUDENT`)
- **Headers:** `Idempotency-Key: <uuid>` **required** (high-stakes POST invariant; `checkIdempotency`
  middleware rejects a missing/non-UUID key with 400). The frontend mints one per attempt in
  `lib/payhere.ts`'s `initiatePayherePayment`.
- **Body:**
  ```json
  {
    "enrollmentId": "uuid",
    "paymentMonth": "YYYY-MM"
  }
  ```
  > `enrollmentId` comes from the student's **active** enrollments — see
  > `enrollments.endpoints.md` (`GET /api/enrollments/my`).
- **Success Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "checkoutUrl": "https://sandbox.payhere.lk/pay/checkout",
      "payload": {
        "merchant_id": "...",
        "return_url": "...",
        "cancel_url": "...",
        "notify_url": "...",
        "order_id": "payment_uuid",
        "items": "Course Name 2025 - 2026-05",
        "amount": "2500.00",
        "currency": "LKR",
        "hash": "..."
      },
      "payment": {
        "id": "uuid",
        "amount": "2500.00",
        "status": "PENDING",
        "paymentMonth": "2026-05"
      }
    }
  }
  ```

### 2. PayHere Notification (Webhook)
Callback endpoint for PayHere to notify the system of payment status changes.

- **URL:** `/payhere/notify`
- **Method:** `POST`
- **Auth:** None (Public, verified via PayHere MD5 signature using a constant-time comparison)
- **Body:** (PayHere Notification POST Data)
  ```json
  {
    "merchant_id": "...",
    "order_id": "payment_uuid",
    "payhere_amount": "2500.00",
    "payhere_currency": "LKR",
    "status_code": 2,
    "md5sig": "...",
    "payment_id": "payhere_uuid"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "status": "success",
    "message": "Payment notification processed successfully."
  }
  ```

### 3. List My Payments
Allows a student to view their own payment history.

- **URL:** `/my`
- **Method:** `GET`
- **Auth:** Required (Role: `STUDENT`)
- **Query Params:**
  - `status`: `PENDING` | `SUCCESS` | `FAILED` | `REFUNDED` (optional)
  - `paymentMonth`: `YYYY-MM` (optional)
  - `enrollmentId`: `uuid` (optional)
- **Success Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": [...],
    "count": 5
  }
  ```

### 4. Get Payment Status (PayHere Check)
Specific endpoint to check the status of a PayHere transaction.

- **URL:** `/payhere/status/:id`
- **Method:** `GET`
- **Auth:** Required (Role: `STUDENT`, `ADMIN`, `STAFF`)
- **Success Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "id": "uuid",
      "status": "SUCCESS",
      "paymentMonth": "2026-05",
      "amount": "2500.00",
      "payhereId": "..."
    }
  }
  ```

### 4b. Month Summary (Admin)
Aggregate one month's payments for the admin dashboard.

- **URL:** `/summary`
- **Method:** `GET`
- **Auth:** Required (Role: `SUPER_ADMIN`, `ADMIN`)
- **Query Params:** `month` (required, `YYYY-MM`)
- **Success Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "month": "2026-07",
      "collectedTotal": "22000.00",
      "paidCount": 7,
      "pendingCount": 1,
      "failedCount": 0,
      "refundedCount": 1
    }
  }
  ```
  > `collectedTotal` sums `amount - refundedAmount` over `status = SUCCESS` for the month. Fully
  > refunded rows are excluded and reported by `refundedCount`. Route is registered
  > **before** `GET /:id` so `summary` isn't parsed as a payment id.

### 4c. Financial Report (Super Admin / Teacher)
Aggregate financial analytics powering the `/admin/reports` page. Teachers are always restricted to
their own classes; super admins may inspect institution, teacher, or class totals.

- **URL:** `/reports`
- **Method:** `GET`
- **Auth:** Required (Role: `SUPER_ADMIN`, `TEACHER`; front-desk `ADMIN` is bounced with 403)
- **Query Params:**
  - `month` (optional, `YYYY-MM`; defaults to the current payment month in the caller organization timezone)
  - `teacherId` (optional UUID; `SUPER_ADMIN` only in effect)
  - `courseId` (optional UUID; combined with the authenticated teacher's ownership for `TEACHER`)
- **Success Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "month": "2026-07",
      "trend": [
        { "month": "2025-08", "collected": "0.00", "paidCount": 0 },
        { "month": "2026-07", "collected": "39500.00", "paidCount": 13 }
      ],
      "byCourse": [
        { "courseId": "…", "name": "Chemistry", "year": 2026, "collected": "7000.00", "paidCount": 2 }
      ],
      "byTeacher": [
        { "teacherId": "…", "name": "Ms Perera", "collected": "18000.00", "paidCount": 6 }
      ],
      "byMethod": [
        { "method": "ONLINE", "collected": "26000.00", "paidCount": 8 }
      ],
      "outstanding": { "count": 9, "expected": "28000.00" }
    }
  }
  ```
  > `trend` is always exactly **12 entries**, oldest→newest, ending at `month`, zero-filled where a
  > month has no `SUCCESS` payments. `trend`/`byCourse`/`byTeacher`/`byMethod` subtract completed partial refunds
  > from `SUCCESS` payments for `month`
  > (byCourse sorted by collected desc). `outstanding` counts the same enrolments as `GET /outstanding`
  > (section 4d: active, active course, student not deactivated, enrolled in or before `month`, no `SUCCESS`
  > payment for `month`) and sums their month fee as `expected`; for a teacher it covers their own courses. All money values are
  > decimal strings (`"N.NN"`). Route is registered **before** `GET /:id` so `reports` isn't parsed
  > as a payment id. The endpoint deliberately returns aggregates only, never individual student
  > payment histories. A teacher-supplied `teacherId` is ignored and replaced by the authenticated
  > teacher ID server-side, so query manipulation cannot expand ownership scope.

### 4d. Who Owes (Admin / Super Admin)

Active enrolments that have no paid fee for a month, for the front desk to chase and the owner to review (finding F-10; F-78 fixed here too).
Registered **before** `GET /:id`, with the two routes below.

- **URL:** `/outstanding`
- **Method:** `GET`
- **Auth:** Required (Role: `SUPER_ADMIN`, `ADMIN`; `TEACHER`, `MARKER`, `STUDENT` get 403)
- **Query Params:** `month` (optional `YYYY-MM`, default the current month in the organization time zone; a month that has not started is `400 MONTH_IN_FUTURE`), `courseId` (optional UUID), `page` (default 1), `limit` (default 50, max 200)
- **Success Response (200 OK), `Cache-Control: no-store`:**
  ```json
  {
    "status": "success",
    "month": "2026-11",
    "count": 5,
    "data": [
      {
        "enrollmentId": "uuid", "studentId": "uuid", "studentName": "Nimal Perera", "indexNumber": 1001,
        "phone": "0771234567", "courseId": "uuid", "courseName": "Physics", "classType": "PHYSICAL",
        "monthsOwed": 3, "amount": "1500.00", "totalOwed": "4500.00",
        "inGrace": false, "graceUntil": "2026-11-10"
      }
    ]
  }
  ```
  > **Who counts as owing:** an active enrolment of an active course, for a student who is not deactivated, created in or before
  > `month` (in the organization time zone), with no `SUCCESS` payment for `month`. A `PENDING`, `FAILED` or `REFUNDED` row is not a payment.
  > The same filter feeds the `outstanding` figure of the financial report (4c), so the two always agree. `monthsOwed` counts unpaid months
  > inside the last `fees.arrearsReportMonths` months (default 3, at least the requested month) that fall on or after the month the student enrolled.
  > `amount` is the fee for `month` and `totalOwed` the fee of every owed month, both from the single fee function (`month-fee.service.ts`, today the
  > course `monthlyFee`; D-MONEY-2 swaps that one call). `inGrace` follows the content-gate rule: only for the current month, inside the first
  > `fees.graceDays` days, with the previous month paid when `fees.graceRequiresPreviousMonthPaid` is on, and never after a refund of the current month;
  > `graceUntil` is the last grace day (null for past months or when grace is off). `phone` is the student's own mobile until guardians exist (D-IDENTITY-2).
  > Rows are ordered by course name then index number and carry no email, NIC or address. The branch filter waits for `Course.instituteId` (Wave 2).

#### GET `/outstanding/export` (Super Admin only)

CSV of the same list for one month and optionally one course (`month`, `courseId`). `ADMIN` gets 403. Columns: index number, student, mobile, course,
mode, months owed, fee per month, total owed, in grace. Text that starts with `=`, `+`, `-`, `@`, tab or CR gets a leading apostrophe so a spreadsheet
cannot run it. `Content-Disposition: attachment; filename="outstanding-<month>.csv"`, `Cache-Control: no-store`. One audit row `OUTSTANDING_EXPORTED`
(month, course, row count; no student data) is written before the file is returned. More than 20,000 rows is `409 EXPORT_TOO_LARGE` (choose a course).

#### POST `/outstanding/reminders` (Admin / Super Admin)

Manual fee reminders. **Required header:** `Idempotency-Key: <uuid>`.

```json
{ "month": "2026-11", "courseId": "uuid", "enrollmentIds": ["uuid"] }
```

Send `courseId` (everyone owing in that course), `enrollmentIds` (up to 500; with `courseId` each must belong to it) or both; neither is a 400, unknown fields are a 400.
Success `200`: `{ "data": { "sent": 2, "skipped": [{ "enrollmentId": "uuid", "reason": "IN_GRACE" }] } }`. `sent` counts reminders, one per student however many courses owe
(the message names the first course and "and N more"). Skip reasons: `NOT_OWING` (a chosen enrolment that no longer owes), `IN_GRACE`, `REMINDER_LIMIT_REACHED`.

- Sent through `NotificationService.dispatch` as `FEE_DUE`. The in-app row is always created (it is the record the limit is counted from); the SMS goes only if the `FEE_DUE` SMS
  setting is on (seeded **off**, see `notifications.endpoints.md`) and the student has a mobile.
- Only from day `fees.reminderFromDay` (default 11) of the month, counted in Colombo: earlier is `409 REMINDER_TOO_EARLY`. `fees.reminderMaxPerStudentPerMonth` (default 1, 0 switches reminders off with
  `409 REMINDERS_DISABLED`) caps reminders per student per Colombo month, counted from the `Notification` rows under a per-month advisory lock, so two desks pressing together cannot both pass the cap.
- A student in the grace days is never reminded. SMS quiet hours (21:00-07:00) are **not enforced yet** (they arrive with the SMS settings in a later wave); keep the SMS setting off outside a trial.
- One audit row `FEE_REMINDER_SENT` per request: month, course, `sent` and skip counts only.
- Errors: 400 validation or `MONTH_IN_FUTURE`; 403; 404 `ENROLLMENT_NOT_FOUND` (an id that does not exist or is not in the given course; nothing is sent); 409 `REMINDER_TOO_EARLY`, `REMINDERS_DISABLED`.

### 4e. Cash by Day and the End-of-Day Count (Admin / Super Admin)

The "cash" of the counter is the money front desk took through **Collect payment** (`method = ENTRANCE`). A refund does not un-collect it, so
`SUCCESS` and `REFUNDED` rows both count. Cash is grouped by **Colombo calendar day**, collector and branch (`Payment.collectedAtInstituteId`; cash with
no branch recorded is its own group). The day comes from `Payment.collectedAt`, the instant staff took the money (set by `collect-entrance`; rows that
pre-date the column were backfilled from `updatedAt`). All four routes are registered **before** `GET /:id` and answer `Cache-Control: no-store`.

#### GET `/cash` and GET `/cash-tally` (Admin / Super Admin)

- **Auth:** `SUPER_ADMIN` sees every collector and may filter with `collectorId`; `ADMIN` sees only their own cash and is refused (`403`) when asking for another collector. `TEACHER`, `MARKER`, `STUDENT` get 403.
- **Query Params:** `from`, `to` (`YYYY-MM-DD`; default the last seven days ending today in the organization zone; at most 93 days, else `400 RANGE_TOO_LARGE`; `from` after `to` is `400 INVALID_RANGE`), `instituteId`, `collectorId` (owner only). `GET /cash-tally` also takes `unreconciled=true`.
- **`/cash`** lists every (day, collector, branch) with cash, joined to the count recorded for it. **`/cash-tally`** is the same rows limited to counted days.
- **Success Response (200 OK):**
  ```json
  {
    "status": "success", "from": "2026-11-14", "to": "2026-11-20", "tallyEnabled": true, "count": 1,
    "data": [{
      "day": "2026-11-20", "collectorId": "uuid", "collectorName": "Nimal", "instituteId": "uuid", "instituteName": "Kandy",
      "amount": "7500.00", "paymentCount": 3,
      "tally": {
        "id": "uuid", "countedAmount": "7499.00", "systemAmount": "7500.00", "variance": "-1.00", "paymentCount": 3, "note": null,
        "closedAt": "2026-11-20T10:00:00.000Z", "flagged": true, "staleSinceClose": false,
        "reconciledAt": null, "reconciledByName": null
      }
    }]
  }
  ```
  `amount` and `paymentCount` are **live**. `tally` is `null` for a day nobody counted. `variance` is counted minus system (negative is short). `flagged` is true when
  the difference is beyond `tally.varianceFlagAmount` (default 0, so any difference), either way. `staleSinceClose` is true when the live cash no longer equals what the count recorded
  (cash taken, refunded or overridden afterwards); a counted day whose cash has since gone away still appears, as a zero row. `tallyEnabled` mirrors `tally.enabled`.

#### POST `/cash-tally` (Admin / Super Admin)

The caller counts the cash **they** took on one day at one branch. There is no collector field (it is always the caller; extra fields are a 400).

```json
{ "day": "2026-11-20", "instituteId": "uuid", "countedAmount": 7499, "note": "one coin short" }
```

`day` defaults to today (Colombo) and may be a past day, never a day that has not started (`400 DAY_IN_FUTURE`). `instituteId` null or absent counts the cash with no branch recorded; an
unknown branch is `404 INSTITUTE_NOT_FOUND`. `countedAmount` is rupees, at most two decimals, `0` to 100,000,000. The system amount is computed inside a per-collector, per-day, per-branch
advisory lock and stored with the count, so counting again **updates the same row** (no duplicate). It is a record, not a lock: cash taken afterwards still lands and the row reports `staleSinceClose`.
Naturally idempotent, so no `Idempotency-Key`. Writes the audit row `CASH_DAY_CLOSED` (day, branch, counted, system, variance, payment count) in the same transaction.
- **Errors:** 400 validation or `DAY_IN_FUTURE`; 403; 404 `INSTITUTE_NOT_FOUND`; 409 `TALLY_DISABLED` (the owner turned `tally.enabled` off), `TALLY_RECONCILED` (the owner already reconciled that day; ask the owner).

#### PATCH `/cash-tally/:id/reconcile` (Super Admin only)

Marks a counted day as checked. Repeating it changes nothing and writes no second audit row (`data.alreadyReconciled` says which). `404 CASH_TALLY_NOT_FOUND` for an id that does not exist or belongs
to another organization. Writes the audit row `CASH_TALLY_RECONCILED`. A reconciled day cannot be counted again.

---

### 5. List All Payments (Admin)
Allows admins to list and filter all payments in the system.

- **URL:** `/`
- **Method:** `GET`
- **Auth:** Required (Role: `ADMIN`, `STAFF`)
- **Query Params:**
  - `page`: default 1
  - `limit`: default 20
  - `status`: Filter by status
  - `paymentMonth`: Filter by month
  - `enrollmentId`: Filter by enrollment
  - `userId`: Filter by student
  - `courseId`: Filter by course
- **Success Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": [...],
    "count": 100
  }
  ```

### 6. Override Payment (Admin)
Allows an admin to manually update a payment status or amount (e.g., for physical payments).
Sets `method: MANUAL` and `collectedById` to the acting admin's id.

- **URL:** `/:id/override`
- **Method:** `PATCH`
- **Auth:** Required (Role: `ADMIN`)
- **Headers:** `Idempotency-Key: <uuid>` **required** — a fresh v4 UUID per request. Missing or
  malformed keys return 400; replaying the same key returns the original stored response. The
  SUPER_ADMIN payment-record UI sends one key per reviewed override action.
- **Body:**
  ```json
  {
    "status": "SUCCESS",
    "amount": 2500,
    "note": "Paid cash at center"
  }
  ```
  `note` is required (3–500 characters) because it becomes the immutable ledger reason. `REFUNDED`
  cannot be selected through override; only the completed-refund endpoint can produce that status.
  The `/payments` record table exposes this action only to `SUPER_ADMIN`. The review form starts
  from the current status and amount, requires a fresh reason, validates positive amounts and the 500-character note
  limit, preserves values on failure, and refreshes the server-rendered record after success.

### 6b. List Payment Adjustments

- **URL:** `/:id/adjustments`
- **Method:** `GET`
- **Auth:** `SUPER_ADMIN`, `ADMIN`, or owning `STUDENT`
- **Response:** append-only `OVERRIDE`/`REFUND` events with before/after status and amount snapshots,
  reason, optional external reference, actor, and creation time. Students are self-scoped.

### 6c. Record a Completed Refund

Records money that a SUPER_ADMIN has **already returned outside the LMS**. It does not call PayHere,
a bank, or a cash-payment provider.

- **URL:** `/:id/refunds`
- **Method:** `POST`
- **Auth:** `SUPER_ADMIN` only
- **Headers:** `Idempotency-Key: <uuid>` required
- **Body:**
  ```json
  {
    "amount": 500,
    "reason": "Duplicate collection",
    "externalReference": "PAYHERE-REF-123"
  }
  ```
- A partial refund keeps `SUCCESS`; refunding the exact remaining balance changes the payment to
  `REFUNDED`, which removes paid-content access. Total refunds cannot exceed the gross amount.
- Errors: `PAYMENT_NOT_FOUND` (404), `PAYMENT_NOT_REFUNDABLE` (409),
  `REFUND_EXCEEDS_REMAINING` (409), `REFUND_CONFLICT` (409).

### 7. Bulk Upload Payments (Owner)
A migration and recovery tool for fees that were paid outside the system. Only `SUPER_ADMIN` may use it (since Wave 1, F-58; front desk
collects one payment at a time through endpoint 8). Every row is checked, and the file is **all or nothing**: one refused row, or a
failure part way, saves nothing. Rows that pass become `SUCCESS` payments with `method: BULK`, `collectedById` set to the owner and the
course fee as the amount. `collectedAt` stays empty, so bulk rows never count as desk cash.

- **URL:** `/bulk-upload?dryRun=true|false` (`dryRun` defaults to `false`; with `true` the file is checked and **nothing is written**)
- **Method:** `POST`
- **Auth:** Required (Role: `SUPER_ADMIN`)
- **Headers:** `Idempotency-Key: <uuid>` **required** — a fresh v4 UUID per request. Missing or
  malformed keys return 400; replaying the same key returns the original stored response, so a check and the apply that follows it need
  different keys (the screen does this).
- **Body:** `multipart/form-data` with `file` field: an `.xlsx` (the first sheet; row 1 is the header). Columns, in any case or spacing:
  `enrollmentId` **or** `indexNumber` + `courseId` + `classType`, plus `paymentMonth` (`YYYY-MM` or `YYYYMM`), optional `amount`, optional `note`.
- **Row rules, checked in this order (the first one a row breaks is reported):** the enrollment exists in the caller's organization; the student
  account is not deactivated; the enrollment is active; the course is active; `paymentMonth` is not later than the current billing month plus
  `fees.advanceMonthsAllowed` (default 1; earlier months are allowed so past fees can be recovered); `amount`, when given, equals the course
  `monthlyFee` (it is never an override); the month has no `SUCCESS` payment (never overwritten) and no `REFUNDED` one (immutable); no earlier row
  of the same file covers the same enrollment and month. An existing `PENDING` or `FAILED` row is converted to `SUCCESS`.
- **Limit:** at most `bulk.maxRows` data rows (default 300; blank rows are not counted).
- **Success Response (200 OK):**
  ```json
  {
    "status": "success",
    "data": {
      "dryRun": true,
      "applied": false,
      "total": 3,
      "created": 2,
      "updated": 1,
      "errors": [{ "row": 5, "message": "This month is already paid." }]
    },
    "message": "Preview only. Nothing was saved."
  }
  ```
  `row` is the spreadsheet row number. `applied` is `true` only when the payments were saved: a check, or a real run with any entry in
  `errors`, saves nothing. `created` counts rows that become new payments and `updated` rows that convert an unpaid or failed one. The response
  is `Cache-Control: no-store`.
- **Audit:** one `PAYMENT_BULK_ROW_APPLIED` row per applied row (target: the payment; row number, kind, enrollment, month, amount) and one
  `PAYMENT_BULK_UPLOAD` summary row, all written in the same transaction as the payments. A check writes no audit row.
- **Errors:** `400 BULK_UPLOAD_INVALID_FILE`, `400 BULK_UPLOAD_EMPTY`, `400 BULK_UPLOAD_TOO_MANY_ROWS`, `400` for a bad `dryRun` value or a missing `file`,
  `403 FORBIDDEN` for any other role, and `409 BULK_UPLOAD_CONFLICT` when a payment for one of the months appeared between the check and the
  write (nothing is saved; run the check again).

### 8. Collect Entrance Payment (Admin/Staff)
Records a cash/in-person payment collected at the physical center, without going through
PayHere. A missing row is created and a PENDING/FAILED row is converted to `SUCCESS`/`ENTRANCE`, stamping
`collectedAt` (the instant the money was taken, which the end-of-day count in 4e groups by). **Any existing
`SUCCESS` row is refused with `409 ALREADY_PAID`** (online ones with the more specific `ALREADY_PAID_ONLINE`) — a paid month is
never overwritten here, so a day's cash cannot change silently; correct a paid month with `/override`. Both writes are conditional, so two desks
collecting the same month together cannot both succeed: the loser gets `409 ALREADY_PAID`.

- **URL:** `/collect-entrance`
- **Method:** `POST`
- **Auth:** Required (Role: `SUPER_ADMIN`, `ADMIN`)
- **Headers:** `Idempotency-Key: <uuid>` **required**.
- **Body:**
  ```json
  {
    "enrollmentId": "uuid",
    "paymentMonth": "YYYY-MM",
    "amount": 2500,
    "collectedAtInstituteId": "uuid",
    "collectedViaBarcode": "NUG-00123"
  }
  ```
  `amount` optional (defaults to the course's `monthlyFee`). `collectedAtInstituteId`/
  `collectedViaBarcode` optional — present only when the student was identified via
  `GET /users/resolve-barcode` (see `users.endpoints.md`) rather than a name/index search.
- **Success Response (200 OK):** the `Payment` (same shape as `/override`'s response).
- **Errors:** `404 ENROLLMENT_NOT_FOUND`, `400 ENROLLMENT_NOT_ACTIVE`, `400 FUTURE_MONTH` (cannot collect after the enrollment organization's current billing month), `409 ALREADY_PAID_ONLINE`, `409 ALREADY_PAID`, `409 PAYMENT_REFUNDED_IMMUTABLE`. `collectedAtInstituteId` should be the branch the desk is sitting at (the screen remembers it per device); the student's home branch from a barcode scan is only a fallback.

---

## Sandbox testing (PayHere)

`PAYHERE_BASE_URL=https://sandbox.payhere.lk` in `backend/.env`. Use PayHere's published
**sandbox test cards** on the checkout page — these are dummy numbers that only work against the
sandbox merchant, never a real charge:

Source: <https://support.payhere.lk/sandbox-and-testing>. For **Name on Card / CVV / Expiry** enter
any valid-looking data (future expiry). **Any card other than the ones below results in a failed
payment.**

**Successful payment:**

| Card | Number |
|---|---|
| Visa | `4916217501611292` |
| MasterCard | `5307732125531191` |
| Amex | `346781005510225` |

**Decline scenarios** (to exercise our failure handling):

| Scenario | Visa | MasterCard | Amex |
|---|---|---|---|
| Insufficient Funds | `4024007194349121` | `5459051433777487` | `370787711978928` |
| Limit Exceeded | `4929119799365646` | `5491182243178283` | `340701811823469` |
| Do Not Honor | `4929768900837248` | `5388172137367973` | `374664175202812` |
| Network Error | `4024007120869333` | `5237980565185003` | `373433500205887` |

Sandbox never processes a real charge — outcomes are simulated. Sandbox is a **separate** deployment
from Live; sandbox credentials/details can't be reused for a Live account.

### In-app (onsite) checkout
Paying uses PayHere's **onsite JS checkout** (`payhere.startPayment`, loaded via
`components/custom/PayhereScript.tsx` → `lib/payhere.ts` `startPayherePayment`): the checkout opens
in a **modal on our own page** (card fields inside PayHere's secure iframe — we never touch card
data, no PCI scope), falling back to the classic full-page redirect only if `payhere.js` is blocked.
`sandbox` is derived from the checkout host. `onCompleted` is **not** authoritative — SUCCESS/FAILED
is confirmed by the notify webhook (below); the UI shows "submitted, confirming" until then.

### Callback URLs — required for an end-to-end status flip
A PayHere charge only becomes `SUCCESS` in our DB when PayHere calls **`notify_url`**
(`/api/payments/payhere/notify`, the signed webhook) — **not** when the browser returns. Therefore:

- **`PAYHERE_NOTIFY_URL` must be publicly reachable by PayHere's servers.** On a laptop/VPS behind
  NAT this means a tunnel (e.g. `ngrok http 80` → set `PAYHERE_NOTIFY_URL` to
  `https://<tunnel>/api/payments/payhere/notify`). With a non-reachable notify URL, the student can
  complete checkout but the payment **stays `PENDING`** (and the admin summary's *Collected* won't
  move) — this is expected, not a bug.
- **`PAYHERE_RETURN_URL` / `PAYHERE_CANCEL_URL`** should point back into the app
  (e.g. `http://localhost:3000/payments`). ⚠️ As of 2026-07-11 all three are the placeholder
  `localhost.com` in `backend/.env`; set them before real sandbox testing or the post-payment
  redirect leaves the app.

## Idempotency & duplicate-charge safety (verified 2026-07-11)

`POST /initiate` requires a UUID `Idempotency-Key` (§1). Behaviour, confirmed against the live stack:

- **Same key replayed** (e.g. the API client's 401→refresh→retry) → the first response is cached and
  replayed; the handler does **not** run twice.
- **Different key, same `(enrollmentId, paymentMonth)`** (e.g. a user clicking Pay twice) → the
  service `upsert`s the **same** `Payment` row (unique `@@unique([enrollmentId, paymentMonth])`), so
  there is never a second row and never a second charge — the final charge is settled by PayHere
  against that one `order_id = payment.id`.
- The frontend also disables the Pay button while a request is in flight (`StudentPayments`,
  `EnrollPanel`), so an in-flight double-click can't fire two requests.
