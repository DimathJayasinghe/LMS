# Design — Immutable payment adjustment and refund ledger

**Date:** 2026-08-19
**Status:** Implemented; unit/build verification complete, staging migration apply pending
**Priority:** P0 financial correctness

## Goal

Preserve every financially consequential payment change as an immutable event and let a
`SUPER_ADMIN` record a refund that was already completed outside the LMS. This slice does not call
PayHere's refund API and must never tell a user that money was returned merely because an LMS row
was changed.

## Financial invariants

- `Payment.amount` remains the original gross payment amount.
- `Payment.refundedAmount` is a transactionally maintained projection of completed refund events.
- A partial refund keeps the payment `SUCCESS`; a refund of the full remaining balance changes it
  to `REFUNDED`, which removes paid-content access because access checks require `SUCCESS`.
- Total refunds can never exceed the original amount, including under concurrent requests.
- An override and a refund always create a `PaymentAdjustment`; neither can mutate financial state
  without its ledger event in the same database transaction.
- Ledger rows have no update/delete API. A PostgreSQL trigger rejects `UPDATE` and `DELETE`, so
  immutability does not depend only on application discipline.
- Recording a refund requires a reason and an external reference (PayHere refund ID, bank reference,
  or signed cash-refund receipt number). It records an already completed refund; it does not move money.

## Data model

Add `REFUNDED` to `PaymentStatus` and add `PaymentAdjustmentType { OVERRIDE REFUND }`.

`PaymentAdjustment` stores: payment, type, refund amount when applicable, status and gross-amount
before/after snapshots, reason, optional external reference (required by the refund schema), actor,
and `createdAt`. `Payment.refundedAmount Decimal(10,2) @default(0)` is the report/read projection.

The migration is additive. Rollback is fix-forward: disable the new endpoints first, retain ledger
rows for audit, and revert application reads. Dropping the table or removing `REFUNDED` is not a safe
production rollback once events exist.

## API

- `GET /api/payments/:id/adjustments` — `SUPER_ADMIN`, front-desk `ADMIN`, or the owning `STUDENT`.
- `POST /api/payments/:id/refunds` — `SUPER_ADMIN` only, with `Idempotency-Key`.
- Refund body: `{ amount: positive number, reason: 3..500 chars, externalReference: 3..120 chars }`.
- Existing `PATCH /api/payments/:id/override` now requires a 3..500 character note and writes an
  `OVERRIDE` ledger row transactionally.

Errors: `PAYMENT_NOT_FOUND` (404), `PAYMENT_NOT_REFUNDABLE` (409),
`REFUND_EXCEEDS_REMAINING` (409), and the existing validation/idempotency errors.

## Reporting and UI

Payment records expose gross amount, refunded amount, and net amount. Month summary and financial
reports subtract `refundedAmount` so collected totals cannot overstate retained revenue.

The `SUPER_ADMIN` record table exposes a refund/ledger action. The form says “Record completed
refund”, requires the external reference, previews the remaining refundable balance, prevents
double-submit, sends a fresh idempotency key, and refreshes server data after success. Front-desk
admins never see mutation controls.

## Edge cases and tests

- Missing payment is checked before refundability.
- PENDING, FAILED, and fully REFUNDED payments reject refunds.
- Zero/negative and over-remaining refunds reject without a write.
- Partial refund keeps `SUCCESS`; exact remaining refund becomes `REFUNDED`.
- Two concurrent refunds use an atomic `(id, status, refundedAmount)` compare-and-update inside the
  transaction; the loser receives `REFUND_CONFLICT` instead of risking an over-refund.
- Override writes its ledger event and payment update atomically.
- Student ledger reads are self-scoped; ADMIN reads but cannot refund; only SUPER_ADMIN mutates.
- Frontend tests cover role visibility, payload/idempotency, client limits, and failure preservation.

## Migration readiness

The repository still has one stale baseline migration while later schema changes were applied with
`prisma db push`. This additive migration is safe against both the recorded initial schema and the
current schema because it only adds enum values, one Payment column, and one new table. Converting
the container entrypoint to `prisma migrate deploy` remains a separate P0 baseline-reconciliation
task; switching it inside this slice would make fresh deployments incomplete.
