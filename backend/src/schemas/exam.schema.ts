import { ExamType } from '@prisma/client';
import { z } from 'zod';
import {
	EXAM_PDF_CONTENT_TYPE,
	EXAM_PDF_MAX_SIZE_BYTES,
} from '@/utils/constants';

// ─── MCQ Payload ───────────────────────────────────────────

const mcqOptionSchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	isCorrect: z.boolean(),
});

const mcqQuestionSchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	order: z.coerce.number().int().positive(),
	marks: z.coerce.number().int().positive(),
	options: z.array(mcqOptionSchema).min(2),
});

export const mcqPayloadSchema = z.object({
	questions: z.array(mcqQuestionSchema).min(1),
});

export type McqPayloadInput = z.infer<typeof mcqPayloadSchema>;

// ─── Exam CRUD ──────────────────────────────────────────────

const examBaseSchema = z.object({
	title: z.string().min(3).max(200).trim(),
	type: z.nativeEnum(ExamType),
	courseId: z.string().uuid(),
	startTime: z.coerce.date(),
	endTime: z.coerce.date(),
	totalMarks: z.coerce.number().int().positive().optional(),
	paperPdfUrl: z.string().trim().min(1).nullable().optional(),
	mcqPayload: mcqPayloadSchema.nullable().optional(),
	// Answer channels students may use (default true in DB if omitted)
	allowTypedAnswers: z.boolean().optional(),
	allowPdfUpload: z.boolean().optional(),
	paperRevisionId: z.string().uuid().optional(),
});

export const createExamSchema = examBaseSchema;
export type CreateExamInput = z.infer<typeof createExamSchema>;

export const updateExamSchema = examBaseSchema.partial();
export type UpdateExamInput = z.infer<typeof updateExamSchema>;

// ─── Params ─────────────────────────────────────────────────

export const examIdParamSchema = z.object({
	id: z.string().uuid(),
});

// ─── List / Filters ─────────────────────────────────────────

export const listExamsQuerySchema = z.object({
	courseId: z.string().uuid().optional(),
	type: z.nativeEnum(ExamType).optional(),
	status: z.enum(['all', 'upcoming', 'active', 'ended']).default('all'),
});

export type ListExamsQuery = z.infer<typeof listExamsQuerySchema>;

// ─── Upload URL ─────────────────────────────────────────────

export const examUploadUrlSchema = z.object({
	fileName: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.regex(/^[A-Za-z0-9._-]+\.pdf$/, 'File name must be a .pdf without spaces.'),
	contentType: z.literal(EXAM_PDF_CONTENT_TYPE),
	fileSizeBytes: z.coerce
		.number()
		.int()
		.positive()
		.max(EXAM_PDF_MAX_SIZE_BYTES),
});

export type ExamUploadUrlInput = z.infer<typeof examUploadUrlSchema>;

// Confirms the paper PDF actually landed in R2 (called after the browser PUT).
export const examPaperConfirmSchema = z.object({
	key: z.string().trim().min(1).max(300),
});

export type ExamPaperConfirmInput = z.infer<typeof examPaperConfirmSchema>;

// ─── Marker Assignment ──────────────────────────────────────

export const assignMarkersSchema = z.object({
	markerIds: z.array(z.string().uuid()).min(1),
});

export type AssignMarkersInput = z.infer<typeof assignMarkersSchema>;

export const replaceMarkersSchema = z.object({
	markerIds: z.array(z.string().uuid()).max(50),
});

export type ReplaceMarkersInput = z.infer<typeof replaceMarkersSchema>;

// Scoped instances must state their intended audience set explicitly. `allAudiences`
// is expanded to the current audience IDs during preview/confirmation; no empty
// scope is interpreted as a whole-exam grant.
const markerAllocationSchema = z.object({
	markerIds: z.array(z.string().uuid()).max(50).default([]),
	groupIds: z.array(z.string().uuid()).max(50).default([]),
	audienceIds: z.array(z.string().uuid()).max(100).default([]),
	allAudiences: z.boolean().default(false),
}).superRefine((value, ctx) => {
	if (value.markerIds.length + value.groupIds.length === 0) ctx.addIssue({ code: 'custom', message: 'Select a marker or marker group.' });
	if (value.allAudiences && value.audienceIds.length) ctx.addIssue({ code: 'custom', message: 'Choose all audiences or selected audiences, not both.' });
	if (!value.allAudiences && value.audienceIds.length === 0) ctx.addIssue({ code: 'custom', message: 'A restricted marker allocation needs at least one audience.' });
});

export const previewMarkerAllocationsSchema = z.object({
	allocations: z.array(markerAllocationSchema).max(100),
});
export const confirmMarkerAllocationsSchema = previewMarkerAllocationsSchema.extend({
	reason: z.string().trim().min(3).max(500),
	expectedAudienceRevision: z.coerce.number().int().nonnegative(),
	expectedRosterRevision: z.coerce.number().int().nonnegative(),
	expectedAllocationRevision: z.coerce.number().int().nonnegative(),
	digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PreviewMarkerAllocationsInput = z.infer<typeof previewMarkerAllocationsSchema>;
export type ConfirmMarkerAllocationsInput = z.infer<typeof confirmMarkerAllocationsSchema>;
