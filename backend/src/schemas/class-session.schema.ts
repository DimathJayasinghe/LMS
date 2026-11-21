import { ClassType } from '@prisma/client';
import { z } from 'zod';

// ─── Class Sessions (Lessons) ───────────────────────────────
export const createClassSessionSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  description: z.string().max(1000).trim().optional(),
  classType: z.nativeEnum(ClassType).nullable().optional(),
  date: z.coerce.date(),
  durationMinutes: z.coerce.number().int().positive().optional(),
});

export type CreateClassSessionInput = z.infer<typeof createClassSessionSchema>;

export const updateClassSessionSchema = createClassSessionSchema.partial();

export type UpdateClassSessionInput = z.infer<typeof updateClassSessionSchema>;

export const classSessionParamsSchema = z.object({
  classId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const listClassSessionsQuerySchema = z.object({
  classType: z.nativeEnum(ClassType).optional(),
});

export type ListClassSessionsQuery = z.infer<typeof listClassSessionsQuerySchema>;
