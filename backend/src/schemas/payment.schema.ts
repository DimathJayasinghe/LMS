import { ClassType, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { PAYMENT_MONTH_REGEX } from '@/utils/constants';

const paymentMonthSchema = z
	.string()
	.trim()
	.regex(PAYMENT_MONTH_REGEX, 'Payment month must be in YYYY-MM format.');

// ─── PayHere Initiation ───────────────────────────────────
export const initiatePaymentSchema = z.object({
	enrollmentId: z.string().uuid(),
	paymentMonth: paymentMonthSchema,
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

// ─── PayHere Notify ───────────────────────────────────────
export const payhereNotifySchema = z.object({
	merchant_id: z.string().min(1),
	order_id: z.string().min(1),
	payment_id: z.string().min(1),
	payhere_amount: z.string().min(1),
	payhere_currency: z.string().min(1),
	status_code: z.coerce.number().int(),
	md5sig: z.string().min(1),
	status_message: z.string().optional(),
	method: z.string().optional(),
	custom_1: z.string().optional(),
	custom_2: z.string().optional(),
});

export type PayhereNotifyInput = z.infer<typeof payhereNotifySchema>;

// ─── Lists ────────────────────────────────────────────────
export const listPaymentsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	status: z.nativeEnum(PaymentStatus).optional(),
	paymentMonth: paymentMonthSchema.optional(),
	enrollmentId: z.string().uuid().optional(),
	userId: z.string().uuid().optional(),
	courseId: z.string().uuid().optional(),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const listMyPaymentsQuerySchema = z.object({
	status: z.nativeEnum(PaymentStatus).optional(),
	paymentMonth: paymentMonthSchema.optional(),
	enrollmentId: z.string().uuid().optional(),
});

export type ListMyPaymentsQuery = z.infer<typeof listMyPaymentsQuerySchema>;

// ─── Month Summary (Admin) ────────────────────────────────
export const paymentsSummaryQuerySchema = z.object({
	month: paymentMonthSchema,
});

export type PaymentsSummaryQuery = z.infer<typeof paymentsSummaryQuerySchema>;

// ─── Financial Reports (Admin) ────────────────────────────
export const financialReportQuerySchema = z.object({
	month: paymentMonthSchema.optional(),
});

export type FinancialReportQuery = z.infer<typeof financialReportQuerySchema>;

// ─── Params ───────────────────────────────────────────────
export const paymentIdParamSchema = z.object({
	id: z.string().uuid(),
});

// ─── Override ─────────────────────────────────────────────
export const overridePaymentSchema = z.object({
	status: z.nativeEnum(PaymentStatus),
	amount: z.coerce.number().positive().optional(),
	note: z.string().trim().max(500).optional(),
});

export type OverridePaymentInput = z.infer<typeof overridePaymentSchema>;

// ─── Bulk Upload ──────────────────────────────────────────
export const bulkPaymentRowSchema = z
	.object({
		enrollmentId: z.string().uuid().optional(),
		indexNumber: z.coerce.number().int().positive().optional(),
		courseId: z.string().uuid().optional(),
		classType: z.nativeEnum(ClassType).optional(),
		paymentMonth: paymentMonthSchema,
		amount: z.coerce.number().positive().optional(),
		note: z.string().trim().max(500).optional(),
	})
	.refine(
		(data) => {
			const hasEnrollmentId = Boolean(data.enrollmentId);
			const hasComposite = Boolean(data.indexNumber && data.courseId && data.classType);
			return hasEnrollmentId || hasComposite;
		},
		{ message: 'Provide enrollmentId or indexNumber + courseId + classType.' },
	);

export type BulkPaymentRow = z.infer<typeof bulkPaymentRowSchema>;

// ─── Entrance Collection (Admin/Staff) ─────────────────────
export const collectEntrancePaymentSchema = z.object({
	enrollmentId: z.string().uuid(),
	paymentMonth: paymentMonthSchema,
	amount: z.coerce.number().positive().optional(),
	collectedAtInstituteId: z.string().uuid().optional(),
	collectedViaBarcode: z.string().trim().min(1).max(50).optional(),
});

export type CollectEntrancePaymentInput = z.infer<typeof collectEntrancePaymentSchema>;
