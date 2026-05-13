import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ClassSessionController from '@/controllers/class-session.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { classIdParamSchema } from '@/schemas/class.schema';
import {
  classSessionParamsSchema,
  createClassSessionSchema,
  listClassSessionsQuerySchema,
  updateClassSessionSchema,
} from '@/schemas/class-session.schema';

export const classSessionRoutes = Router({ mergeParams: true });

classSessionRoutes.post(
  '/',
  verifyToken,
  requireRole(Role.ADMIN, Role.STAFF),
  validateParams(classIdParamSchema),
  validateBody(createClassSessionSchema),
  ClassSessionController.createClassSession,
);

classSessionRoutes.get(
  '/',
  verifyToken,
  validateParams(classIdParamSchema),
  validateQuery(listClassSessionsQuerySchema),
  ClassSessionController.listClassSessions,
);

classSessionRoutes.get(
  '/:sessionId',
  verifyToken,
  validateParams(classSessionParamsSchema),
  ClassSessionController.getClassSessionById,
);

classSessionRoutes.patch(
  '/:sessionId',
  verifyToken,
  requireRole(Role.ADMIN, Role.STAFF),
  validateParams(classSessionParamsSchema),
  validateBody(updateClassSessionSchema),
  ClassSessionController.updateClassSession,
);

classSessionRoutes.delete(
  '/:sessionId',
  verifyToken,
  requireRole(Role.ADMIN, Role.STAFF),
  validateParams(classSessionParamsSchema),
  ClassSessionController.deleteClassSession,
);
