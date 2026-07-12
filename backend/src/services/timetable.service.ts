import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { COLOMBO_UTC_OFFSET_MIN } from '@/utils/constants';
import type { AuthenticatedUser } from '@/types/auth.types';
import { assertCourseAccess } from '@/services/class.service';
import type {
  CreateTimetableSlotInput,
  ListTimetableQuery,
  PublicUpcomingQuery,
  UpdateTimetableSlotInput,
} from '@/schemas/timetable.schema';

const slotSelect = {
  id: true,
  title: true,
  dayOfWeek: true,
  startTime: true,
  durationMinutes: true,
  classType: true,
  zoomLink: true,
  isActive: true,
  courseId: true,
  instituteId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TimetableSlotSelect;

const assertInstituteExists = async (instituteId: string): Promise<void> => {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId }, select: { id: true } });
  if (!institute) throw new AppError('INSTITUTE_NOT_FOUND', 404, 'Institute not found.');
};

export const createSlot = async (input: CreateTimetableSlotInput, actor: AuthenticatedUser) => {
  await assertCourseAccess(input.courseId, actor); // course exists + teacher owns it (ADMIN/SUPER bypass)
  if (input.instituteId) await assertInstituteExists(input.instituteId);

  return prisma.timetableSlot.create({
    data: {
      courseId: input.courseId,
      instituteId: input.instituteId ?? null,
      title: input.title ?? null,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes ?? 60,
      classType: input.classType ?? null,
      zoomLink: input.zoomLink ?? null,
      isActive: input.isActive ?? true,
    },
    select: slotSelect,
  });
};

export const listSlots = async (query: ListTimetableQuery, actor: AuthenticatedUser) => {
  const where: Prisma.TimetableSlotWhereInput = {
    ...(query.courseId ? { courseId: query.courseId } : {}),
    ...(query.instituteId ? { instituteId: query.instituteId } : {}),
    ...(query.dayOfWeek !== undefined ? { dayOfWeek: query.dayOfWeek } : {}),
    ...(actor.role === Role.SUPER_ADMIN ? {} : { isActive: true }),
  };

  return prisma.timetableSlot.findMany({
    where,
    select: slotSelect,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
};

export const getSlotById = async (id: string) => {
  const slot = await prisma.timetableSlot.findUnique({ where: { id }, select: slotSelect });
  if (!slot) throw new AppError('SLOT_NOT_FOUND', 404, 'Timetable slot not found.');
  return slot;
};

export const updateSlot = async (id: string, input: UpdateTimetableSlotInput, actor: AuthenticatedUser) => {
  const existing = await prisma.timetableSlot.findUnique({ where: { id }, select: { id: true, courseId: true } });
  if (!existing) throw new AppError('SLOT_NOT_FOUND', 404, 'Timetable slot not found.');
  await assertCourseAccess(existing.courseId, actor);
  if (input.instituteId) await assertInstituteExists(input.instituteId);

  return prisma.timetableSlot.update({
    where: { id },
    data: {
      title: input.title ?? undefined,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      classType: input.classType === undefined ? undefined : input.classType,
      zoomLink: input.zoomLink === undefined ? undefined : input.zoomLink,
      isActive: input.isActive,
      instituteId: input.instituteId === undefined ? undefined : input.instituteId,
    },
    select: slotSelect,
  });
};

export const deleteSlot = async (id: string, actor: AuthenticatedUser): Promise<void> => {
  const existing = await prisma.timetableSlot.findUnique({ where: { id }, select: { id: true, courseId: true } });
  if (!existing) throw new AppError('SLOT_NOT_FOUND', 404, 'Timetable slot not found.');
  await assertCourseAccess(existing.courseId, actor);
  // Generated sessions keep (onDelete: SetNull nulls their timetableSlotId).
  await prisma.timetableSlot.delete({ where: { id } });
};

// ─── Public upcoming timetable (marketing page, unauthenticated) ───────
// Deliberately its own query, not a reuse of `listSlots`/`slotSelect`:
// callers here have no session and no enrollment, so the select list must
// never include zoomLink/zoomMeetingId/zoomPassword — those are the actual
// join credentials for a live class and gating them behind
// enrolled+paid is a hard invariant (see CLAUDE.md "Content protection").
export const listPublicUpcoming = async (query: PublicUpcomingQuery) => {
  const now = new Date();
  const to = new Date(now.getTime() + (query.days ?? 14) * 24 * 60 * 60 * 1000);

  return prisma.classSession.findMany({
    where: {
      date: { gte: now, lte: to },
      deletedAt: null,
      course: { isActive: true },
    },
    select: {
      id: true,
      title: true,
      date: true,
      durationMinutes: true,
      classType: true,
      course: { select: { name: true, subject: { select: { name: true } } } },
    },
    orderBy: { date: 'asc' },
    take: query.limit ?? 20,
  });
};

// ─── Session generation from slots ─────────────────────────

/** Colombo-local weekday (0-6) of a UTC instant. */
const colomboWeekday = (utcMillis: number): number =>
  new Date(utcMillis + COLOMBO_UTC_OFFSET_MIN * 60_000).getUTCDay();

/** All UTC datetimes in [from,to] that fall on `dayOfWeek` at `startTime` (Colombo local). */
const occurrences = (from: Date, to: Date, dayOfWeek: number, startTime: string): Date[] => {
  const [hh, mm] = startTime.split(':').map(Number) as [number, number];
  const result: Date[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= to) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const d = cursor.getUTCDate();
    // Colombo wall-clock hh:mm on this calendar day → UTC instant.
    const utcMillis = Date.UTC(y, m, d, hh, mm) - COLOMBO_UTC_OFFSET_MIN * 60_000;
    if (colomboWeekday(utcMillis) === dayOfWeek) {
      const when = new Date(utcMillis);
      if (when >= from && when <= to) result.push(when);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
};

/**
 * Materialize dated ClassSessions from every active slot for the range.
 * Idempotent: upsert on (timetableSlotId, date) and never clobbers a session
 * that was hand-edited after generation. No actor — used by the endpoint (role
 * guarded) and the weekly BullMQ job alike.
 */
export const generateSessions = async (
  from: Date,
  to: Date,
): Promise<{ created: number; skipped: number }> => {
  const slots = await prisma.timetableSlot.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      dayOfWeek: true,
      startTime: true,
      durationMinutes: true,
      classType: true,
      zoomLink: true,
      courseId: true,
      course: { select: { name: true, year: true } },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const slot of slots) {
    const title = slot.title ?? `${slot.course.name} ${slot.course.year}`;
    for (const date of occurrences(from, to, slot.dayOfWeek, slot.startTime)) {
      const existing = await prisma.classSession.findUnique({
        where: { timetableSlotId_date: { timetableSlotId: slot.id, date } },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await prisma.classSession.create({
        data: {
          title,
          classType: slot.classType,
          date,
          durationMinutes: slot.durationMinutes,
          zoomLink: slot.zoomLink,
          courseId: slot.courseId,
          timetableSlotId: slot.id,
        },
      });
      created += 1;
    }
  }

  return { created, skipped };
};
