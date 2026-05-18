import { z } from 'zod';

// ─── Barcode Scan ────────────────────────────────────────────
export const scanBarcodeSchema = z.object({
  barcode: z.string().trim().min(3, 'Barcode must be at least 3 characters.').max(64),
  classSessionId: z.string().uuid('Invalid class session ID.'),
});

export type ScanBarcodeInput = z.infer<typeof scanBarcodeSchema>;

// ─── Zoom Webhook Payload ────────────────────────────────────
// Zoom sends different field names depending on the event type.
// We accept the meeting ID and identify the student by email or user ID.
export const zoomWebhookPayloadSchema = z.object({
  event: z.string().min(1),
  payload: z.object({
    object: z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      participant: z.object({
        user_id: z.string().optional(),
        user_name: z.string().optional(),
        email: z.string().email().optional(),
        join_time: z.coerce.date().optional(),
      }),
    }),
  }),
});

export type ZoomWebhookPayload = z.infer<typeof zoomWebhookPayloadSchema>;

// ─── Manual Attendance ───────────────────────────────────────
// Admin/Super Admin can manually mark attendance for a student
export const manualAttendanceSchema = z.object({
  userId: z.string().uuid('Invalid user ID.'),
  classSessionId: z.string().uuid('Invalid class session ID.'),
});

export type ManualAttendanceInput = z.infer<typeof manualAttendanceSchema>;

// ─── Video Attendance ────────────────────────────────────────
// Attendance logged when a student watches a recorded video
export const videoAttendanceSchema = z.object({
  classSessionId: z.string().uuid('Invalid class session ID.'),
});

export type VideoAttendanceInput = z.infer<typeof videoAttendanceSchema>;

// ─── Query / Params ──────────────────────────────────────────
export const attendanceClassParamsSchema = z.object({
  classId: z.string().uuid('Invalid class ID.'),
});

export const attendanceSessionParamsSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID.'),
});

export const attendanceStudentParamsSchema = z.object({
  userId: z.string().uuid('Invalid user ID.'),
});

export const attendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
