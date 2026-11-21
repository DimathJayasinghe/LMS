-- Fee reminders. The new value is unused until the application code that sends it is deployed; it lives alone in this
-- file because Postgres cannot use an enum value added in the same transaction.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FEE_DUE';
