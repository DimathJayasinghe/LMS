import { z } from 'zod';
import { PAYMENT_MONTH_REGEX } from '@/utils/constants';

const monthSchema = z.string().trim().regex(PAYMENT_MONTH_REGEX, 'Payment month must be in YYYY-MM format.');

// ─── Who owes (front desk, owner) ─────────────────────────
export const outstandingQuerySchema = z.object({
	month: monthSchema.optional(),
	courseId: z.string().uuid().optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type OutstandingQueryInput = z.infer<typeof outstandingQuerySchema>;

export const outstandingExportQuerySchema = z.object({
	month: monthSchema.optional(),
	courseId: z.string().uuid().optional(),
});

export type OutstandingExportQueryInput = z.infer<typeof outstandingExportQuerySchema>;

// ─── Manual fee reminders ─────────────────────────────────
export const sendFeeRemindersSchema = z
	.object({
		month: monthSchema,
		courseId: z.string().uuid().optional(),
		enrollmentIds: z.array(z.string().uuid()).min(1).max(500).optional(),
	})
	.strict()
	.refine((data) => data.courseId !== undefined || data.enrollmentIds !== undefined, {
		message: 'Choose a course or specific enrollments.',
	});

export type SendFeeRemindersInput = z.infer<typeof sendFeeRemindersSchema>;
