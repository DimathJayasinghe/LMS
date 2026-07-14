# Pay-at-Entrance Flow — Design

**Date:** 2026-07-14
**Branch:** `feature/pay-at-entrance`
**Status:** Implemented — all 13 plan tasks done, unit + system + live-stack smoke verified (2026-07-14)

## Goal

Let front-desk staff (`ADMIN`) and `SUPER_ADMIN` record a cash/in-person payment for a
student at the physical center, in real time, without going through the PayHere
checkout flow. `Payment.method` (`ONLINE | ENTRANCE | BULK | MANUAL`) and
`Payment.collectedById` already exist on the schema for exactly this — this feature
is the first thing to actually set them correctly.

## Decisions (locked with the user)

- **Roles:** `ADMIN` (front-desk) + `SUPER_ADMIN`. Matches the existing payment
  list/summary endpoints' access, and matches the point of "entrance" collection —
  front-desk does this routinely without escalating.
- **Student lookup:** search by name/index (debounced, reuses `GET /users?search=`)
  plus an optional barcode/QR scan — same dual pattern as the existing attendance
  `StaffScanner`. `QrCamera.tsx` is promoted from `attendance/_components` to
  `components/custom/` so both features share one zxing integration instead of
  duplicating it.
- **Existing-payment handling:** upsert semantics, mirroring `bulkUploadPayments`'
  existing logic — if a `Payment` row already exists for `(enrollmentId,
  paymentMonth)` and is a confirmed **online** `SUCCESS` (has a `payhereId`), reject
  with `409 ALREADY_PAID_ONLINE`. Otherwise (no row, or an existing
  PENDING/FAILED/prior-ENTRANCE row) upsert it to `SUCCESS` / `ENTRANCE`.
- **Month scope:** current payment month + past unpaid months (arrears), never a
  future month. Staff sees the student's outstanding months for the chosen
  enrollment and collects one at a time.
- **Amount:** defaults to `enrollment.course.monthlyFee`, editable by staff (partial
  payments, discounts) — same flexibility `/override` already has.
- **Granularity:** one API call per month collected. A student owing 2 months means
  two submissions (immediate UI feedback per month, simpler idempotency, matches the
  existing granularity of `/initiate` and `/override`).
- **Idempotency:** required `Idempotency-Key` header, reusing the existing
  `checkIdempotency` middleware + `IdempotencyRecord`/Redis lock — this is a
  high-stakes payment POST per CLAUDE.md's standing invariant.
- **Sibling fix (same PR):** `overridePayment` and `bulkUploadPayments` currently
  never set `method`/`collectedById` at all (`method` silently defaults to
  `ONLINE` even for a manual override or a bulk import) — fixed alongside this
  feature since it's the same fields, and financial reports (`byMethod` breakdown)
  are wrong until this is fixed. Additionally, `paymentSelect` (the shared Prisma
  `select` used by every payment read — list/get/override/collect-entrance) doesn't
  select `method` or `collectedBy` **at all**, so even a correctly-set value would
  never reach the frontend today. Fixed alongside, since the receipt feature below
  depends on it.
- **Receipts:** printable only, both single-payment and a batch/session summary.
  **Emailed** receipts are explicitly deferred — this project deliberately removed
  all email-sending infrastructure earlier (`email.job.ts`, the email queue/worker,
  `RESEND_*` env, the `resend` dependency — see `06-progress-tracker.md` Phase S),
  and reintroducing it (provider choice, cost, a new BullMQ job per CLAUDE.md's
  background-work invariant) is a separate decision, not something to fold into
  this feature.
- **Receipt lookup (QR + reference code):** authenticated only — the QR encodes a
  deep link into the app (`/payments/:id`), reusing `GET /payments/:id`'s existing
  authorization (owner student, `ADMIN`, `SUPER_ADMIN`) as-is. No new public/
  unauthenticated surface handling payment data. The reference code **is**
  `Payment.id` (the existing UUID) — no new sequence/counter field.
