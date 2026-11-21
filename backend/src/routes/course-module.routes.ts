import { Role } from '@prisma/client';
import { Router } from 'express';
import * as CourseModuleController from '@/controllers/course-module.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams } from '@/middleware/validate.middleware';
import { classIdParamSchema } from '@/schemas/class.schema';
import {
	confirmCourseMaterialSchema,
	courseMaterialUploadUrlSchema,
	createCourseModuleSchema,
	materialParamsSchema,
	moduleParamsSchema,
	updateCourseModuleSchema,
	updateCourseMaterialSchema,
} from '@/schemas/course-module.schema';

export const courseModuleRoutes = Router({ mergeParams: true });

courseModuleRoutes.get(
	'/',
	verifyToken,
	validateParams(classIdParamSchema),
	CourseModuleController.listCourseModules,
);

courseModuleRoutes.patch(
	'/:moduleId/materials/:materialId',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(materialParamsSchema),
	validateBody(updateCourseMaterialSchema),
	checkIdempotency,
	CourseModuleController.updateCourseMaterial,
);

courseModuleRoutes.post(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(classIdParamSchema),
	validateBody(createCourseModuleSchema),
	checkIdempotency,
	CourseModuleController.createCourseModule,
);

courseModuleRoutes.patch(
	'/:moduleId',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(moduleParamsSchema),
	validateBody(updateCourseModuleSchema),
	checkIdempotency,
	CourseModuleController.updateCourseModule,
);

courseModuleRoutes.delete(
	'/:moduleId',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(moduleParamsSchema),
	checkIdempotency,
	CourseModuleController.removeCourseModule,
);

courseModuleRoutes.post(
	'/:moduleId/materials/upload-url',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(moduleParamsSchema),
	validateBody(courseMaterialUploadUrlSchema),
	CourseModuleController.getCourseMaterialUploadUrl,
);

courseModuleRoutes.post(
	'/:moduleId/materials/confirm',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(moduleParamsSchema),
	validateBody(confirmCourseMaterialSchema),
	checkIdempotency,
	CourseModuleController.confirmCourseMaterial,
);

courseModuleRoutes.get(
	'/:moduleId/materials/:materialId/download',
	verifyToken,
	validateParams(materialParamsSchema),
	CourseModuleController.downloadCourseMaterial,
);

courseModuleRoutes.delete(
	'/:moduleId/materials/:materialId',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(materialParamsSchema),
	checkIdempotency,
	CourseModuleController.removeCourseMaterial,
);
