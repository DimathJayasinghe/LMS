import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as ConsoleService from '@/services/console.service';
import { getMarkingPanel } from '@/services/console-marking.service';
import { getAttendancePanel } from '@/services/console-attendance.service';
import { getSetupPanel } from '@/services/console-setup.service';
import { getSmsPanel } from '@/services/console-sms.service';
import { consoleCashQuerySchema, consoleOwingQuerySchema } from '@/schemas/console.schema';

// Collector names, takings, student counts and masked numbers: never cached by a shared proxy or the browser.
const noStore = (res: Response): void => {
	res.set('Cache-Control', 'no-store');
};

export const cashPanel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await ConsoleService.getCashPanel(req.user!, consoleCashQuerySchema.parse(req.query));

	noStore(res);
	res.status(200).json({ status: 'success', data });
});

export const owingPanel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await ConsoleService.getOwingPanel(req.user!, consoleOwingQuerySchema.parse(req.query));

	noStore(res);
	res.status(200).json({ status: 'success', data });
});

export const markingPanel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await getMarkingPanel(req.user!);

	noStore(res);
	res.status(200).json({ status: 'success', data });
});

export const attendanceTodayPanel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await getAttendancePanel(req.user!);

	noStore(res);
	res.status(200).json({ status: 'success', data });
});

export const setupPanel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await getSetupPanel(req.user!);

	noStore(res);
	res.status(200).json({ status: 'success', data });
});

export const smsPanel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await getSmsPanel(req.user!);

	noStore(res);
	res.status(200).json({ status: 'success', data });
});
