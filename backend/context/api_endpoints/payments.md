# Payment System API Endpoints

## Base URL: `/api/payments`

### 1. Initiate Payment (PayHere Checkout)
Generates the payload required to redirect a student to PayHere checkout.

- **URL:** `/initiate` or `/payhere/checkout`
- **Method:** `POST`
- **Auth:** Required (Role: `STUDENT`)
- **Body:**
  ```json
  {
    "enrollmentId": "uuid",
    "paymentMonth": "YYYY-MM"
  }
  ```
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
