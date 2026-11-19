# Payment channels (bank slip) and HYBRID enrollment — Design

_Date: 2026-11-19 · Status: approved direction, not implemented · Branch: `docs/multi-tenant-requirements-alignment`_

## 1. Goal

Two owner decisions of 2026-11-19 change the data model and need a written contract before any code:

1. **Three collection channels.** A student can pay (a) **on the platform** (PayHere), (b) **at the
   front desk / a physical institute** (cash, already built), or (c) **by bank transfer with an
   uploaded slip that staff approve** (new). All three must land in one ledger and open the same
   content gate.
2. **Three class types.** A student can attend **physically**, **online**, or **both**. Sessions
   already support all three; enrollments do not (`ClassType` is only `ONLINE | PHYSICAL`).

This spec defines the target behaviour, the schema change, and the open decisions that still need the
owner. It does not change code.

## 2. Current behaviour (verified against source 2026-11-19)

- `PaymentMethod`: `ONLINE` (PayHere), `ENTRANCE` (front desk; records `collectedById`,
  `collectedAtInstituteId`, `collectedViaBarcode`), `BULK` (Excel import), `MANUAL` (owner/admin).
- `Payment` has `@@unique([enrollmentId, paymentMonth])` — exactly one row per enrollment per month.
- `assertStudentContentAccess(requirePaid: true)` (`backend/src/services/access.service.ts`) passes when
  the student has an active enrollment **and** a `SUCCESS` payment for the current `YYYY-MM` on that
  course. It does **not** look at `Enrollment.classType`, so a `PHYSICAL`-only student can already
  stream recordings and join live classes.
- `Enrollment` is unique on `(userId, courseId, classType)`, so a student may hold an `ONLINE` **and** a
  `PHYSICAL` enrollment for the same course, and each is billed separately.
- `ClassSession.classType` and `TimetableSlot.classType` are nullable; `null` means all cohorts.
- Exam audiences use their own enum, `ExamAudienceDeliveryMode { ONLINE, PHYSICAL }`.
- `Attendance` is unique on `(userId, classSessionId)`, so two attendance sources for one session
  collapse to one row.

## 3. Payment channels

### 3.1 Channel matrix

| Channel | `PaymentMethod` | Who records it | Verification | Status |
|---|---|---|---|---|
| Platform (card/wallet via PayHere) | `ONLINE` | System, from the signed PayHere webhook | Automatic (signature check) | Built |
| Front desk / physical institute cash | `ENTRANCE` | `ADMIN` or `SUPER_ADMIN` | The collector is the verifier; `collectedById` and `collectedAtInstituteId` are recorded | Built |
| Bulk Excel reconciliation | `BULK` | `ADMIN` or `SUPER_ADMIN` | Staff-supplied | Built |
| Owner adjustment | `MANUAL` | `SUPER_ADMIN` | Reason required; ledgered in `PaymentAdjustment` | Built |
| **Bank transfer + slip** | **`BANK_TRANSFER`** | **Student submits; `ADMIN`/`SUPER_ADMIN` approve** | **Human review of the uploaded slip** | **New** |

"Institute" as a payment channel is therefore covered in two ways: branch cash is the existing
`ENTRANCE` method, and the institute's bank account is the new `BANK_TRANSFER` method.

### 3.2 Why the slip needs its own table

`@@unique([enrollmentId, paymentMonth])` is correct for money: one month, one outcome. But a slip
flow needs reject → re-upload → approve, and may need several attempts per month. Dropping the
constraint would weaken the double-payment guard that `ONLINE` and `ENTRANCE` rely on. Instead:

- Keep `Payment` as the single ledger row per enrollment per month.
- Add `PaymentSlip`, an append-only evidence record that points at that `Payment`.
- A `Payment` stays `PENDING` while slips are being reviewed, becomes `SUCCESS` (method
  `BANK_TRANSFER`) only when a slip is approved, and is never created as `SUCCESS` by the student.
- The content gate is unchanged: it reads `Payment.status = SUCCESS` and does not care about channel.

### 3.3 `PaymentSlip` model (proposed)

