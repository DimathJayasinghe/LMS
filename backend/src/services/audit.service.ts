// Audit logging service — fire-and-forget writes to the AuditLog table.
// All admin/staff/marker mutations call this service from the controller layer.
// Audit writes NEVER block the HTTP response cycle.
// Also handles read queries for the audit log listing endpoint.

import { Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import type { AuditLogInput } from '@/types/audit.types';
import type { ListAuditLogsQuery } from '@/schemas/audit.schema';

// ─── Select shape for listing audit logs ─────────────────────
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

interface PaginatedAuditLogs {
	data: Prisma.AuditLogGetPayload<{ select: typeof auditLogSelect }>[];
	count: number;
}

/**
 * List audit logs with pagination and optional filters.
 * Used by the admin-facing audit log endpoint.
 */
export const listAuditLogs = async (query: ListAuditLogsQuery): Promise<PaginatedAuditLogs> => {
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

	return { data, count };
};

/**
 * Persist an audit log entry. Fire-and-forget — errors are logged but
 * never propagated to the caller.
 *
 * Why fire-and-forget? Audit logging is secondary to the primary mutation.
 * If the DB write for audit fails (e.g. transient connection issue), the
 * user's action must still succeed. Pino captures the failure for ops.
 */
export const log = (input: AuditLogInput): void => {
	const { context, action, description, targetType, targetId, metadata } = input;

	prisma.auditLog
		.create({
			data: {
				action,
				description: description ?? null,
				targetType: targetType ?? null,
				targetId: targetId ?? null,
				metadata: metadata ?? undefined,
				ip: context.ip ?? null,
				userAgent: context.userAgent ?? null,
				actorId: context.actorId,
				actorRole: context.actorRole,
			},
		})
		.then(() => {
			logger.debug(
				{ action, actorId: context.actorId, targetType, targetId },
				'Audit log created',
			);
		})
		.catch((err: unknown) => {
			logger.error(
				{ err, action, actorId: context.actorId, targetType, targetId },
				'Failed to persist audit log — non-blocking',
			);
	});
};
