import { Router } from 'express';
import { Role } from '@prisma/client';
import * as SubmissionController from '@/controllers/submission.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import {
  startSubmissionSchema,
  completeSubmissionSchema,
  completeSubmissionBodySchema,
  correctPublishedResultSchema,
  listSubmissionsParamsSchema,
  listSubmissionsQuerySchema,
  listMySubmissionsQuerySchema,
  submissionIdParamSchema,
  submitMarksSchema,
  publishResultsParamsSchema,
} from '@/schemas/submission.schema';

export const submissionRoutes = Router();

// ─── Start Submission (Student) ─────────────────────────────
// Student begins their exam submission:
// - MCQ: submits answers inline, auto-graded immediately
// - WRITTEN/HYBRID: receives a presigned R2 upload URL for the answer PDF
submissionRoutes.post(
  '/',
  verifyToken,
  requireRole(Role.STUDENT),
  validateBody(startSubmissionSchema),
  SubmissionController.startSubmission,
);

// ─── Complete Upload (Student) ──────────────────────────────
// After the browser finishes uploading the PDF to R2, mark submission as complete
submissionRoutes.patch(
  '/:id/complete',
  verifyToken,
  requireRole(Role.STUDENT),
  validateParams(completeSubmissionSchema),
  validateBody(completeSubmissionBodySchema),
  SubmissionController.completeSubmission,
);

submissionRoutes.patch(
  '/:id/result-correction',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER),
  validateParams(submissionIdParamSchema),
  validateBody(correctPublishedResultSchema),
  checkIdempotency,
  SubmissionController.correctPublishedResult,
);

// ─── List My Submissions (Student) ──────────────────────────
// A student reads their own submissions; marks/feedback appear once published.
submissionRoutes.get(
  '/mine',
  verifyToken,
  requireRole(Role.STUDENT),
  validateQuery(listMySubmissionsQuerySchema),
  SubmissionController.listMySubmissions,
);

// ─── List Submissions by Exam (Admin / Assigned Marker) ─────
submissionRoutes.get(
  '/exam/:examId',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER),
  validateParams(listSubmissionsParamsSchema),
  validateQuery(listSubmissionsQuerySchema),
  SubmissionController.listSubmissions,
);

// ─── Submit Marks (Assigned Marker) ─────────────────────────
// Idempotency key required — prevents double-grading from network retries
submissionRoutes.patch(
  '/:id/marks',
  verifyToken,
  requireRole(Role.MARKER),
  validateParams(submissionIdParamSchema),
  validateBody(submitMarksSchema),
  checkIdempotency,
  SubmissionController.submitMarks,
);

// ─── Publish Results (Admin / Super Admin) ──────────────────
// Flips exam.isPublished = true, making marks visible to students
submissionRoutes.post(
  '/exam/:examId/publish',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER),
  validateParams(publishResultsParamsSchema),
  checkIdempotency,
  SubmissionController.publishResults,
);
