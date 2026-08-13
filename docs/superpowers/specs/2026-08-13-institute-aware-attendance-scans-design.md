# Design - Institute-aware attendance scans

**Date:** 2026-08-13
**Branch:** `feat/institute-aware-attendance-scans` (off `dev`)
**Status:** Approved from the documented Phase S gap; implementation pending
**Priority:** P1 attendance correctness

## Problem

The staff attendance scanner currently posts only a barcode and class-session ID. The backend
looks up only the globally unique `User.barcode` and always stores `AttendanceSource.BARCODE`.
Consequently:

- institute-issued `StudentBarcode` values cannot be used for attendance;
- a barcode reused by different institutes cannot be resolved safely without location context;
- camera QR scans are indistinguishable from keyboard-wedge barcode scans;
- a staff member can accidentally scan a timetable-generated session at the wrong institute.

The database already contains `StudentBarcode`, `Institute`, `TimetableSlot.instituteId`, and
`AttendanceSource.QR`, so no migration is needed.

## Contract

`POST /api/attendance/scan` accepts:

```json
{
  "barcode": "STUDENT-CODE",
  "classSessionId": "uuid",
  "instituteId": "uuid",
  "source": "BARCODE"
}
```

- `instituteId` is required and must identify an active institute.
- `source` is restricted to `BARCODE | QR`; `BARCODE` remains the schema default for compatibility
  with older non-browser clients while the live frontend always sends it explicitly.
- Resolution first checks `(instituteId, barcode)` in `StudentBarcode`, then falls back to the
  globally unique LMS `User.barcode` so a student's LMS QR works at every institute.
- A matched user must be an active `STUDENT` regardless of which barcode table matched.
- If the session came from a timetable slot with an institute, the submitted institute must match.
  A manually-created session has no slot institute and may be scanned at any active institute.
- Repeated scans keep the existing attendance row and update `lastSeenAt`. The original `source`
  remains the source of first check-in; this avoids rewriting history when a later duplicate uses a
  different device.

## Frontend

The staff scanner receives active institutes from the server-rendered page and adds an Institute
selector alongside Class and Session. Scanning stays disabled until all three are selected.

- Keyboard wedge / typed code sends `source: BARCODE`.
- Camera decode sends `source: QR`.
- The live roster shows a source badge so staff can distinguish QR, barcode, and manual check-ins.
- Institute mismatch and inactive-institute failures are translated into actionable inline errors.

## Audit and privacy

The existing `ATTENDANCE_BARCODE` audit event records `instituteId`, `source`, and session ID in
metadata. The raw barcode remains recorded because the endpoint already logs it and staff audit
access is restricted to super administrators. `Attendance` itself does not gain an `instituteId`
column in this slice; the selected institute is operational context, while session/timetable data
remains the source of location truth.

## Testing

- Backend service tests cover scoped resolution, LMS fallback, source persistence, active institute
  validation, timetable institute mismatch, and inactive/non-student users.
- Schema tests are exercised through service inputs and the backend build.
- Frontend tests cover institute gating, keyboard-wedge payload, camera QR payload, and mismatch
  error messaging.
- Full backend/frontend test suites and production builds gate the PR.

## Out of scope

- Adding `Attendance.instituteId` or an attendance-location reporting migration.
- Changing payment barcode resolution.
- Teacher/marker attendance reporting and reconciliation UI.
- Offline scan queues and device registration.
