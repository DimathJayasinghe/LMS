import { z } from 'zod';
import {
  ANSWER_PDF_CONTENT_TYPE,
  ANSWER_PDF_MAX_SIZE_BYTES,
} from '@/utils/constants';

// ─── MCQ Answers (student-submitted) ──────────────────────
// Key = question ID, Value = array of selected option IDs

export const mcqAnswersSchema = z.record(
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
);

export type McqAnswersInput = z.infer<typeof mcqAnswersSchema>;

// ─── Written Answers (typed online) ───────────────────────
// Key = question / part ID, Value = the typed essay/structured answer text.

export const writtenAnswersSchema = z.record(
  z.string().min(1),
  z.string().trim().min(1).max(20000),
);

export type WrittenAnswersInput = z.infer<typeof writtenAnswersSchema>;

// ─── Start Submission ──────────────────────────────────────

export const startSubmissionSchema = z.object({
  examId: z.string().uuid(),
  // For WRITTEN/HYBRID — client provides file metadata to get a presigned upload URL
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+\.pdf$/, 'File name must be a .pdf without spaces.')
    .optional(),
  contentType: z.literal(ANSWER_PDF_CONTENT_TYPE).optional(),
  fileSizeBytes: z.coerce
    .number()
    .int()
    .positive()
    .max(ANSWER_PDF_MAX_SIZE_BYTES)
    .optional(),
  // For MCQ/HYBRID — student sends their answers inline
  answers: mcqAnswersSchema.optional(),
  // For WRITTEN/HYBRID — student types essay/structured answers online (no PDF)
  writtenAnswers: writtenAnswersSchema.optional(),
});

export type StartSubmissionInput = z.infer<typeof startSubmissionSchema>;

// ─── List My Submissions (Student) ─────────────────────────

export const listMySubmissionsQuerySchema = z.object({
  examId: z.string().uuid().optional(),
});

export type ListMySubmissionsQuery = z.infer<typeof listMySubmissionsQuerySchema>;

// ─── Complete Upload ────────────────────────────────────────

export const completeSubmissionSchema = z.object({
  id: z.string().uuid(),
});

export type CompleteSubmissionParams = z.infer<typeof completeSubmissionSchema>;

// ─── List Submissions by Exam ──────────────────────────────

export const listSubmissionsParamsSchema = z.object({
  examId: z.string().uuid(),
});

export type ListSubmissionsParams = z.infer<typeof listSubmissionsParamsSchema>;

export const listSubmissionsQuerySchema = z.object({
  status: z.enum(['all', 'UPLOADING', 'COMPLETED']).default('all'),
  graded: z.enum(['all', 'graded', 'ungraded']).default('all'),
});

export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;

// ─── Submit Marks ──────────────────────────────────────────

export const submissionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const submitMarksSchema = z.object({
  marks: z.coerce.number().int().min(0),
  feedback: z.string().trim().max(2000).optional(),
});

export type SubmitMarksInput = z.infer<typeof submitMarksSchema>;

// ─── Publish Results ────────────────────────────────────────

export const publishResultsParamsSchema = z.object({
  examId: z.string().uuid(),
});

export type PublishResultsParams = z.infer<typeof publishResultsParamsSchema>;
