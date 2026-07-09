import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as ClassSessionService from '@/services/class-session.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
  classSessionParamsSchema,
  createClassSessionSchema,
  listClassSessionsQuerySchema,
  updateClassSessionSchema,
} from '@/schemas/class-session.schema';
import { classIdParamSchema } from '@/schemas/class.schema';

export const createClassSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { classId } = classIdParamSchema.parse(req.params);
    const input = createClassSessionSchema.parse(req.body);
    const session = await ClassSessionService.createClassSession(classId, input, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.SESSION_CREATED,
      description: `Session "${session.title}" created`,
      targetType: 'ClassSession',
      targetId: session.id,
      context: extractAuditContext(req),
    });

    res.status(201).json({
      status: 'success',
      data: session,
      message: 'Class session created successfully.',
    });
  },
);

export const listClassSessions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { classId } = classIdParamSchema.parse(req.params);
    const query = listClassSessionsQuerySchema.parse(req.query);
    const sessions = await ClassSessionService.listClassSessions(classId, query, req.user!);

    res.status(200).json({
      status: 'success',
      data: sessions,
      count: sessions.length,
    });
  },
);

export const getClassSessionById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { classId, sessionId } = classSessionParamsSchema.parse(req.params);
    const session = await ClassSessionService.getClassSessionById(
      classId,
      sessionId,
      req.user!,
    );

    res.status(200).json({
      status: 'success',
      data: session,
    });
  },
);

export const updateClassSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { classId, sessionId } = classSessionParamsSchema.parse(req.params);
    const input = updateClassSessionSchema.parse(req.body);
    const session = await ClassSessionService.updateClassSession(classId, sessionId, input, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.SESSION_UPDATED,
      targetType: 'ClassSession',
      targetId: sessionId,
      context: extractAuditContext(req),
    });

    res.status(200).json({
      status: 'success',
      data: session,
      message: 'Class session updated successfully.',
    });
  },
);

export const deleteClassSession = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { classId, sessionId } = classSessionParamsSchema.parse(req.params);
    const session = await ClassSessionService.deleteClassSession(classId, sessionId, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.SESSION_DELETED,
      description: `Session "${session.title}" soft-deleted`,
      targetType: 'ClassSession',
      targetId: sessionId,
      context: extractAuditContext(req),
    });

    res.status(200).json({
      status: 'success',
      data: session,
      message: 'Class session deleted successfully.',
    });
  },
);

