import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as ClassSessionService from '@/services/class-session.service';
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
    const session = await ClassSessionService.createClassSession(classId, input);

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
    const sessions = await ClassSessionService.listClassSessions(classId, query, req.user!.role);

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
      req.user!.role,
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
    const session = await ClassSessionService.updateClassSession(classId, sessionId, input);

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
    const session = await ClassSessionService.deleteClassSession(classId, sessionId);

    res.status(200).json({
      status: 'success',
      data: session,
      message: 'Class session deleted successfully.',
    });
  },
);
