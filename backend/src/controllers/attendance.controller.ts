import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as AttendanceService from '@/services/attendance.service';
import {
  scanBarcodeSchema,
  zoomWebhookPayloadSchema,
  manualAttendanceSchema,
  videoAttendanceSchema,
  attendanceClassParamsSchema,
  attendanceSessionParamsSchema,
  attendanceStudentParamsSchema,
  attendanceQuerySchema,
} from '@/schemas/attendance.schema';
import { logger } from '@/config/logger';

// ─── POST /api/attendance/scan ───────────────────────────────
// Admin scans a student's barcode at the physical entrance
export const scanBarcode = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input = scanBarcodeSchema.parse(req.body);
    const attendance = await AttendanceService.scanBarcode(input);

    res.status(200).json({
      status: 'success',
      data: attendance,
      message: 'Attendance recorded successfully.',
    });
  },
);

// ─── POST /api/attendance/zoom-webhook ───────────────────────
// Zoom sends participant.joined events — no auth, verified by secret
export const handleZoomWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;

    // Zoom URL validation challenge — respond with the challenge token
    // Zoom sends this during webhook endpoint setup to verify ownership
    if (body.event === 'endpoint.url_validation') {
      const plainToken = body.payload as Record<string, unknown>;
      res.status(200).json({
        plainToken: (plainToken as Record<string, unknown>).plainToken,
        encryptedToken: (plainToken as Record<string, unknown>).plainToken,
        message: body,
      });
      return;
    }

    // Only process participant.joined events
    if (body.event !== 'meeting.participant_joined') {
      res.status(200).json({ status: 'success', message: 'Event ignored.' });
      return;
    }

    const parsed = zoomWebhookPayloadSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn({ errors: parsed.error.issues }, 'Invalid Zoom webhook payload — ignoring.');
      res.status(200).json({ status: 'success', message: 'Payload ignored.' });
      return;
    }

    const { payload } = parsed.data;
    const meetingId = String(payload.object.id);
    const participantEmail = payload.object.participant.email;
    const joinTime = payload.object.participant.join_time;

    await AttendanceService.handleZoomWebhook(meetingId, participantEmail, joinTime);

    // Always respond 200 to Zoom — even on errors, to prevent retries
    res.status(200).json({ status: 'success', message: 'Webhook processed.' });
  },
);

// ─── POST /api/attendance/manual ─────────────────────────────
// Admin manually marks a student present (reconciliation fallback)
export const markManualAttendance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input = manualAttendanceSchema.parse(req.body);
    const attendance = await AttendanceService.markManualAttendance(input);

    res.status(200).json({
      status: 'success',
      data: attendance,
      message: 'Attendance manually recorded.',
    });
  },
);

// ─── POST /api/attendance/video ──────────────────────────────
// Student watches a recorded video — log attendance for that session
export const markVideoAttendance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input = videoAttendanceSchema.parse(req.body);
    const attendance = await AttendanceService.markVideoAttendance(
      req.user!.userId,
      input.classSessionId,
    );

    res.status(200).json({
      status: 'success',
      data: attendance,
      message: 'Video attendance recorded.',
    });
  },
);

// ─── GET /api/attendance/session/:sessionId ──────────────────
// Get all attendance records for a specific class session
export const getAttendanceBySession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = attendanceSessionParamsSchema.parse(req.params);
    const records = await AttendanceService.getAttendanceBySession(sessionId);

    res.status(200).json({
      status: 'success',
      data: records,
      count: records.length,
    });
  },
);

// ─── GET /api/attendance/class/:classId ──────────────────────
// Get attendance for all sessions in a course (paginated)
export const getAttendanceByCourse = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { classId } = attendanceClassParamsSchema.parse(req.params);
    const query = attendanceQuerySchema.parse(req.query);
    const { records, total } = await AttendanceService.getAttendanceByCourse(classId, query);

    res.status(200).json({
      status: 'success',
      data: records,
      count: total,
      page: query.page,
      limit: query.limit,
    });
  },
);

// ─── GET /api/attendance/student/:userId ─────────────────────
// Get a student's attendance history (student sees own, admin sees any)
export const getStudentAttendance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = attendanceStudentParamsSchema.parse(req.params);
    const query = attendanceQuerySchema.parse(req.query);
    const { records, total } = await AttendanceService.getStudentAttendance(
      userId,
      req.user!.userId,
      req.user!.role,
      query,
    );

    res.status(200).json({
      status: 'success',
      data: records,
      count: total,
      page: query.page,
      limit: query.limit,
    });
  },
);
