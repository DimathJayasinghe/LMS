import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ExamController from '@/controllers/exam.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
	assignMarkersSchema,
	createExamSchema,
	examIdParamSchema,
	examUploadUrlSchema,
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
	ExamController.createExam,
);

// ─── List Exams ─────────────────────────────────────────────
examRoutes.get(
	'/',
	verifyToken,
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
