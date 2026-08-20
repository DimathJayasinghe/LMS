import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ClassController from '@/controllers/class.controller';
import { classSessionRoutes } from '@/routes/class-session.routes';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import {
	classIdParamSchema,
	courseAssetConfirmSchema,
	courseAssetAltSchema,
	courseAssetParamsSchema,
	courseAssetUploadUrlSchema,
	createClassSchema,
	listClassesQuerySchema,
	listPublicClassesQuerySchema,
	updateClassSchema,
} from '@/schemas/class.schema';

export const classRoutes = Router();

// ─── Class Sessions (Nested) ───────────────────────────────
classRoutes.use('/:classId/sessions', classSessionRoutes);

// ─── Public (unauthenticated) — marketing /courses page ─────
// Must be registered before `GET /:classId` below, or Express would match
// this path as classId="public" and 401 it.
classRoutes.get(
	'/public',
	validateQuery(listPublicClassesQuerySchema),
	ClassController.listPublicClasses,
);

// ─── Classes (Courses) ────────────────────────────────────
classRoutes.post(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateBody(createClassSchema),
	checkIdempotency,
	ClassController.createClass,
);

classRoutes.get(
	'/',
	verifyToken,
	validateQuery(listClassesQuerySchema),
	ClassController.listClasses,
);

classRoutes.post(
	'/:classId/assets/upload-url',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(classIdParamSchema),
	validateBody(courseAssetUploadUrlSchema),
	ClassController.getCourseAssetUploadUrl,
);

classRoutes.post(
	'/:classId/assets/confirm',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(classIdParamSchema),
	validateBody(courseAssetConfirmSchema),
	checkIdempotency,
	ClassController.confirmCourseAsset,
);

classRoutes.delete(
	'/:classId/assets/:kind',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(courseAssetParamsSchema),
	checkIdempotency,
	ClassController.removeCourseAsset,
);

classRoutes.patch(
	'/:classId/assets/:kind/alt',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(courseAssetParamsSchema),
	validateBody(courseAssetAltSchema),
	checkIdempotency,
	ClassController.updateCourseAssetAlt,
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
	checkIdempotency,
	ClassController.updateClass,
);
