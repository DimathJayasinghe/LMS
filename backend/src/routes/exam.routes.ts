import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import * as ExamController from '@/controllers/exam.controller';
import * as HallMarksController from '@/controllers/hall-marks.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { checkActorIdempotency, checkIdempotency } from '@/middleware/idempotency.middleware';
import {
	assignMarkersSchema,
	replaceMarkersSchema,
	createExamSchema,
	examIdParamSchema,
	examUploadUrlSchema,
	examPaperConfirmSchema,
	listExamsQuerySchema,
	updateExamSchema,
	previewMarkerAllocationsSchema,
	confirmMarkerAllocationsSchema,
} from '@/schemas/exam.schema';
import { hallMarksSchema } from '@/schemas/hall-marks.schema';

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

examRoutes.post(
	'/:id/markers/preview',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	validateBody(previewMarkerAllocationsSchema),
	ExamController.previewMarkerAllocations,
);

examRoutes.get(
	'/:id/markers/history',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	ExamController.listMarkerAllocationHistory,
);

/* The PUT handler accepts legacy { markerIds } only for NULL-paperRevision
 * exams; scoped instances require confirmation fields and reject that legacy
 * form in the service. */
examRoutes.put(
	'/:id/markers',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateParams(examIdParamSchema),
	validateBody(confirmMarkerAllocationsSchema.or(replaceMarkersSchema)),
	ExamController.authorizeLegacyMarkerReplacement,
	// Scoped confirmations deduplicate durably inside the authorized transaction.
	(req, res, next) => {
		if (!Array.isArray(req.body.allocations)) {
			void checkIdempotency(req, res, next);
			return;
		}
		if (!z.string().uuid().safeParse(req.get('Idempotency-Key')).success) {
			res.status(400).json({ status: 'error', message: 'Idempotency-Key must be a valid UUID.' });
			return;
		}
		next();
	},
	ExamController.replaceMarkers,
);

// ─── Hall Marks (paper exams sat in the hall) ───────────────
// Actor-scoped idempotency: the response can carry student names, so it must never replay across actors. Dry runs
// use it too; the screen sends a fresh key for every request.
examRoutes.put(
	'/:id/hall-marks',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER),
	validateParams(examIdParamSchema),
	validateBody(hallMarksSchema),
	checkActorIdempotency,
	HallMarksController.enterHallMarks,
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
