import { z } from 'zod';

// ─── Classes (Courses) ──────────────────────────────────────
export const createClassSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  year: z.coerce.number().int().positive(),
  description: z.string().max(500).trim().optional(),
  monthlyFee: z.coerce.number().positive(),
  isActive: z.boolean().optional(),
  // Academic hierarchy — a course belongs to one subject and one teacher.
  subjectId: z.string().uuid(),
  // Optional: a TEACHER omits this (they own the course); a SUPER_ADMIN sets it.
  teacherId: z.string().uuid().optional(),
  // Display assets (image URLs)
  bannerUrl: z.string().url().max(1000).optional(),
  backdropUrl: z.string().url().max(1000).optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = createClassSchema.partial();

export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const classIdParamSchema = z.object({
  classId: z.string().uuid(),
});

export const listClassesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().positive().optional(),
});

export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
