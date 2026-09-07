import { ExamAudienceDeliveryMode } from '@prisma/client';
import { z } from 'zod';
const reason = z.string().trim().min(1).max(500);
export const replaceExamAudiencesSchema = z.object({ audiences: z.array(z.object({ id: z.string().uuid().optional(), label: z.string().trim().min(1).max(120), deliveryMode: z.nativeEnum(ExamAudienceDeliveryMode), instituteId: z.string().uuid().optional() })).max(100), reason, expectedRevision: z.coerce.number().int().nonnegative() });
export const replaceExamParticipantsSchema = z.object({ assignments: z.array(z.object({ userId: z.string().uuid(), audienceId: z.string().uuid() })).max(2000), reason, expectedRevision: z.coerce.number().int().nonnegative() });
export const eligibleStudentsQuerySchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });
export type ReplaceExamAudiencesInput = z.infer<typeof replaceExamAudiencesSchema>;
export type ReplaceExamParticipantsInput = z.infer<typeof replaceExamParticipantsSchema>;
