import { Router } from 'express';
import { Role } from '@prisma/client';
import * as AuditController from '@/controllers/audit.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateQuery } from '@/middleware/validate.middleware';
import { listAuditLogsQuerySchema } from '@/schemas/audit.schema';

export const auditRoutes = Router();

// GET /api/audit-logs — List audit logs (Admin only)
auditRoutes.get(
	'/',
	verifyToken,
	requireRole(Role.ADMIN),
	validateQuery(listAuditLogsQuerySchema),
	AuditController.listAuditLogs,
);
