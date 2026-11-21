import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as PaymentService from '@/services/payment.service';
import * as PaymentAdjustmentService from '@/services/payment-adjustment.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import {
	collectEntrancePaymentSchema,
	initiatePaymentSchema,
	listMyPaymentsQuerySchema,
	listPaymentsQuerySchema,
	overridePaymentSchema,
	payhereNotifySchema,
	paymentIdParamSchema,
	paymentsSummaryQuerySchema,
	financialReportQuerySchema,
	refundPaymentSchema,
} from '@/schemas/payment.schema';

type RequestWithFile = Request & { file?: Express.Multer.File };

export const initiatePayherePayment = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const input = initiatePaymentSchema.parse(req.body);
		const result = await PaymentService.initiatePayherePayment(req.user!.userId, input);

		res.status(200).json({
			status: 'success',
			data: result,
			message: 'PayHere checkout payload generated successfully.',
		});
	},
);

export const handlePayhereNotify = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const input = payhereNotifySchema.parse(req.body);
		// Notification (in-app + settings-gated SMS) on confirmation is dispatched
		// from PaymentService.handlePayhereNotify itself — see NotificationService.
		const payment = await PaymentService.handlePayhereNotify(input);

		res.status(200).json({
			status: 'success',
			data: payment,
			message: 'Payment notification processed successfully.',
		});
	},
);

export const listPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listPaymentsQuerySchema.parse(req.query);
	const { data, count } = await PaymentService.listPayments(query);

	res.status(200).json({
		status: 'success',
		data,
		count,
	});
});

export const getPaymentsSummary = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { month } = paymentsSummaryQuerySchema.parse(req.query);
	const data = await PaymentService.getPaymentsSummary(month);

	res.status(200).json({
		status: 'success',
		data,
	});
});

export const getFinancialReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = financialReportQuerySchema.parse(req.query);
	const data = await PaymentService.getFinancialReport(
		query.month,
		query,
		req.user!,
	);

	res.status(200).json({
		status: 'success',
		data,
	});
});

export const listMyPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listMyPaymentsQuerySchema.parse(req.query);
	const payments = await PaymentService.listMyPayments(req.user!.userId, query);

	res.status(200).json({
		status: 'success',
		data: payments,
		count: payments.length,
	});
});

export const getPaymentById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = paymentIdParamSchema.parse(req.params);
	const payment = await PaymentService.getPaymentById(id, req.user!.userId, req.user!.role);

	res.status(200).json({
		status: 'success',
		data: payment,
	});
});

export const getPayhereStatus = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = paymentIdParamSchema.parse(req.params);
		const payment = await PaymentService.getPaymentById(id, req.user!.userId, req.user!.role);

		res.status(200).json({
			status: 'success',
			data: {
				id: payment.id,
				status: payment.status,
				paymentMonth: payment.paymentMonth,
				amount: payment.amount,
				payhereId: payment.payhereId,
			},
		});
	},
);

export const overridePayment = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = paymentIdParamSchema.parse(req.params);
		const input = overridePaymentSchema.parse(req.body);

		// Fetch before state for audit
		const before = await PaymentService.getPaymentById(id, req.user!.userId, req.user!.role);
		const payment = await PaymentService.overridePayment(id, input, req.user!.userId);

		void AuditService.log({
			action: AUDIT_ACTION.PAYMENT_OVERRIDDEN,
			description: `Payment status changed from ${before.status} to ${input.status}`,
			targetType: 'Payment',
			targetId: id,
			metadata: {
				before: { status: before.status, amount: before.amount.toString() },
				after: { status: input.status, amount: input.amount?.toString() },
				note: input.note,
			},
			context: extractAuditContext(req),
		});

		// Notification (in-app + settings-gated SMS) is dispatched from
		// PaymentService.overridePayment itself — see NotificationService.

		res.status(200).json({
			status: 'success',
			data: payment,
			message: 'Payment updated successfully.',
		});
	},
);

export const listPaymentAdjustments = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = paymentIdParamSchema.parse(req.params);
		const adjustments = await PaymentAdjustmentService.listPaymentAdjustments(id, req.user!);
		res.status(200).json({ status: 'success', data: adjustments, count: adjustments.length });
	},
);

export const refundPayment = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = paymentIdParamSchema.parse(req.params);
		const input = refundPaymentSchema.parse(req.body);
		const result = await PaymentAdjustmentService.refundPayment(id, input, req.user!);

		void AuditService.log({
			action: AUDIT_ACTION.PAYMENT_REFUNDED,
			description: `Completed refund recorded for ${input.amount.toFixed(2)}`,
			targetType: 'Payment',
			targetId: id,
			metadata: {
				adjustmentId: result.adjustment.id,
				amount: input.amount.toFixed(2),
				externalReference: input.externalReference,
				remainingRefundable: result.remainingRefundable,
			},
			context: extractAuditContext(req),
		});

		res.status(201).json({
			status: 'success',
			data: result,
			message: 'Completed refund recorded.',
		});
	},
);

export const bulkUploadPayments = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const file = (req as RequestWithFile).file;
		if (!file) {
			res.status(400).json({
				status: 'error',
				message: 'Bulk upload file is required.',
			});
			return;
		}

		const result = await PaymentService.bulkUploadPayments(file);

		void AuditService.log({
			action: AUDIT_ACTION.PAYMENT_BULK_UPLOAD,
			description: `Bulk upload: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`,
			metadata: {
				total: result.total,
				created: result.created,
				updated: result.updated,
				skipped: result.skipped,
				errorCount: result.errors.length,
			},
			context: extractAuditContext(req),
		});

		// SMS for bulk uploads is toggleable via env var
		if (env.SMS_BULK_PAYMENT_ENABLED && result.created + result.updated > 0) {
			void sendBulkPaymentSms();
		}

		res.status(200).json({
			status: 'success',
			data: result,
			message: 'Bulk upload processed successfully.',
		});
	},
);

export const collectEntrancePayment = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const input = collectEntrancePaymentSchema.parse(req.body);
		const payment = await PaymentService.collectEntrancePayment(req.user!.userId, input);

		void AuditService.log({
			action: AUDIT_ACTION.PAYMENT_ENTRANCE_COLLECTED,
			description: `Entrance payment collected for ${input.paymentMonth}`,
			targetType: 'Payment',
			targetId: payment.id,
			metadata: {
				enrollmentId: input.enrollmentId,
				paymentMonth: input.paymentMonth,
				amount: payment.amount.toString(),
				collectedAtInstituteId: input.collectedAtInstituteId,
				collectedViaBarcode: input.collectedViaBarcode,
			},
			context: extractAuditContext(req),
		});

		res.status(200).json({
			status: 'success',
			data: payment,
			message: 'Payment collected.',
		});
	},
);

// ─── SMS Helpers ──────────────────────────────────────────
// Payment-confirmed and payment-overridden notifications (in-app + SMS) are
// now dispatched from PaymentService itself via NotificationService.dispatch
// — see handlePayhereNotify/overridePayment in payment.service.ts. That
// consolidation also means they now respect the super-admin's
// NotificationSetting toggle, which these old per-controller calls didn't.

/**
 * Placeholder for bulk payment SMS.
 * Called only when SMS_BULK_PAYMENT_ENABLED is true.
 * In a production scenario, this would need to track which specific
 * students were affected by the upload. Currently logs intent.
 */
const sendBulkPaymentSms = async (): Promise<void> => {
	logger.info('Bulk payment SMS trigger — would send per-student notifications');
	// Future: Track affected enrollment IDs during bulkUploadPayments
	// and send SMS to each student with their payment details.
};
