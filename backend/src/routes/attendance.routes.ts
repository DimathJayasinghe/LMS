import { Router, type RequestHandler } from 'express';
import { Role } from '@prisma/client';
import * as AttendanceController from '@/controllers/attendance.controller';
import * as ReconciliationController from '@/controllers/attendance-reconciliation.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { verifyZoomWebhook } from '@/middleware/zoom-webhook.middleware';
import {
  scanBarcodeSchema,
  manualAttendanceSchema,
  videoAttendanceSchema,
  attendanceClassParamsSchema,
  attendanceSessionParamsSchema,
  attendanceStudentParamsSchema,
  attendanceQuerySchema,
} from '@/schemas/attendance.schema';

export const createAttendanceRouter = (zoomWebhookLimiter: RequestHandler): Router => {
  const attendanceRoutes = Router();

  // ─── Barcode Scan ────────────────────────────────────────────
  // POST /api/attendance/scan — Admin scans a student code in institute context
  attendanceRoutes.post(
    '/scan',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateBody(scanBarcodeSchema),
    AttendanceController.scanBarcode,
  );

  // ─── Zoom Attendance Reconciliation ─────────────────────────
  // Teachers may recover missed webhooks only for courses they own. Front-desk
  // ADMIN remains read-only for online attendance; SUPER_ADMIN bypasses ownership.
  attendanceRoutes.get(
    '/session/:sessionId/reconciliation',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.TEACHER),
    validateParams(attendanceSessionParamsSchema),
    ReconciliationController.previewZoomAttendance,
  );

  attendanceRoutes.post(
    '/session/:sessionId/reconciliation',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.TEACHER),
    validateParams(attendanceSessionParamsSchema),
    checkIdempotency,
    ReconciliationController.reconcileZoomAttendance,
  );

  // ─── Zoom Webhook ────────────────────────────────────────────
  // POST /api/attendance/zoom-webhook — No auth (verified by webhook secret)
  // Zoom fires this on participant.joined events
  attendanceRoutes.post(
    '/zoom-webhook',
    zoomWebhookLimiter,
    verifyZoomWebhook,
    AttendanceController.handleZoomWebhook,
  );

  // ─── Manual Attendance ───────────────────────────────────────
  // POST /api/attendance/manual — Admin reconciliation fallback
  attendanceRoutes.post(
    '/manual',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
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
  // TEACHER is scoped to sessions of courses they own (assertCourseAccess in the service).
  attendanceRoutes.get(
    '/session/:sessionId',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER),
    validateParams(attendanceSessionParamsSchema),
    AttendanceController.getAttendanceBySession,
  );

  // ─── Query: By Course ────────────────────────────────────────
  // GET /api/attendance/class/:classId — Paginated course attendance
  // TEACHER is scoped to courses they own (assertCourseAccess in the service).
  attendanceRoutes.get(
    '/class/:classId',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER),
    validateParams(attendanceClassParamsSchema),
    validateQuery(attendanceQuerySchema),
    AttendanceController.getAttendanceByCourse,
  );

  // ─── Query: By Student ───────────────────────────────────────
  // GET /api/attendance/student/:userId — student's own history, owner and front desk any,
  // a teacher only rows from their own courses (markers are refused)
  attendanceRoutes.get(
    '/student/:userId',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER, Role.STUDENT),
    validateParams(attendanceStudentParamsSchema),
    validateQuery(attendanceQuerySchema),
    AttendanceController.getStudentAttendance,
  );

  return attendanceRoutes;
};
