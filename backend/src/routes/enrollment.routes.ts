import { Router } from 'express';
import { Role } from '@prisma/client';
import * as EnrollmentController from '@/controllers/enrollment.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
	createEnrollmentSchema,
	enrollmentIdParamSchema,
	listEnrollmentsQuerySchema,
	listMyEnrollmentsQuerySchema,
} from '@/schemas/enrollment.schema';

export const enrollmentRoutes = Router();

// POST /api/enrollments — Student self-enrolls; ADMIN/SUPER_ADMIN enroll a student.
enrollmentRoutes.post(
	'/',
	verifyToken,
	requireRole(Role.STUDENT, Role.ADMIN, Role.SUPER_ADMIN),
	validateBody(createEnrollmentSchema),
	EnrollmentController.createEnrollment,
);

// GET /api/enrollments/my — Student lists their own enrollments (with course).
// Declared before "/:id" so "my" isn't captured as an id.
enrollmentRoutes.get(
	'/my',
	verifyToken,
	requireRole(Role.STUDENT),
	validateQuery(listMyEnrollmentsQuerySchema),
	EnrollmentController.listMyEnrollments,
);

// GET /api/enrollments — Admin oversight (paginated, filterable).
enrollmentRoutes.get(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateQuery(listEnrollmentsQuerySchema),
	EnrollmentController.listEnrollments,
);

// GET /api/enrollments/:id — Owner (student) or staff.
enrollmentRoutes.get(
	'/:id',
	verifyToken,
	requireRole(Role.STUDENT, Role.ADMIN, Role.SUPER_ADMIN),
	validateParams(enrollmentIdParamSchema),
	EnrollmentController.getEnrollmentById,
);

// DELETE /api/enrollments/:id — Soft-cancel (owner or staff); history is kept.
enrollmentRoutes.delete(
	'/:id',
	verifyToken,
	requireRole(Role.STUDENT, Role.ADMIN, Role.SUPER_ADMIN),
	validateParams(enrollmentIdParamSchema),
	EnrollmentController.cancelEnrollment,
);
