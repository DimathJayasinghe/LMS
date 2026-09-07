import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ExamController from '@/controllers/exam.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import {
	assignMarkersSchema,
	replaceMarkersSchema,
	createExamSchema,
	examIdParamSchema,
	examUploadUrlSchema,
	examPaperConfirmSchema,
	listExamsQuerySchema,
	updateExamSchema,
} from '@/schemas/exam.schema';

export const examRoutes = Router();

// ─── Create Exam ────────────────────────────────────────────
examRoutes.post(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateBody(createExamSchema),
	checkIdempotency,
	ExamController.createExam,
);

examRoutes.get(
	'/:id/markers',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	ExamController.listMarkers,
);

examRoutes.put(
	'/:id/markers',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	validateBody(replaceMarkersSchema),
	checkIdempotency,
	ExamController.replaceMarkers,
);

// ─── List Exams ─────────────────────────────────────────────
examRoutes.get(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT),
	validateQuery(listExamsQuerySchema),
	ExamController.listExams,
);

// ─── Paper Upload URL ──────────────────────────────────────
examRoutes.post(
	'/:id/upload-url',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	validateBody(examUploadUrlSchema),
	ExamController.getPaperUploadUrl,
);

// ─── Confirm Paper Upload (after the browser PUT) ──────────
examRoutes.post(
	'/:id/paper/confirm',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	validateBody(examPaperConfirmSchema),
	ExamController.confirmPaperUpload,
);

// ─── Assign Markers ─────────────────────────────────────────
examRoutes.post(
	'/:id/assign-markers',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	validateBody(assignMarkersSchema),
	ExamController.assignMarkers,
);

// ─── Get Exam Detail ────────────────────────────────────────
examRoutes.get(
	'/:id',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT),
	validateParams(examIdParamSchema),
	ExamController.getExamById,
);

// ─── Update Exam ────────────────────────────────────────────
examRoutes.patch(
	'/:id',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	validateBody(updateExamSchema),
	ExamController.updateExam,
);

// ─── Soft Delete Exam ───────────────────────────────────────
examRoutes.delete(
	'/:id',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	ExamController.deleteExam,
);
