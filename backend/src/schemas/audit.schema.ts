import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(20),
	action: z.string().optional(),
	actorId: z.string().uuid().optional(),
	targetType: z.string().optional(),
	targetId: z.string().uuid().optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
