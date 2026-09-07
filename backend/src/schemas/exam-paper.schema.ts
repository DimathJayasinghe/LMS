import { ExamType } from '@prisma/client';
import { z } from 'zod';
import { mcqPayloadSchema } from '@/schemas/exam.schema';

export const paperRevisionSchema = z.object({
	type: z.nativeEnum(ExamType), totalMarks: z.coerce.number().int().positive(),
	paperPdfUrl: z.string().trim().min(1).nullable().optional(), mcqPayload: mcqPayloadSchema.nullable().optional(),
	allowTypedAnswers: z.boolean().optional(), allowPdfUpload: z.boolean().optional(),
});
export const createExamPaperSchema = z.object({ courseId: z.string().uuid(), title: z.string().trim().min(3).max(200), revision: paperRevisionSchema });
export const paperIdParamSchema = z.object({ id: z.string().uuid() });
export type PaperRevisionInput = z.infer<typeof paperRevisionSchema>;
export type CreateExamPaperInput = z.infer<typeof createExamPaperSchema>;
