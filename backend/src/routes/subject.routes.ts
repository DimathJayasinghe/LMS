import { Router } from 'express';
import { Role } from '@prisma/client';
import * as SubjectController from '@/controllers/subject.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
  createSubjectSchema,
  listSubjectsQuerySchema,
  subjectIdParamSchema,
  updateSubjectSchema,
} from '@/schemas/subject.schema';

export const subjectRoutes = Router();

// POST /api/subjects — Create a subject (Super Admin only)
subjectRoutes.post(
  '/',
  verifyToken,
  requireRole(Role.SUPER_ADMIN),
  validateBody(createSubjectSchema),
  SubjectController.createSubject,
);

// GET /api/subjects — List subjects (any authenticated user)
subjectRoutes.get(
  '/',
  verifyToken,
  validateQuery(listSubjectsQuerySchema),
  SubjectController.listSubjects,
);

// GET /api/subjects/:id — Get a subject (any authenticated user)
subjectRoutes.get(
  '/:id',
  verifyToken,
  validateParams(subjectIdParamSchema),
  SubjectController.getSubjectById,
);

// PATCH /api/subjects/:id — Update a subject (Super Admin only)
subjectRoutes.patch(
  '/:id',
  verifyToken,
  requireRole(Role.SUPER_ADMIN),
  validateParams(subjectIdParamSchema),
  validateBody(updateSubjectSchema),
  SubjectController.updateSubject,
);
