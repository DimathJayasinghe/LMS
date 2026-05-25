import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as AuditService from '@/services/audit.service';
import { listAuditLogsQuerySchema } from '@/schemas/audit.schema';

export const listAuditLogs = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const query = listAuditLogsQuerySchema.parse(req.query);
		const { data, count } = await AuditService.listAuditLogs(query);

		res.status(200).json({
			status: 'success',
			data,
			count,
			page: query.page,
			limit: query.limit,
		});
	},
);