```prisma
enum PaymentSlipStatus {
  PENDING_UPLOAD   // row + presigned URL issued, object not yet confirmed
  SUBMITTED        // object confirmed in private storage, waiting for review
  APPROVED
  REJECTED
  EXPIRED          // never confirmed; swept by a BullMQ job
  SUPERSEDED       // closed by the system because the month was settled another way
}

model PaymentSlip {
  id             String            @id @default(uuid())
  organizationId String                         // tenant-owned from its first migration (ADR 14)
  status         PaymentSlipStatus @default(PENDING_UPLOAD)

  paymentId      String
  payment        Payment           @relation(fields: [paymentId], references: [id], onDelete: Restrict)

  claimedAmount  Decimal           @db.Decimal(10, 2)
  referenceNo    String?                       // bank reference printed on the slip
  transferDate   DateTime?
  bankName       String?

  objectKey      String                         // private R2 key, never exposed
  contentType    String
  sizeBytes      Int

  submittedById  String                         // the student
  reviewedById   String?                        // ADMIN / SUPER_ADMIN
  reviewedAt     DateTime?
  rejectReason   String?                        // required when REJECTED or SUPERSEDED (system text)

  // Maintained by the service: `${organizationId}:${referenceNo}` while APPROVED, otherwise NULL.
  // A plain nullable @unique, so Prisma can model it and NULLs never collide (see §3.3 "Constraints").
  approvedReferenceKey String?              @unique

  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@index([paymentId])
  @@index([organizationId, status, createdAt])
}
```

Rules:

- A slip is never edited after review; a re-upload is a new row.
- `REJECTED` requires `rejectReason`; the student sees it and may submit a new slip.
- Approval sets `Payment.status = SUCCESS`, `method = BANK_TRANSFER`, `collectedById = reviewer`, and
  `amount` to the course fee. If `claimedAmount` differs from the fee the reviewer must reject with a
  reason. **Partial payments, multi-month slips and installments are out of scope here** and belong to
  roadmap Phase G.
- The same `referenceNo` on two `APPROVED` slips **in one organization** is blocked by the
  `approvedReferenceKey` unique (see "Constraints" below) to stop one transfer being used for two
  students. Different organizations may legitimately see the same bank reference.
- A pending slip does **not** unlock content. Fair-access exceptions (grace, waiver) are a separate,
  audited `AccessException` concept already planned in the gap analysis (Phase G).

#### Cross-channel rules

These were verified against `payment.service.ts` on 2026-11-19: `initiatePayherePayment` **upserts a
`PENDING` row with method `ONLINE`** as soon as checkout starts, so an abandoned PayHere checkout leaves
a pending row; `collectEntrancePayment` and `bulkUploadPayments` accept an existing row and only refuse
one that is `SUCCESS` **and** has a `payhereId`.

1. **A slip attaches to the existing `Payment` row** for `(enrollmentId, paymentMonth)`. If none exists
   the service creates a `PENDING` row with method `BANK_TRANSFER`; if an abandoned PayHere `PENDING`
   row exists, the slip attaches to it and approval changes its `method` to `BANK_TRANSFER`.
2. **Submitting a slip is refused (`409 ALREADY_PAID`) when the month is already `SUCCESS`** through any
   channel.
3. **If the month is settled by another channel while slips are open** (PayHere webhook, entrance
   collection, bulk upload, or owner override), every slip in `PENDING_UPLOAD` or `SUBMITTED` for that
   payment is moved to `SUPERSEDED` in the same transaction, with the fixed reason "Month already paid
   via <method>", an audit event, and a student notification. Approval of a slip that has become
   `SUPERSEDED` fails with `409`.
4. **`ENTRANCE`, `BULK` and `MANUAL` must accept a `PENDING` row created by a slip.** Their existing
   "already paid online" guard keys on `payhereId`, so a `SUCCESS` bank-transfer row (no `payhereId`)
   would be silently overwritten. The guard must be generalized to "`SUCCESS` through another channel"
   before the slip channel ships.
5. **A PayHere success arriving for a row already `SUCCESS` by bank transfer** is a duplicate payment.
   The row is not overwritten; the event is recorded, staff are notified, and the customer is refunded
   through the existing `PaymentAdjustment` ledger. The same applies in reverse for a slip approved after
   an online success (blocked by rule 3).

#### Constraints Prisma cannot express

Prisma's schema language has no partial unique index. The zero-drift gate in CI is
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
(`.github/workflows/ci.yml`). Existing migrations already add raw-SQL triggers and a `CHECK` constraint
(`PaymentAdjustment_immutable`, the marker-group event trigger, a marker-group scope `CHECK`) without
failing that gate, but a **partial index is a different kind of object and whether `migrate diff` reports
it as drift has not been verified**. Rather than rely on it, both designs in this document use a
**nullable sentinel column with a plain `@unique`** (`PaymentSlip.approvedReferenceKey` above and
`Enrollment.activeKey` in §4.2): the service writes the key only while the row is "active" and clears it
otherwise, and a `CHECK` constraint added in the migration keeps the column consistent with the status.
Any future need for a true partial index must first be proven against the CI database.

