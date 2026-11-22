import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as RosterService from '@/services/roster.service';
import { classIdParamSchema } from '@/schemas/class.schema';
import { rosterQuerySchema } from '@/schemas/roster.schema';

export const listRoster = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const { page: requestedPage } = rosterQuerySchema.parse(req.query);
	const { data, count, page, pageSize } = await RosterService.listRoster(classId, req.user!, requestedPage);

	// Names and who has paid: never cached by a shared proxy or the browser.
	res.set('Cache-Control', 'no-store');
	res.status(200).json({ status: 'success', data, count, page, pageSize });
});
