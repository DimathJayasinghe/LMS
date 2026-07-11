# Payments UI (student + admin) — Design

_Date: 2026-07-11 · Branch: `feature/payments-ui` (off `dev`)_

## 1. Goal

Replace the `/payments` `ComingSoon` placeholder — the last `(app)` route stub — with a
**role-aware** payments screen: a student payment overview/history, and an admin/front-desk
records + collection dashboard. One small, tested backend addition (a month-summary aggregate);
everything else wires already-built endpoints.

## 2. Backend contract

Existing (no change), from `backend/src/routes/payment.routes.ts`:

| Method | Path | Role | Notes |
|---|---|---|---|
| `POST` | `/payments/initiate` | STUDENT | `{enrollmentId, paymentMonth}` → `{checkoutUrl, payload}` for PayHere auto-POST. Idempotent. |
| `GET` | `/payments/my?status=&paymentMonth=&enrollmentId=` | STUDENT | `ApiList<Payment>`, own rows. |
| `GET` | `/payments?page=&limit=&status=&paymentMonth=&userId=&courseId=` | SUPER_ADMIN, ADMIN | Paginated `ApiList<Payment>`. |
| `POST` | `/payments/bulk-upload` | SUPER_ADMIN, ADMIN | `multipart/form-data` `file` → `{total, created, updated, skipped, errors[]}`. |

**Payment shape** (`paymentSelect` in `payment.service.ts`): `id`, `amount` (string decimal),
`status` (`PENDING|SUCCESS|FAILED`), `payhereId`, `paymentMonth` (`YYYY-MM`), `note`, `createdAt`,
`updatedAt`, and `enrollment { id, classType, userId, user{ id,name,email,indexNumber,phone,
address,city }, course{ id,name,year,monthlyFee } }`. Amount = `course.monthlyFee`; unique per
`(enrollmentId, paymentMonth)`.

### New endpoint — `GET /payments/summary?month=YYYY-MM`
- **Role:** SUPER_ADMIN, ADMIN. **Query:** `month` (required, `YYYY-MM`).
- **Returns:** `{ month, collectedTotal: string, paidCount, pendingCount, failedCount }` where
  `collectedTotal` = sum of `amount` over `status=SUCCESS` for that month, and the counts are per
  status. Implemented via `prisma.payment.aggregate` (`_sum.amount` where SUCCESS+month) +
  `groupBy` (or three `count`s) for the status tallies.
- **Standards:** route → controller (no prisma) → `getPaymentsSummary(month)` service; Zod
  `summaryQuerySchema`; response envelope `{status:"success", data:{…}}`. **Vitest unit test**
  (mock `@/config/database` prisma) covering the sum + counts and an empty-month zero case — per
  §3.4.

## 3. Access (`page.tsx`, server)

Fetch `/auth/me`. `STUDENT` → student view; `SUPER_ADMIN`/`ADMIN` → admin view; anything else →
`redirect("/dashboard")`; unauthenticated → `redirect("/auth/login")`. Mirrors the role-aware
`/attendance` page. Nav: add `STUDENT` to the existing `/payments` nav item (currently
ADMIN/SUPER_ADMIN), exactly as Attendance was widened.

## 4. Architecture — mirror `/attendance`

```
app/(app)/payments/
  page.tsx            server: role branch + per-role fetch
  loading.tsx         skeleton
  _components/
    StudentPayments.tsx   client: "this month" cards + history table
    AdminPayments.tsx     client: month summary + filters + records table + bulk upload
lib/payhere.ts          NEW: redirectToPayhere(url,fields) — extracted from EnrollPanel and
                        reused by it (targeted dedupe, not new pattern). Reuse the existing
                        currentPaymentMonth() helper wherever it already lives (EnrollPanel imports
                        it); do not duplicate it.
lib/format.ts           NEW (if absent): formatLKR(decimalString) → "Rs N,NNN.NN"
lib/api.ts              extend with api.upload(path, FormData) — multipart path (api.post
                        JSON-stringifies, so it can't send FormData); keeps the 401→refresh flow
lib/types.ts            add Payment interface (matches paymentSelect) + PaymentSummary
```

## 5. Data flow

