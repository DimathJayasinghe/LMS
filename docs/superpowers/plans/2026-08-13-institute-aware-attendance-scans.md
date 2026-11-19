# Institute-aware Attendance Scans Implementation Plan

**Goal:** Complete the entrance scanner end to end by resolving institute-issued barcodes in an
explicit institute context and recording QR versus barcode scan sources accurately.

**Architecture:** Extend the existing scan request contract, keep all Prisma access in
`attendance.service.ts`, pass active institutes into the server-rendered attendance page, and send
an explicit source from each scanner input mode. Reuse the existing schema; no migration.

## Tasks

- [x] Extend `scanBarcodeSchema` with required `instituteId` and `source` (`BARCODE | QR`, default
      `BARCODE`).
- [x] Update `attendance.service.ts` to validate the institute, enforce a timetable-slot institute
      when present, resolve `StudentBarcode` by composite key, fall back to `User.barcode`, and
      persist the supplied source on create.
- [x] Include institute and source in attendance scan audit metadata.
- [x] Add focused backend service tests for the new resolution and validation paths.
- [x] Load active institutes on the staff attendance page and pass them to `StaffScanner`.
- [x] Add institute selection, scan gating, source-specific scanner payloads, source badges, and
      user-facing errors to `StaffScanner`.
- [x] Extend frontend component tests for institute gating and QR/barcode payloads.
- [x] Update attendance endpoint documentation and the progress tracker.
- [ ] Run backend and frontend tests/builds, review the diff, then open and merge a clean PR.

## Verification Commands

```bash
cd backend && npm run test
cd backend && npm run build
cd frontend && npm run test
cd frontend && npm run build
git diff --check
```
