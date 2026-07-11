# Notifications API Endpoints

Two resources: the **per-user inbox** (`/api/notifications`) and the **super-admin-configurable
on/off switches** (`/api/notification-settings`) that gate whether each scenario fires an in-app
notification, an SMS, both, or neither.

## Base URLs

```
http://localhost:5000/api/notifications
http://localhost:5000/api/notification-settings
```

## How it fires (implemented 2026-07-10)

`NotificationService.dispatch({ type, userId, link?, params })` (`backend/src/services/notification.service.ts`)
is the single entry point for every notification-worthy event. It:

1. Checks `NotificationSetting` for `(type, IN_APP)` — if enabled, writes a `Notification` row and
   pushes an SSE `NOTIFICATION_CREATED` event audienced to that one `userId` (reuses the existing
   `publishEvent`/Redis-pub-sub SSE infrastructure from `stream.service.ts`, same mechanism as
   `RESULTS_PUBLISHED`/`TIMETABLE_UPDATED`).
2. Checks `NotificationSetting` for `(type, SMS)` — if enabled and the user has a phone number,
   delegates to `SmsNotificationService.sendSms(...)` (persists an `SmsLog` row, enqueues the
   BullMQ job — this pre-existing service is now called from one place instead of being
   duplicated per-scenario in controllers).
3. **Never throws** — a broken notification must not fail the payment/results action that
   triggered it. Failures are logged (`logger.error`) instead.

Current triggers: `RESULTS_PUBLISHED` (one per student who submitted, fired from
`submission.service.ts::publishResults`), `PAYMENT_CONFIRMED` (fired from
`payment.service.ts::handlePayhereNotify` when status becomes `SUCCESS`), `PAYMENT_OVERRIDDEN`
(fired from `payment.service.ts::overridePayment`).

> **Refactor note:** `payment.controller.ts` previously had its own `sendPaymentConfirmationSms`/
> `sendPaymentOverrideSms` helpers calling `SmsNotificationService.sendSms` directly, with no
> settings gate at all. These were removed in favor of the single `NotificationService.dispatch`
> call inside the service layer — avoids a double-send and means these two scenarios now actually
> respect the super-admin toggle. `sendBulkPaymentSms` (bulk payment upload) was left untouched —
> it was already a no-op placeholder before this change and wiring real per-student bulk
> notifications is a separate, larger piece of work (would need `bulkUploadPayments` to return
> per-row user/enrollment info it doesn't currently expose).

Adding a new scenario: add a `NotificationType` enum value in `schema.prisma`, add a matching entry
to `NOTIFICATION_TEMPLATES` in `backend/src/utils/constants.ts` (`{ title, inApp, sms }`, mustache
`{placeholder}` tokens), call `dispatch(...)` from the triggering service. `NotificationSettingService`
auto-seeds the new `(type, channel)` rows as `enabled: true` on first read — no manual migration.

**EMAIL is deliberately not a channel** — no email-sending infrastructure exists (see Progress
Tracker Decisions Log, "Email out of scope for v1"). Adding it means extending
`NotificationChannel` in the schema plus building the actual sender; nothing here needs to change
structurally to support that later.

## `/api/notifications` — Auth: any authenticated user, self only

| Method | Path | Description |
| --- | --- | --- |
| GET | `/me` | List my notifications, paginated, `?unreadOnly=true` filter |
| PATCH | `/:notificationId/read` | Mark one of my notifications read |
| PATCH | `/me/read-all` | Mark all my unread notifications read |

### GET `/me`

**Query params**: `page` (default 1), `limit` (default 20, max 100), `unreadOnly` (default false)

**Success (200)**
```json
{
  "status": "success",
  "data": [ { "id": "uuid", "type": "RESULTS_PUBLISHED", "title": "Results published",
              "message": "Results for Math Final are now available.", "link": "/exams/uuid",
              "isRead": false, "createdAt": "2026-07-10T..." } ],
  "count": 12,
  "unreadCount": 3,
  "page": 1,
  "limit": 20
}
```

### PATCH `/:notificationId/read`

**Errors**: 404 `NOTIFICATION_NOT_FOUND`; 403 `FORBIDDEN` if it belongs to someone else (explicit
403, not a disguised 404 — matches the pattern in `attendance.service.ts::getStudentAttendance`).

### PATCH `/me/read-all`

`200` → `{ status, data: { updated: <count> }, message }`. Safe no-op if nothing is unread.

## `/api/notification-settings` — Auth: `SUPER_ADMIN` only

Deliberately **not** opened to front-desk `ADMIN` — same reasoning as the audit log
(`audit.endpoints.md`): this controls whether students get contacted at all, and is a super-admin
level policy decision, not a day-to-day front-desk task.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | List all `(type, channel)` toggles — auto-seeds any missing combination |
| PATCH | `/:id` | Toggle one `(type, channel)` combination on/off |

### GET `/`

**Success (200)**
```json
{
  "status": "success",
  "data": [
    { "id": "uuid", "type": "RESULTS_PUBLISHED", "channel": "IN_APP", "enabled": true, "updatedAt": "..." },
    { "id": "uuid", "type": "RESULTS_PUBLISHED", "channel": "SMS", "enabled": true, "updatedAt": "..." }
  ],
  "count": 6
}
```

### PATCH `/:id`

Body: `{ "enabled": false }`. `200` → updated setting. Audited (`AUDIT_ACTION.NOTIFICATION_SETTING_UPDATED`).
**Errors**: 404 `NOTIFICATION_SETTING_NOT_FOUND`.

## Frontend

- **Bell** (`components/custom/NotificationBell.tsx`, mounted in `TopBar.tsx` for every
  authenticated page): fetches `GET /notifications/me?limit=10` on mount, opens an `EventSource`
  to `/api/stream` (`useNotificationStream` hook) and refetches on `NOTIFICATION_CREATED`, dropdown
  with mark-one/mark-all-read.
- **Settings page** (`/admin/notification-settings`, `SUPER_ADMIN`-gated): grouped by scenario,
  one `Switch` each for In-app and SMS, optimistic toggle with rollback on failure.

This is the **first frontend SSE consumer** in the codebase — the backend's SSE infrastructure
(`RESULTS_PUBLISHED`, `TIMETABLE_UPDATED`, `EXAM_CONTROL`) existed since Phase 6 but nothing on the
frontend ever opened an `EventSource` before this. Those other event types still have no frontend
listener — a real, separate gap, not addressed here.
