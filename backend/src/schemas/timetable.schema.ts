import { ClassType } from '@prisma/client';
import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const fitsWithinDay = (value: { startTime: string; durationMinutes?: number }): boolean => {
  if (!HHMM.test(value.startTime)) return true;
  const [hours, minutes] = value.startTime.split(':').map(Number) as [number, number];
  return hours * 60 + minutes + (value.durationMinutes ?? 60) <= 24 * 60;
};

// ─── Timetable Slots (recurring weekly template) ───────────
export const createTimetableSlotSchema = z.object({
  courseId: z.string().uuid(),
  instituteId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).trim().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6), // 0=Sunday .. 6=Saturday
  startTime: z.string().regex(HHMM, 'startTime must be HH:mm (24h).'),
  durationMinutes: z.coerce.number().int().positive().max(600).optional(),
  classType: z.nativeEnum(ClassType).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(fitsWithinDay, {
  message: 'A timetable slot cannot continue past midnight.',
  path: ['durationMinutes'],
});

export type CreateTimetableSlotInput = z.infer<typeof createTimetableSlotSchema>;

export const updateTimetableSlotSchema = z.object({
  instituteId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).trim().nullable().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(HHMM, 'startTime must be HH:mm (24h).').optional(),
  durationMinutes: z.coerce.number().int().positive().max(600).optional(),
  classType: z.nativeEnum(ClassType).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateTimetableSlotInput = z.infer<typeof updateTimetableSlotSchema>;

export const timetableSlotIdParamSchema = z.object({ id: z.string().uuid() });

export const listTimetableQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  instituteId: z.string().uuid().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
});

export type ListTimetableQuery = z.infer<typeof listTimetableQuerySchema>;

// ─── Public upcoming timetable (marketing page, unauthenticated) ─────────
export const publicUpcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type PublicUpcomingQuery = z.infer<typeof publicUpcomingQuerySchema>;

// ─── Manual session generation ─────────────────────────────
export const generateSessionsSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => v.to >= v.from, { message: '`to` must be on or after `from`.' })
  .refine((v) => v.to.getTime() - v.from.getTime() <= 90 * 24 * 60 * 60 * 1000, {
    message: 'The generation range cannot exceed 90 days.',
  });

export type GenerateSessionsInput = z.infer<typeof generateSessionsSchema>;

export const listUpcomingSessionsQuerySchema = generateSessionsSchema;
export type ListUpcomingSessionsQuery = z.infer<typeof listUpcomingSessionsQuerySchema>;
