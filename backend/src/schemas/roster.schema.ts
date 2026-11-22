import { z } from 'zod';

// ─── Class roster (owning teacher, front desk, owner) ──────
// The page size is the organization's `roster.pageSize` setting, so the caller only picks the page.
export const rosterQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
});

export type RosterQueryInput = z.infer<typeof rosterQuerySchema>;
