// Extracts audit context (actor identity, IP, user-agent) from an Express request.
// Used by controllers to build the AuditContext without leaking req into the service layer.

import type { Request } from 'express';
import type { AuditContext } from '@/types/audit.types';

/**
 * Build an AuditContext from the current request.
 * Requires verifyToken middleware to have run (req.user must exist).
 */
export const extractAuditContext = (req: Request): AuditContext => ({
	actorId: req.user!.userId,
	actorRole: req.user!.role,
	ip: req.ip ?? req.socket.remoteAddress,
	userAgent: req.get('user-agent'),
});
