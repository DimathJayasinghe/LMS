import { Router } from 'express';
import { Role } from '@prisma/client';
import * as AttendanceController from '@/controllers/attendance.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
  scanBarcodeSchema,
  manualAttendanceSchema,
  videoAttendanceSchema,
  attendanceClassParamsSchema,
  attendanceSessionParamsSchema,
  attendanceStudentParamsSchema,
  attendanceQuerySchema,
} from '@/schemas/attendance.schema';

export const attendanceRoutes = Router();

// ─── Barcode Scan ────────────────────────────────────────────
// POST /api/attendance/scan — Admin scans student barcode at entrance
attendanceRoutes.post(
  '/scan',
  verifyToken,
  requireRole(Role.ADMIN, Role.STAFF),
  validateBody(scanBarcodeSchema),
  AttendanceController.scanBarcode,
);

// ─── Zoom Webhook ────────────────────────────────────────────
// POST /api/attendance/zoom-webhook — No auth (verified by webhook secret)
// Zoom fires this on participant.joined events
attendanceRoutes.post(
  '/zoom-webhook',
  AttendanceController.handleZoomWebhook,
);

// ─── Manual Attendance ───────────────────────────────────────
// POST /api/attendance/manual — Admin reconciliation fallback
attendanceRoutes.post(
  '/manual',
  verifyToken,
  requireRole(Role.ADMIN, Role.STAFF),
  validateBody(manualAttendanceSchema),
  AttendanceController.markManualAttendance,
);

// ─── Video Attendance ────────────────────────────────────────
// POST /api/attendance/video — Student watches a recorded class video
attendanceRoutes.post(
  '/video',
  verifyToken,
  requireRole(Role.STUDENT),
  validateBody(videoAttendanceSchema),
  AttendanceController.markVideoAttendance,
);

// ─── Query: By Session ───────────────────────────────────────
// GET /api/attendance/session/:sessionId — All records for a session
attendanceRoutes.get(
  '/session/:sessionId',
  verifyToken,
  requireRole(Role.ADMIN, Role.STAFF),
  validateParams(attendanceSessionParamsSchema),
  AttendanceController.getAttendanceBySession,
);

// ─── Query: By Course ────────────────────────────────────────
// GET /api/attendance/class/:classId — Paginated course attendance
attendanceRoutes.get(
  '/class/:classId',
  verifyToken,
  requireRole(Role.ADMIN, Role.STAFF),
  validateParams(attendanceClassParamsSchema),
  validateQuery(attendanceQuerySchema),
  AttendanceController.getAttendanceByCourse,
);

// ─── Query: By Student ───────────────────────────────────────
// GET /api/attendance/student/:userId — Student's own or admin lookup
attendanceRoutes.get(
  '/student/:userId',
  verifyToken,
  validateParams(attendanceStudentParamsSchema),
  validateQuery(attendanceQuerySchema),
  AttendanceController.getStudentAttendance,
);
