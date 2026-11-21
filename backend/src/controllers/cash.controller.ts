import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as CashListService from '@/services/cash-list.service';
import * as CashTallyService from '@/services/cash-tally.service';
import { cashQuerySchema, cashTallyQuerySchema, type CloseCashDayInput } from '@/schemas/cash.schema';

// Collector names and takings: never cached by a shared proxy or the browser.
const noStore = (res: Response): void => {
	res.set('Cache-Control', 'no-store');
};

export const listCash = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { from, to, data, count } = await CashListService.listCashDays(req.user!, cashQuerySchema.parse(req.query));

	noStore(res);
	res.status(200).json({ status: 'success', data, count, from, to });
});

export const listCashTallies = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { from, to, data, count } = await CashListService.listCashTallies(req.user!, cashTallyQuerySchema.parse(req.query));

	noStore(res);
	res.status(200).json({ status: 'success', data, count, from, to });
});

export const closeCashDay = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await CashTallyService.closeCashDay(req.user!, req.body as CloseCashDayInput, extractAuditContext(req));

	noStore(res);
	res.status(200).json({ status: 'success', data, message: 'Cash counted.' });
});

export const reconcileCashTally = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await CashTallyService.reconcileCashTally(req.user!, String(req.params.id), extractAuditContext(req));

	noStore(res);
	res.status(200).json({ status: 'success', data, message: data.alreadyReconciled ? 'Already reconciled.' : 'Day reconciled.' });
});
