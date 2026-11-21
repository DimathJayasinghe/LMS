import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as OutstandingService from '@/services/outstanding.service';
import * as OutstandingExportService from '@/services/outstanding-export.service';
import * as FeeReminderService from '@/services/fee-reminder.service';
import { outstandingExportQuerySchema, outstandingQuerySchema, type SendFeeRemindersInput } from '@/schemas/outstanding.schema';

export const listOutstanding = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { month, data, count } = await OutstandingService.listOutstanding(req.user!, outstandingQuerySchema.parse(req.query));

	// Names and mobile numbers: never cached by a shared proxy or the browser.
	res.set('Cache-Control', 'no-store');
	res.status(200).json({ status: 'success', data, count, month });
});

export const exportOutstanding = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { filename, csv } = await OutstandingExportService.exportOutstandingCsv(
		req.user!,
		outstandingExportQuerySchema.parse(req.query),
		extractAuditContext(req),
	);

	res.set({
		'Content-Type': 'text/csv; charset=utf-8',
		'Content-Disposition': `attachment; filename="${filename}"`,
		'Cache-Control': 'no-store',
	});
	res.status(200).send(csv);
});

export const sendFeeReminders = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const result = await FeeReminderService.sendFeeReminders(req.body as SendFeeRemindersInput, req.user!, extractAuditContext(req));

	res.status(200).json({
		status: 'success',
		data: result,
		message: result.sent === 1 ? '1 reminder sent.' : `${result.sent} reminders sent.`,
	});
});
