import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import * as PaymentBulkService from '@/services/payment-bulk.service';
import { bulkUploadQuerySchema } from '@/schemas/payment.schema';

type RequestWithFile = Request & { file?: Express.Multer.File };

/**
 * Placeholder for bulk payment SMS. Called only when SMS_BULK_PAYMENT_ENABLED is true and the payments were saved.
 * A real version has to know which students were affected; for now it logs the intent.
 */
const sendBulkPaymentSms = async (): Promise<void> => {
	logger.info('Bulk payment SMS trigger — would send per-student notifications');
};

const messageFor = ({ dryRun, applied }: { dryRun: boolean; applied: boolean }): string => {
	if (applied) return 'Bulk upload applied.';
	return dryRun ? 'Preview only. Nothing was saved.' : 'Nothing was saved. Fix the rows listed and upload the file again.';
};

export const bulkUploadPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const file = (req as RequestWithFile).file;
	if (!file) {
		res.status(400).json({ status: 'error', message: 'Bulk upload file is required.' });
		return;
	}

	const { dryRun } = bulkUploadQuerySchema.parse(req.query);
	const result = await PaymentBulkService.bulkUploadPayments(req.user!, file, { dryRun }, extractAuditContext(req));

	if (result.applied && env.SMS_BULK_PAYMENT_ENABLED) void sendBulkPaymentSms();

	res.set('Cache-Control', 'no-store');
	res.status(200).json({ status: 'success', data: result, message: messageFor(result) });
});
