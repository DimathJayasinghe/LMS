import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as LiveClassService from '@/services/live-class.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import { classSessionParamsSchema } from '@/schemas/class-session.schema';

// ─── POST /api/classes/:classId/sessions/:sessionId/live/schedule ──
// Teacher/Super Admin turns an ONLINE session into a real, hosted Zoom meeting.
export const scheduleLiveClass = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = classSessionParamsSchema.parse(req.params);
    const result = await LiveClassService.scheduleLiveClass(sessionId, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.LIVE_CLASS_SCHEDULED,
      targetType: 'ClassSession',
      targetId: sessionId,
      context: extractAuditContext(req),
    });

    res.status(201).json({
      status: 'success',
      data: result,
      message: 'Live class scheduled.',
    });
  },
);

// ─── POST /api/classes/:classId/sessions/:sessionId/live/token ─────
// Mints a fresh, short-lived Meeting SDK join/host token. Role (host vs
// participant) and access (enrolled+paid for students) are resolved inside
// the service — every authenticated role may call this; most will simply be
// gated out with the appropriate error.
export const issueLiveClassToken = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = classSessionParamsSchema.parse(req.params);
    const token = await LiveClassService.issueLiveClassToken(sessionId, req.user!);

    res.status(200).json({
      status: 'success',
      data: token,
      message: 'Live class token issued.',
    });
  },
);
