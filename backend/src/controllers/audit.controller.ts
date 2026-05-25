import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { asyncHandler } from '@/utils/async-handler';
import { prisma } from '@/config/database';
import { listAuditLogsQuerySchema } from '@/schemas/audit.schema';

const auditLogSelect = {
	id: true,
	action: true,
	description: true,
	targetType: true,
	targetId: true,
	metadata: true,
	ip: true,
	userAgent: true,
	actorId: true,
	actorRole: true,
	createdAt: true,
	actor: {
		select: { id: true, name: true, email: true, role: true },
	},
} satisfies Prisma.AuditLogSelect;

export const listAuditLogs = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const query = listAuditLogsQuerySchema.parse(req.query);
		const skip = (query.page - 1) * query.limit;

		const where: Prisma.AuditLogWhereInput = {
			...(query.action ? { action: query.action } : {}),
			...(query.actorId ? { actorId: query.actorId } : {}),
			...(query.targetType ? { targetType: query.targetType } : {}),
			...(query.targetId ? { targetId: query.targetId } : {}),
			...(query.from || query.to
				? {
						createdAt: {
							...(query.from ? { gte: query.from } : {}),
							...(query.to ? { lte: query.to } : {}),
						},
					}
				: {}),
		};

		const [data, count] = await Promise.all([
			prisma.auditLog.findMany({
				where,
				select: auditLogSelect,
				orderBy: { createdAt: 'desc' },
				skip,
				take: query.limit,
			}),
			prisma.auditLog.count({ where }),
		]);

		res.status(200).json({
			status: 'success',
			data,
			count,
			page: query.page,
			limit: query.limit,
		});
	},
);
