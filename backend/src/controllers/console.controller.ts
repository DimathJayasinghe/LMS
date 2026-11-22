import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as ConsoleService from '@/services/console.service';
import { consoleCashQuerySchema, consoleOwingQuerySchema } from '@/schemas/console.schema';

// Collector names and takings: never cached by a shared proxy or the browser.
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
