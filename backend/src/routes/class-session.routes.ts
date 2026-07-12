import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ClassSessionController from '@/controllers/class-session.controller';
import * as LiveClassController from '@/controllers/live-class.controller';
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
  requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.ADMIN),
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
  requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.ADMIN),
  validateParams(classSessionParamsSchema),
  validateBody(updateClassSessionSchema),
  ClassSessionController.updateClassSession,
);

classSessionRoutes.delete(
  '/:sessionId',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.ADMIN),
  validateParams(classSessionParamsSchema),
  ClassSessionController.deleteClassSession,
);

// ─── Live Classes (Zoom Meeting SDK) ────────────────────────
// MUST be registered after the plain `/:sessionId` routes above so `/live/*`
// isn't shadowed — Express matches by literal-vs-param specificity per verb,
// but keeping this order makes the precedence obvious on read.

classSessionRoutes.post(
  '/:sessionId/live/schedule',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER),
  validateParams(classSessionParamsSchema),
  LiveClassController.scheduleLiveClass,
);

classSessionRoutes.post(
  '/:sessionId/live/token',
  verifyToken,
  validateParams(classSessionParamsSchema),
  LiveClassController.issueLiveClassToken,
);
