import { z } from 'zod';

// ─── Subjects (top of the academic hierarchy) ──────────────
export const createSubjectSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  description: z.string().max(500).trim().optional(),
  isActive: z.boolean().optional(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = createSubjectSchema.partial();

export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const subjectIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listSubjectsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
});

export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;
