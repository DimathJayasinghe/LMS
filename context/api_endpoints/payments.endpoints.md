# Payment System API Endpoints

## Base URL: `/api/payments`

> **Roles (2026-07-09)**: enum is `SUPER_ADMIN/TEACHER/ADMIN/MARKER/STUDENT`. Below, `ADMIN` = **`SUPER_ADMIN`** and `STAFF` = **`ADMIN`** (front-desk). `PATCH /:id/override` is `SUPER_ADMIN` only.
>
> **New**: `Payment.method` (`ONLINE` | `ENTRANCE` | `BULK` | `MANUAL`) + `collectedById` (staff who took an `ENTRANCE`/`MANUAL` payment). A dedicated pay-at-entrance endpoint is a follow-up.

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
- **Auth:** None (Public, verified via PayHere MD5 signature)
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
  - `status`: `PENDING` | `SUCCESS` | `FAILED` (optional)
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
      "failedCount": 0
    }
  }
  ```
  > `collectedTotal` sums `amount` over `status = SUCCESS` for the month. Route is registered
  > **before** `GET /:id` so `summary` isn't parsed as a payment id.

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

- **URL:** `/:id/override`
- **Method:** `PATCH`
- **Auth:** Required (Role: `ADMIN`)
- **Body:**
  ```json
  {
    "status": "SUCCESS",
    "amount": 2500,
    "note": "Paid cash at center"
  }
  ```

### 7. Bulk Upload Payments (Admin)
Upload an Excel file to process multiple payments at once.

- **URL:** `/bulk-upload`
- **Method:** `POST`
- **Auth:** Required (Role: `ADMIN`, `STAFF`)
- **Body:** `multipart/form-data` with `file` field.

---

## Sandbox testing (PayHere)

`PAYHERE_BASE_URL=https://sandbox.payhere.lk` in `backend/.env`. Use PayHere's published
**sandbox test cards** on the checkout page — these are dummy numbers that only work against the
sandbox merchant, never a real charge:

| Card | Number | Expiry | CVV |
|---|---|---|---|
| Visa | `4916217501611292` | any future date (e.g. `12/29`) | any 3 digits (e.g. `123`) |
| MasterCard | `5307732125531191` | any future date | any 3 digits |
| Amex | `346781005510225` | any future date | any 4 digits (e.g. `1234`) |

- **Name on card:** anything. **3-D Secure / OTP page (sandbox):** enter `123456`.
- A **successful** sandbox payment uses the numbers above as-is. To simulate a **failure**, use any
  other/invalid card number.

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
