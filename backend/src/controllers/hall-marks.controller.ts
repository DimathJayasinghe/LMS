import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as HallMarksService from '@/services/hall-marks.service';
import { examIdParamSchema } from '@/schemas/exam.schema';
import { hallMarksSchema } from '@/schemas/hall-marks.schema';

export const enterHallMarks = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = examIdParamSchema.parse(req.params);
	const input = hallMarksSchema.parse(req.body);
	const result = await HallMarksService.enterHallMarks(id, input, req.user!, extractAuditContext(req));

	// The response lists students by index number (and by name for staff); keep it out of shared caches.
	res.set('Cache-Control', 'no-store');

	if (!input.dryRun && !result.applied) {
		res.status(409).json({
			status: 'error',
			code: 'HALL_MARKS_REJECTED',
			message: 'Nothing was saved. Fix the rows marked in the list and try again.',
			data: result,
		});
		return;
	}

	res.status(200).json({
		status: 'success',
		data: result,
		message: input.dryRun ? 'Checked. Nothing was saved yet.' : 'Hall marks saved.',
	});
});
