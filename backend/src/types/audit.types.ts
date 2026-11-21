import type { Prisma } from '@prisma/client';

/** Context passed to the audit service from the controller layer */
export interface AuditContext {
	actorId: string;
	actorRole: string;
	ip?: string;
	userAgent?: string;
}

/** Input for creating a single audit log entry */
export interface AuditLogInput {
	action: string;
	description?: string;
	targetType?: string;
	targetId?: string;
	metadata?: Prisma.InputJsonValue;
	/** Tenant owner of the row; omitted rows take the column default. */
	organizationId?: string;
	context: AuditContext;
}
