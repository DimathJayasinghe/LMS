import { z } from 'zod';

// ─── Institutes (pre-configured physical centers) ──────────
export const createInstituteSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  code: z.string().min(2).max(20).trim(),
  city: z.string().max(120).trim().optional(),
  isActive: z.boolean().optional(),
});

export type CreateInstituteInput = z.infer<typeof createInstituteSchema>;

export const updateInstituteSchema = createInstituteSchema.partial();

export type UpdateInstituteInput = z.infer<typeof updateInstituteSchema>;

export const instituteIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listInstitutesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
});

export type ListInstitutesQuery = z.infer<typeof listInstitutesQuerySchema>;