- **Collection provenance:** entrance collections capture *where* (which
  `Institute`) and *how the student was identified* (which barcode), whenever that
  information is actually available — i.e. when staff identify the student via a
  **scan** (their institute-issued `StudentBarcode`, or the global LMS `User.barcode`
  as a fallback) rather than a name/index search. A name-search-identified
  collection simply leaves these fields null, same as an `ONLINE` payment already
  has no physical location.

## Existing code this builds on

- `Payment.method`/`collectedById` columns (already on schema, currently unused
  correctly).
- `bulkUploadPayments`'s existing-row upsert logic (`payment.service.ts`) — the new
  endpoint's conflict handling mirrors it rather than inventing a new pattern.
- `overridePayment` — same file, same "load payment → validate → update → audit →
  notify" shape the new service function follows.
- `GET /api/users?search=` (already matches `name`/`email`/`nic`/`barcode`) — reused
  for both the name/index search box and the barcode-scan resolution.
- `GET /api/enrollments?userId=&isActive=true` — reused to list a selected student's
  active enrollments.
- `GET /api/payments?enrollmentId=&limit=` — reused (no new read endpoint) to derive
  outstanding months client-side: months since the enrollment's `createdAt` through
  the current payment month with no `SUCCESS` row.
- `StaffScanner.tsx` (`attendance/_components`) — UX precedent for the
  search-or-scan pattern; `QrCamera.tsx` is promoted out of that folder to be
  shared.
- `AUDIT_ACTION.PAYMENT_OVERRIDDEN` / `NOTIFICATION_TEMPLATES.PAYMENT_CONFIRMED` —
  new action `PAYMENT_ENTRANCE_COLLECTED` added alongside; the existing
  `PAYMENT_CONFIRMED` notification template is reused as-is (a confirmed payment
  reads the same to the student regardless of channel).
- `AttendanceQr.tsx` (`attendance/_components`) — the exact QR-rendering pattern
  (`qrcode.react`'s `QRCodeSVG`, value printed underneath on a white plate) reused
  for the receipt page's QR.
- `StudentBarcode` / `User.barcode` — the two existing barcode concepts (per-
  institute vs. global LMS-QR) this feature's new resolver reads from. Note that
  today's entrance **attendance** scanner (`attendance.service.ts`'s `scanBarcode`)
  only ever checks `User.barcode`, never `StudentBarcode` — a separate,
  pre-existing gap (tracked in `06-progress-tracker.md`) this feature does not
  touch or fix; the new `resolve-barcode` endpoint is payments-only.

## Schema

`Payment` gains two nullable, entrance-only-in-practice columns:

```prisma
collectedAtInstituteId String?
collectedAtInstitute   Institute? @relation(fields: [collectedAtInstituteId], references: [id], onDelete: SetNull)
collectedViaBarcode    String? // raw barcode value that identified the student — a
                                // point-in-time snapshot, not a live FK, since
                                // StudentBarcode rows can be hard-deleted later
                                // and this must stay a stable audit fact
```

`Institute` gains the inverse relation `payments Payment[]`. New index:
`@@index([collectedAtInstituteId])`.

## Backend

### New endpoint: `GET /api/users/resolve-barcode?code=`

- **Auth:** `ADMIN`, `SUPER_ADMIN`.
- Resolution order:
  1. `StudentBarcode.findMany({ where: { barcode: code } })` — barcode uniqueness
     is only enforced **per institute** (`@@unique([instituteId, barcode])`), so a
     scanned value could in theory match more than one institute. Exactly one
     match → resolved, with that row's `instituteId`. Zero or multiple matches →
     fall through (multiple is treated as unresolved rather than guessing — a
     rare edge case, not worth a disambiguation UI).
  2. `User.findUnique({ where: { barcode: code } })` (the global LMS-QR) → resolved
     with `instituteId: null`.
  3. Neither → `404 BARCODE_NOT_FOUND`.
