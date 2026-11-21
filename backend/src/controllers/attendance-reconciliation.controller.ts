import { Request, Response } from 'express';
import * as ReconciliationService from '@/services/attendance-reconciliation.service';
import * as AuditService from '@/services/audit.service';
import { attendanceSessionParamsSchema } from '@/schemas/attendance.schema';
import { extractAuditContext } from '@/utils/audit-context';
import { asyncHandler } from '@/utils/async-handler';
import { AUDIT_ACTION } from '@/utils/constants';

export const previewZoomAttendance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = attendanceSessionParamsSchema.parse(req.params);
    const preview = await ReconciliationService.previewZoomAttendance(sessionId, req.user!);

    res.status(200).json({ status: 'success', data: preview });
  },
);

export const reconcileZoomAttendance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = attendanceSessionParamsSchema.parse(req.params);
    const result = await ReconciliationService.reconcileZoomAttendance(sessionId, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.ATTENDANCE_RECONCILED,
      description: `Zoom attendance reconciled: ${result.applied} missing record(s) added`,
      targetType: 'ClassSession',
      targetId: sessionId,
      metadata: { ...result.summary, applied: result.applied, zoomMeetingId: result.zoomMeetingId },
      context: extractAuditContext(req),
    });

    res.status(200).json({
      status: 'success',
      data: result,
      message: `${result.applied} missing attendance record(s) added.`,
    });
  },
);
