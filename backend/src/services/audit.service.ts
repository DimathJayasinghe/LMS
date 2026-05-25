// Audit logging service — fire-and-forget writes to the AuditLog table.
// All admin/staff/marker mutations call this service from the controller layer.
// Audit writes NEVER block the HTTP response cycle.

import { Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import type { AuditLogInput } from '@/types/audit.types';

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

	// Determine if the actor is an admin/staff role for the legacy adminId field
	const isAdminRole =
		context.actorRole === Role.ADMIN || context.actorRole === Role.STAFF;

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
				adminId: isAdminRole ? context.actorId : null,
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
