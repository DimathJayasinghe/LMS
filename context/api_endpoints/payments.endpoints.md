# Payment System API Endpoints

## Base URL: `/api/payments`

> **Roles (2026-07-09)**: enum is `SUPER_ADMIN/TEACHER/ADMIN/MARKER/STUDENT`. Below, `ADMIN` = **`SUPER_ADMIN`** and `STAFF` = **`ADMIN`** (front-desk). `PATCH /:id/override` is `SUPER_ADMIN` only.
>
> `Payment.status` is `PENDING | SUCCESS | FAILED | REFUNDED`. `amount` is the original gross
> amount; `refundedAmount` is the sum of completed refunds. Financial totals report the net retained
> amount. A fully refunded row is terminal and cannot be reused by PayHere, entrance, bulk, or override flows.

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
  - `month` (optional, `YYYY-MM`; defaults to the current payment month)
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
  > (byCourse sorted by collected desc). `outstanding` counts **active** enrolments with no `SUCCESS`
  > payment for `month`, and sums their course `monthlyFee` as `expected`. All money values are
  > decimal strings (`"N.NN"`). Route is registered **before** `GET /:id` so `reports` isn't parsed
  > as a payment id. The endpoint deliberately returns aggregates only, never individual student
  > payment histories. A teacher-supplied `teacherId` is ignored and replaced by the authenticated
  > teacher ID server-side, so query manipulation cannot expand ownership scope.

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

### 7. Bulk Upload Payments (Admin)
Upload an Excel file to process multiple payments at once. Sets `method: BULK` on every row
written or updated.

- **URL:** `/bulk-upload`
- **Method:** `POST`
- **Auth:** Required (Role: `ADMIN`, `STAFF`)
- **Headers:** `Idempotency-Key: <uuid>` **required** — a fresh v4 UUID per request. Missing or
  malformed keys return 400; replaying the same key returns the original stored response.
- **Body:** `multipart/form-data` with `file` field.

### 8. Collect Entrance Payment (Admin/Staff)
Records a cash/in-person payment collected at the physical center, without going through
PayHere. Upserts: a missing or PENDING/FAILED row is written to `SUCCESS`/`ENTRANCE`; a
confirmed **online** `SUCCESS` (has a `payhereId`) is refused rather than overwritten — use
`/override` to correct an online payment.

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
- **Errors:** `404 ENROLLMENT_NOT_FOUND`, `400 ENROLLMENT_NOT_ACTIVE`, `400 FUTURE_MONTH`
  (cannot collect for a month after the current payment month), `409 ALREADY_PAID_ONLINE`.

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
