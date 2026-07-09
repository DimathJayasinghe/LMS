import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ClassController from '@/controllers/class.controller';
import { classSessionRoutes } from '@/routes/class-session.routes';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
	classIdParamSchema,
	createClassSchema,
	listClassesQuerySchema,
	updateClassSchema,
} from '@/schemas/class.schema';

export const classRoutes = Router();

// ─── Class Sessions (Nested) ───────────────────────────────
classRoutes.use('/:classId/sessions', classSessionRoutes);

// ─── Classes (Courses) ────────────────────────────────────
classRoutes.post(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateBody(createClassSchema),
	ClassController.createClass,
);

classRoutes.get(
	'/',
	verifyToken,
	validateQuery(listClassesQuerySchema),
	ClassController.listClasses,
);

classRoutes.get(
	'/:classId',
	verifyToken,
	validateParams(classIdParamSchema),
	ClassController.getClassById,
);

classRoutes.patch(
	'/:classId',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(classIdParamSchema),
	validateBody(updateClassSchema),
	ClassController.updateClass,
);