**Student** — server fetches `GET /enrollments/my` (active enrollments) + `GET /payments/my`.
`StudentPayments`:
- **This month:** one card per active enrollment. A `SUCCESS` payment for `currentPaymentMonth()`
  on that enrollment → "Paid ✓"; otherwise a **Pay now** button (shows `monthlyFee`) →
  `POST /payments/initiate {enrollmentId, currentMonth}` → `redirectToPayhere`.
- **History:** table of all `payments/my` (month, course, amount, status badge), client-side
  status + month filter over the fetched set.

**Admin** — server fetches page 1 of `GET /payments` (+ current filters from `searchParams`) and
`GET /payments/summary?month=<selected|current>`. `AdminPayments`:
- **Summary** stat row (collected total, paid/pending/failed) for the selected month.
- **Filters:** `status` + `paymentMonth` push to `?status=&month=&page=` (server re-fetch,
  mirroring `UserFilters`). Student/course filters deferred (need pickers).
- **Records table:** student (name + index), course + year, month, amount, status badge; pagination
  (Prev/Next) like `/admin/users`.
- **Bulk upload:** a card with `<input type=file accept=.xlsx,.xls>` → `api.upload` →
  render the `{total, created, updated, skipped, errors[]}` result (errors as `row → message`),
  with a one-line column hint (`enrollmentId` **or** `indexNumber+courseId+classType`;
  `paymentMonth`; optional `amount`, `note`). On success, `router.refresh()` to reflect new rows.

## 6. Error handling & edge cases

- **PayHere not configured** (`PAYHERE_NOT_CONFIGURED`, 500 — merchant env is still placeholder):
  the Pay button maps it to inline "Online payment isn't available yet." — no crash. Same known
  limitation as EnrollPanel today.
- **Already paid** (`PAYMENT_ALREADY_PAID`, 409): inline on the card; refresh to show Paid.
- **Empty states:** no active enrollments → "You're not enrolled in any courses yet."; no payments
  → dashed empty card; admin empty list → dashed empty card (mirror `UsersTable`).
- **Bulk upload:** non-spreadsheet / empty → backend 400 surfaced inline; per-row failures listed
  without failing the whole upload (partial success is normal).
- **Amount formatting:** `amount`/`monthlyFee` are string decimals → format as `Rs N,NNN.NN`
  (`formatLKR` in `lib/format.ts`).
- **Month default:** admin summary + filter default to `currentPaymentMonth()`.

## 7. Out of scope (YAGNI)

Override/mark-paid (excluded — cash via bulk upload); pay-at-entrance (no backend endpoint);
full financial reports (separate Phase 7); payment `method`/`collectedBy` column (would need a
`paymentSelect` change — omitted); student/course filter pickers on the admin table.

## 8. Testing & verification

- **Backend:** Vitest unit for `getPaymentsSummary` (sum + per-status counts; empty-month zeros).
- **Frontend:** Vitest + RTL for `StudentPayments` (this-month Paid vs Pay-now branching; history
  filter; PayHere-not-configured inline error) and `AdminPayments` (summary render; filter push;
  bulk-upload result render incl. per-row errors; empty states).
- **System:** `tsc` + `next build` green; backend `npm run build` green.
- **Smoke (headless Chromium on live Docker stack):** as STUDENT — see this-month card, click Pay
  now → initiate handled (redirect attempt or not-configured inline), history renders/filters. As
  SUPER_ADMIN and ADMIN — summary numbers present, status/month filter narrows the table,
  bulk-upload a small .xlsx → result card shows created/updated/errors. As a non-payments role
  (TEACHER) — bounced off `/payments`. Seed a couple of payments via bulk-upload or the DB so the
  admin views have data.

## 9. Definition of done

- `/payments` replaces `ComingSoon`; student overview/history + admin summary/records/bulk-upload
  work end-to-end; STUDENT added to the nav item.
- New `GET /payments/summary` shipped with a passing Vitest unit.
- Full gate green: backend + frontend unit tests, `tsc`/builds, and the live smoke matrix in §8.
- `context/api_endpoints/payments.endpoints.md` (add the summary endpoint + fix the stale role
  notes), `context/documents/06-progress-tracker.md`, and `context/frontend/06-frontend-roadmap.md`
  updated alongside the code.
