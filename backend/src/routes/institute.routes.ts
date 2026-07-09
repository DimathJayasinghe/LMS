import { Router } from 'express';
import { Role } from '@prisma/client';
import * as InstituteController from '@/controllers/institute.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
  createInstituteSchema,
  instituteIdParamSchema,
  listInstitutesQuerySchema,
  updateInstituteSchema,
} from '@/schemas/institute.schema';

export const instituteRoutes = Router();

// POST /api/institutes — Create a physical institute (Super Admin only)
instituteRoutes.post(
  '/',
  verifyToken,
  requireRole(Role.SUPER_ADMIN),
  validateBody(createInstituteSchema),
  InstituteController.createInstitute,
);

// GET /api/institutes — List institutes (any authenticated user; students pick at setup)
instituteRoutes.get(
  '/',
  verifyToken,
  validateQuery(listInstitutesQuerySchema),
  InstituteController.listInstitutes,
);

// GET /api/institutes/:id — Get an institute (any authenticated user)
instituteRoutes.get(
  '/:id',
  verifyToken,
  validateParams(instituteIdParamSchema),
  InstituteController.getInstituteById,
);

// PATCH /api/institutes/:id — Update an institute (Super Admin only)
instituteRoutes.patch(
  '/:id',
  verifyToken,
  requireRole(Role.SUPER_ADMIN),
  validateParams(instituteIdParamSchema),
  validateBody(updateInstituteSchema),
  InstituteController.updateInstitute,
);