### 3.4 API (proposed)

All mutations require `Idempotency-Key`. Base path `/api/payments/slips`.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/` | `STUDENT` | Create the slip row for an owned, active enrollment and month; returns a presigned PUT |
| `POST` | `/:id/confirm` | `STUDENT` (owner) | Verify object exists, size and decoded type; move to `SUBMITTED` |
| `GET` | `/` | `STUDENT` (own), `ADMIN`, `SUPER_ADMIN` | Paginated list, filter by status; staff default to `SUBMITTED` |
| `GET` | `/:id/file` | owner `STUDENT`, `ADMIN`, `SUPER_ADMIN` | Short-lived presigned GET; audited because slips can contain bank details |
| `POST` | `/:id/approve` | `ADMIN`, `SUPER_ADMIN` | Approve and settle the payment |
| `POST` | `/:id/reject` | `ADMIN`, `SUPER_ADMIN` | Reject with a required reason |

Authorization notes: a student can only create slips for their own enrollment; `TEACHER` and `MARKER`
get no access (teachers keep aggregate finance only); an `ADMIN` approving a slip for a `SUPER_ADMIN`
account follows the existing actor-versus-target rules.

### 3.5 Side effects

- New `NotificationType` values `PAYMENT_SLIP_SUBMITTED` (staff) and `PAYMENT_SLIP_REJECTED`
  (student); approval reuses `PAYMENT_CONFIRMED`.
- Audit events for submit, confirm, approve, reject and file access.
- A BullMQ job expires `PENDING_UPLOAD` slips older than a bounded window and deletes the orphan object.
- Reports already group by `method`; `BANK_TRANSFER` appears automatically once the enum value exists.
- Staff UI needs a "Pending slips" queue with age, amount and a side-by-side slip viewer. The student
  UI needs an upload form on the payment page that shows the organization's bank details.
- Bank account details are **per organization settings**, never hard-coded (see
  [14-multi-tenancy-readiness.md](../../../context/documents/14-multi-tenancy-readiness.md)).

### 3.6 Edge cases to cover in tests

- Student submits a slip for another student's enrollment → 403.
- Slip against an inactive enrollment or an already `SUCCESS` month → 409.
- Confirm called twice, or on someone else's slip → idempotent / 403.
- Approve and reject racing on one slip → exactly one wins.
- Approve after the student was deactivated → rejected with a clear code.
- Reject without a reason → 400.
- Duplicate `referenceNo` approval within one organization → 409; the same reference in a different
  organization → allowed.
- Slip submitted when the month is already `SUCCESS` (any channel) → 409 `ALREADY_PAID`.
- Month settled by PayHere / entrance / bulk / override while a slip is `SUBMITTED` → slip becomes
  `SUPERSEDED` in the same transaction, student notified, later approve → 409.
- Slip attaches to an abandoned PayHere `PENDING` row; approval flips `method` to `BANK_TRANSFER`.
- Entrance collection or bulk upload on a month that holds a `SUCCESS` bank-transfer row is refused, not
  overwritten.
- PayHere success webhook on a row already `SUCCESS` by slip → no overwrite, duplicate recorded,
  staff notified.
- Oversized, wrong-type or undecodable file → rejected and object deleted.
- `ADMIN` cannot approve through a route reserved for `SUPER_ADMIN` overrides (override stays separate).

## 4. HYBRID enrollment

### 4.1 Semantics

`HYBRID` means **one enrollment, one fee, both delivery modes**. The student may attend the physical
class and may also use the live stream and recordings.

### 4.2 Schema change

- Add `HYBRID` to `ClassType`.
- Replace `@@unique([userId, courseId, classType])` with **one active enrollment per `(userId,
  courseId)`**, enforced by a nullable `Enrollment.activeKey String? @unique` that the service sets to
  `${userId}:${courseId}` while `isActive = true` and clears to `NULL` when the enrollment is cancelled
  (see "Constraints Prisma cannot express" in §3.3 for why this is used instead of a partial unique
  index). Today's rule lets one student pay twice for the same course by holding both an `ONLINE` and a
  `PHYSICAL` enrollment; `HYBRID` is the correct way to express that need.
- Changing mode is an **in-place update of `classType`** (audited), not cancel-and-re-enroll, so the
  existing `Payment` rows (keyed by `enrollmentId`) stay valid across a mid-month change.
- Migration is additive-first: add the enum value and the `activeKey` column, detect users holding two
  active enrollments in one course, convert them to a single `HYBRID` enrollment (re-pointing payment
  history to the surviving enrollment), then populate `activeKey`.
- **Collision case.** If both of a student's enrollments hold a payment for the **same month**, moving
  them onto one enrollment would violate `@@unique([enrollmentId, paymentMonth])` and means the student
  was **billed twice for one month of one course**. That is a refund or adjustment decision for the
  owner, not something a migration may merge. The migration must stop, print every such `(user, course,
  month)` with both payment ids and amounts, and require the duplicates to be resolved first (for
  example through the `PaymentAdjustment` refund flow) before it can proceed. Duplicate enrollments
  with no month collision merge cleanly; any other ambiguity also stops the migration.

### 4.3 Eligibility matrix

| Enrollment mode | Physical sessions / entrance scan | Live class + recordings | Exam audience |
|---|---|---|---|
| `PHYSICAL` | Yes | **No**, unless the session opts in (§4.4) | `PHYSICAL` roster |
| `ONLINE` | No | Yes | `ONLINE` roster |
| `HYBRID` | Yes | Yes | Either; the teacher assigns each exam to one audience and the participant row is frozen |

For a session with `classType = null` every enrolled student is eligible; `PHYSICAL` sessions need
`PHYSICAL` or `HYBRID`; `ONLINE` sessions need `ONLINE` or `HYBRID`.

Attendance for a `HYBRID` student can come from an entrance scan or a live join. The existing unique
`(userId, classSessionId)` already prevents double counting; the first source wins and the second is a
no-op.

### 4.4 Open owner decisions

These change behaviour for existing students, so they are not decided by this document:

1. ~~Should a `PHYSICAL`-only enrollment keep access to recordings and live classes?~~ **Decided
   2026-11-19: no**, unless the student upgrades to `HYBRID` or the teacher opts a session in. Because
   today's gate lets physical-only students stream, this is a **behaviour change for existing students**.
   Implementation notes:
   - "Online content" means live classes and recordings. Modules and downloadable materials stay
     available to every enrolled, paid student regardless of mode (assumption; flag if wrong), and exams
     keep using audiences.
   - Add `ClassSession.onlineForPhysical Boolean @default(false)`. A teacher sets it on a session they
     want physical-only students to see online; recordings inherit it from their session.
   - Extend `assertStudentContentAccess` with an `onlineContent` option for the live-token and video
     stream paths: `ONLINE` and `HYBRID` pass; `PHYSICAL` passes only when the session has
     `onlineForPhysical = true`; failure is `403 ONLINE_ACCESS_NOT_INCLUDED` with an upgrade prompt.
   - Roll out with a one-time report of existing physical-only students who have watched recordings or
     joined live classes, and an owner-approved announcement before the check is enforced.
   - Tests: each mode × `onlineForPhysical` true/false × live and recording × paid/unpaid, plus the
     privileged-role bypass and a teacher toggling the flag on a course they do not own.
2. **Is the fee the same for every mode?** Today there is one `Course.monthlyFee`. Per-mode fees
   (`onlineFee`, `physicalFee`, `hybridFee`) are a small additive change but need pricing from the owner.
   Default until decided: one fee for all modes.

### 4.5 Where `classType` is consumed (code to revisit)

`schemas/enrollment.schema.ts`, `schemas/payment.schema.ts`, `schemas/class-session.schema.ts`,
`schemas/timetable.schema.ts`, `services/payment.service.ts`, `services/class-session.service.ts`,
`services/timetable.service.ts`, `services/live-class.service.ts`, `scripts/seed-demo.ts`, and the
frontend enrollment, timetable and class pages. Each needs the matrix in §4.3 applied and a test for the
new value.

## 5. Delivery order

1. Owner answers the two decisions in §4.4.
2. `HYBRID` enum + merge migration + eligibility helper + tests (small, self-contained).
3. `BANK_TRANSFER` enum value + `PaymentSlip` migration + service + routes + tests.
4. Slip UI (student upload, staff queue), notification types, expiry job.
5. Docs: update `payments.endpoints.md`, `enrollments.endpoints.md`, `08-database-design.md` from
   "planned" to "implemented" in the same PR as each step.

Both changes should land **after** the organization foundation migration in
[14-multi-tenancy-readiness.md](../../../context/documents/14-multi-tenancy-readiness.md) so that
`PaymentSlip` is created with `organizationId` from its first migration.