- **Success (200):** `{ user: { id, name, indexNumber }, instituteId: string | null, matchedBarcode: string }`.
- Lives in `user.service.ts` as `resolveStudentByBarcode(code)` (reuses the
  `BARCODE_NOT_FOUND` error code already established by
  `attendance.service.ts`'s `scanBarcode` for the same conceptual failure), wired
  via `user.controller.ts` + a new route in `user.routes.ts` registered **before**
  `/:id` (same reason `/me/...` is registered early — so `resolve-barcode` isn't
  parsed as a user id).

### New endpoint: `POST /api/payments/collect-entrance`

- **Auth:** `ADMIN`, `SUPER_ADMIN`.
- **Headers:** `Idempotency-Key: <uuid>` required.
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
  `amount` optional — defaults to the enrollment's course `monthlyFee` server-side
  if omitted. `collectedAtInstituteId`/`collectedViaBarcode` optional — present
  only when the student was identified via the scan-resolve flow above; absent
  (null) when identified via name/index search.
- **Success (200):** the updated/created `Payment` (same shape `overridePayment`
  returns).
- **Errors:**
  - `404 ENROLLMENT_NOT_FOUND`
  - `400 ENROLLMENT_NOT_ACTIVE` — cancelled enrollment
  - `400 FUTURE_MONTH` — `paymentMonth` is after the current payment month
  - `409 ALREADY_PAID_ONLINE` — a confirmed online payment already covers this month
  - Standard 400 validation (amount `> 0`, `paymentMonth` matches
    `PAYMENT_MONTH_REGEX`, `collectedAtInstituteId` is a UUID when present)

### `payment.service.ts`: `collectEntrancePayment`

```
collectEntrancePayment(enrollmentId, paymentMonth, amount | undefined, collectedById, collectedAtInstituteId | undefined, collectedViaBarcode | undefined):
  enrollment = find enrollment by id (include course) → 404 if missing
  if !enrollment.isActive → 400 ENROLLMENT_NOT_ACTIVE
  if paymentMonth > getCurrentPaymentMonth() → 400 FUTURE_MONTH  // reuse access.service.ts's existing helper, not a new one
  resolvedAmount = amount ?? enrollment.course.monthlyFee
  existing = find Payment by (enrollmentId, paymentMonth)
  if existing?.status === SUCCESS && existing.payhereId → 409 ALREADY_PAID_ONLINE
  fields = { status: SUCCESS, method: ENTRANCE, amount: resolvedAmount, collectedById, collectedAtInstituteId, collectedViaBarcode, note: 'Collected at entrance' }
  payment = existing ? update existing → fields : create → { enrollmentId, paymentMonth, ...fields }
  audit: PAYMENT_ENTRANCE_COLLECTED
  notify: PAYMENT_CONFIRMED (existing template)
  return payment
```

### Sibling fixes in the same file

- `overridePayment(paymentId, input, actingAdminId)` — gains a third param, sets
  `method: MANUAL, collectedById: actingAdminId` in the `update` call. Controller
  passes `req.user!.userId`.
- `bulkUploadPayments` — both the `update` and `create` branches inside the row loop
  gain `method: BULK` (no `collectedById` — no single staff member "collected" a
  spreadsheet row).
- `paymentSelect` — add `method: true`, `collectedBy: { select: { id: true, name: true } }`,
  `collectedAtInstitute: { select: { id: true, name: true, code: true } }`, and
  `collectedViaBarcode: true`. This is what every payment read endpoint uses
  (list/my/get-by-id/override/collect-entrance), so this one change is what makes
  all of this actually visible to the frontend anywhere, including the receipt
  view below.

## Receipts

Printable only (see Decisions above for why emailed receipts are deferred). No PDF
generation library, no backend changes beyond the `paymentSelect` fix above — a
browser print of a styled HTML view is enough, consistent with this project's
lowest-complexity bias.

### Single-payment receipt — `/payments/[id]`

New page: `frontend/app/(app)/payments/[id]/page.tsx` (SSR, mirrors the `/profile`
pattern — loads via `api.get("/payments/:id", { cookie })`). No payment detail page
exists today; this doubles as both "click Receipt" destination and the QR/reference
lookup target (see Decisions above), so it's built once, used both ways, rather
than as a separate modal.

Shows: student name + index number, course name + year + classType, payment
month, amount, status, method, collected-by name (when `method !== ONLINE`),
collected-at institute name + code and the barcode used (when present),
`payhereId` (when `ONLINE`), and `createdAt` as the receipt date/time. A
`QRCodeSVG` (reusing `qrcode.react`, same as `AttendanceQr.tsx`) encodes this
page's own URL; the `Payment.id` is printed underneath as the typed-in fallback
reference, mirroring `AttendanceQr`'s value-under-QR layout. A "Print" button
(`window.print()`) plus dedicated `@media print` CSS (hides `TopBar`/nav,
full-width, serif/receipt-style layout).

Auth: unchanged — `GET /payments/:id` already restricts to the owning student,
`ADMIN`, `SUPER_ADMIN`; a logged-out or unauthorized scan just hits the normal
redirect-to-login / 403 handling already in place for every other page in `(app)`.

Linked (not embedded) from:
- `StudentPayments.tsx` — a "Receipt" link (`target="_blank"`) on each of the
  student's own `SUCCESS` payments.
- `CollectPayment.tsx` — immediately after a successful entrance collection.

### Batch/session receipt

Front-desk's "collected today" summary for end-of-day reconciliation. Kept
**client-side only** — no new backend query surface:
`CollectPayment.tsx` accumulates each successful `POST
/payments/collect-entrance` response into local component state for the lifetime
of the browser session (resets on page reload — this mirrors how the component
already needs to hold "current student's outstanding months" state, not a new
persistence concept). A "Print session summary" button renders all accumulated
collections as a table (student, course, month, amount, each row linking to its
own `/payments/{id}` for the full receipt) with a total, using the same print
stylesheet approach as the single-payment receipt.

This is deliberately not a persisted, reload-safe "session" — if staff need a
historical reconciliation report beyond what's visible in the current tab, that's
what the existing admin payment list (`GET /payments?method=ENTRANCE&...`) and
`/admin/reports` already cover.

### New constant

`AUDIT_ACTION.PAYMENT_ENTRANCE_COLLECTED` in `backend/src/utils/constants.ts`,
alongside the existing `PAYMENT_OVERRIDDEN`/`PAYMENT_BULK_UPLOAD`.

## Frontend

### `QrCamera.tsx` relocation

Move `frontend/app/(app)/attendance/_components/QrCamera.tsx` →
`frontend/components/custom/QrCamera.tsx` (no logic changes — it has no
attendance-specific code). Update `StaffScanner.tsx`'s import.

### New component: `CollectPayment.tsx`

`frontend/app/(app)/payments/_components/CollectPayment.tsx`, rendered as a new
card in `AdminPayments.tsx` alongside the existing bulk-upload section.

Flow:
1. Debounced search (`GET /users?search=&role=STUDENT&limit=8`) **or** a `QrCamera`
   scan — same dual pattern as `StaffScanner`, but a scan hits the new
   `GET /users/resolve-barcode?code=` instead of the generic search, capturing
   `instituteId`/`matchedBarcode` alongside the resolved student. A search-selected
   student carries no institute/barcode context.
2. On selecting a student: `GET /enrollments?userId=<id>&isActive=true` → list as a
   picker (`course.name` + classType badge).
3. On selecting an enrollment: `GET /payments?enrollmentId=<id>&limit=12` → derive
   outstanding months client-side (every `YYYY-MM` from the enrollment's
   `createdAt` month through the current payment month with no matching `SUCCESS`
   row) → render as a small list, current month pre-selected/highlighted.
4. Amount input pre-filled from `enrollment.course.monthlyFee` (present on the
   enrollment's embedded `course`), editable.
5. Submit → `POST /payments/collect-entrance` with a fresh UUID
   `Idempotency-Key`, including `collectedAtInstituteId`/`collectedViaBarcode` if
   step 1 resolved via scan → success toast, a "Receipt" link to `/payments/{id}`,
   and the collection appended to the session-summary list (below) → re-fetch the
   outstanding-months list (step 3) so staff can immediately collect the next owed
   month for the same student.

### Error handling

- `409 ALREADY_PAID_ONLINE` → that month renders as "Paid online" (no collect
  button) instead of a raw error toast.
- `400 ENROLLMENT_NOT_ACTIVE` → shouldn't normally be reachable (the enrollment
  picker only lists active ones) — if hit anyway (race with a cancellation), show
  the server message and refresh the enrollment list.
- Network/validation errors → inline error text under the amount field, same
  pattern as `ContactForm`/`CredentialForms` from the profile feature.

## Testing

- **Backend Vitest** (`payment.service.test.ts`, extending the existing file):
  - `collectEntrancePayment`: creates when no row exists; updates when an existing
    row is PENDING/FAILED; updates when an existing row is a prior ENTRANCE
    SUCCESS (correcting an amount); rejects with `ALREADY_PAID_ONLINE` when the
    existing row is an online SUCCESS; defaults amount to `monthlyFee` when
    omitted; rejects `ENROLLMENT_NOT_ACTIVE`; rejects `FUTURE_MONTH`; persists
    `collectedAtInstituteId`/`collectedViaBarcode` when passed, leaves them null
    when omitted.
  - `overridePayment`: now asserts `method: MANUAL` and `collectedById` are set.
  - `bulkUploadPayments`: now asserts `method: BULK` on both create and update
    branches.
  - Any existing test asserting the shape of `paymentSelect`'s output updated to
    include the new fields.
- **Backend Vitest** (new `user.service.test.ts` cases for `resolveStudentByBarcode`):
  single `StudentBarcode` match → resolved with its `instituteId`; zero matches →
  falls through to `User.barcode`; ambiguous (2+ `StudentBarcode` matches across
  institutes) → unresolved (falls through, does not guess); no match anywhere →
  `404 BARCODE_NOT_FOUND`.
- **Frontend RTL:**
  - `CollectPayment.test.tsx` — search→select-student→select-enrollment→submit
    happy path calls `POST /payments/collect-entrance` with the right body; a
    scan-resolved student includes `collectedAtInstituteId`/`collectedViaBarcode`
    in that body while a search-resolved one omits them; a month with an existing
    online-SUCCESS payment renders as non-collectible; amount field is pre-filled
    and editable; session-summary accumulates across multiple successful
    collections.
  - `payments/[id]/page.test.tsx` (or a testable inner component) — renders the
    right fields for an `ONLINE` payment (shows `payhereId`, no collected-by/
    institute) vs an `ENTRANCE` payment (shows collected-by, institute, barcode
    when present); renders the QR.
- **Live-stack + headless UI smoke**, per this repo's standing test-gate rule:
  collect a real entrance payment against the running stack as an ADMIN user (once
  via name search, once via a scanned barcode), confirm the `Payment` row's
  `method`/`collectedById`/`collectedAtInstituteId`/`collectedViaBarcode`, confirm
  the 409 on a second attempt against an already-online-paid month, confirm the
  student sees the payment on `/payments` (their own view) and a
  `PAYMENT_CONFIRMED` notification, open `/payments/{id}` and print-preview it,
  confirm the QR encodes that same URL.

## Out of scope

- **Emailed** receipts — see Decisions above; deferred pending a separate decision
  on reintroducing email infrastructure.
- Collecting multiple months in a single API call (batch) — explicitly decided
  against in favor of one-call-per-month simplicity.
- A general "outstanding months" backend aggregation endpoint — computed
  client-side from the existing `GET /payments?enrollmentId=` list to avoid adding
  new server surface for what's a small, bounded computation.
- Any change to the PayHere online flow, refunds, or the `/override` UI (the
  frontend for `/override` doesn't exist yet either — a separate, pre-existing
  gap, not introduced or fixed here beyond the backend `method`/`collectedById`
  correctness fix).
