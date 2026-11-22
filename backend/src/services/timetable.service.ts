import { ClassType, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { COLOMBO_UTC_OFFSET_MIN } from '@/utils/constants';
import { minutesFromMidnight, timeRangesOverlap } from '@/utils/time-range';
import type { AuthenticatedUser } from '@/types/auth.types';
import { assertCourseAccess } from '@/services/class.service';
import type {
  CreateTimetableSlotInput,
  ListUpcomingSessionsQuery,
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
  isActive: true,
  courseId: true,
  instituteId: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { name: true, year: true } },
  institute: { select: { name: true } },
} satisfies Prisma.TimetableSlotSelect;

const assertTimetableViewer = (actor: AuthenticatedUser): void => {
  if (actor.role === Role.MARKER) {
    throw new AppError('FORBIDDEN', 403, 'Markers do not have access to course timetables.');
  }
};

const slotScope = (actor: AuthenticatedUser): Prisma.TimetableSlotWhereInput => {
  assertTimetableViewer(actor);
  if (actor.role === Role.SUPER_ADMIN || actor.role === Role.ADMIN) return {};
  if (actor.role === Role.TEACHER) return { course: { teacherId: actor.userId } };
  return {
    isActive: true,
    OR: [
      {
        classType: null,
        course: { enrollments: { some: { userId: actor.userId, isActive: true } } },
      },
      {
        classType: ClassType.ONLINE,
        course: { enrollments: { some: { userId: actor.userId, isActive: true, classType: ClassType.ONLINE } } },
      },
      {
        classType: ClassType.PHYSICAL,
        course: { enrollments: { some: { userId: actor.userId, isActive: true, classType: ClassType.PHYSICAL } } },
      },
    ],
  };
};

const assertFitsWithinDay = (startTime: string, durationMinutes: number): void => {
  if (minutesFromMidnight(startTime) + durationMinutes > 24 * 60) {
    throw new AppError('INVALID_SLOT_RANGE', 400, 'A timetable slot cannot continue past midnight.');
  }
};

const assertNoConflict = async (candidate: {
  id?: string;
  courseId: string;
  teacherId: string;
  instituteId: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  isActive: boolean;
}): Promise<void> => {
  if (!candidate.isActive) return;
  const slots = await prisma.timetableSlot.findMany({
    where: {
      dayOfWeek: candidate.dayOfWeek,
      isActive: true,
      ...(candidate.id ? { id: { not: candidate.id } } : {}),
      OR: [
        { courseId: candidate.courseId },
        { course: { teacherId: candidate.teacherId } },
        ...(candidate.instituteId ? [{ instituteId: candidate.instituteId }] : []),
      ],
    },
    select: {
      startTime: true,
      durationMinutes: true,
      courseId: true,
      instituteId: true,
      course: { select: { teacherId: true } },
    },
  });
  const conflict = slots.find((slot) => {
    const overlaps = timeRangesOverlap(candidate.startTime, candidate.durationMinutes, slot.startTime, slot.durationMinutes);
    return overlaps && (
      slot.courseId === candidate.courseId ||
      slot.course.teacherId === candidate.teacherId ||
      (candidate.instituteId !== null && slot.instituteId === candidate.instituteId)
    );
  });
  if (conflict) {
    throw new AppError(
      'TIMETABLE_CONFLICT',
      409,
      'This time overlaps an active slot for the same class, teacher, or institute.',
    );
  }
};

const assertInstituteExists = async (instituteId: string): Promise<void> => {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId }, select: { id: true } });
  if (!institute) throw new AppError('INSTITUTE_NOT_FOUND', 404, 'Institute not found.');
};

export const createSlot = async (input: CreateTimetableSlotInput, actor: AuthenticatedUser) => {
  const course = await assertCourseAccess(input.courseId, actor); // course exists + teacher owns it (ADMIN/SUPER bypass)
  if (input.instituteId) await assertInstituteExists(input.instituteId);
  const durationMinutes = input.durationMinutes ?? 60;
  assertFitsWithinDay(input.startTime, durationMinutes);
  await assertNoConflict({
    courseId: input.courseId,
    teacherId: course.teacherId,
    instituteId: input.instituteId ?? null,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    durationMinutes,
    isActive: input.isActive ?? true,
  });

  return prisma.timetableSlot.create({
    data: {
      courseId: input.courseId,
      instituteId: input.instituteId ?? null,
      title: input.title ?? null,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMinutes,
      classType: input.classType ?? null,
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
    ...slotScope(actor),
  };

  return prisma.timetableSlot.findMany({
    where,
    select: slotSelect,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
};

export const getSlotById = async (id: string, actor: AuthenticatedUser) => {
  const slot = await prisma.timetableSlot.findFirst({ where: { id, ...slotScope(actor) }, select: slotSelect });
  if (!slot) throw new AppError('SLOT_NOT_FOUND', 404, 'Timetable slot not found.');
  return slot;
};

export const updateSlot = async (id: string, input: UpdateTimetableSlotInput, actor: AuthenticatedUser) => {
  const existing = await prisma.timetableSlot.findUnique({
    where: { id },
    select: {
      id: true, courseId: true, instituteId: true, dayOfWeek: true, startTime: true,
      durationMinutes: true, isActive: true,
    },
  });
  if (!existing) throw new AppError('SLOT_NOT_FOUND', 404, 'Timetable slot not found.');
  const course = await assertCourseAccess(existing.courseId, actor);
  if (input.instituteId) await assertInstituteExists(input.instituteId);
  const next = {
    id,
    courseId: existing.courseId,
    teacherId: course.teacherId,
    instituteId: input.instituteId === undefined ? existing.instituteId : input.instituteId,
    dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
    startTime: input.startTime ?? existing.startTime,
    durationMinutes: input.durationMinutes ?? existing.durationMinutes,
    isActive: input.isActive ?? existing.isActive,
  };
  assertFitsWithinDay(next.startTime, next.durationMinutes);
  await assertNoConflict(next);

  return prisma.timetableSlot.update({
    where: { id },
    data: {
      title: input.title === undefined ? undefined : input.title,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      classType: input.classType === undefined ? undefined : input.classType,
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
  // Keep the template and its generated-session links so disabling/restoring is
  // safe and repeatable. Session generation already ignores inactive slots.
  await prisma.timetableSlot.update({
    where: { id },
    data: { isActive: false },
  });
};

const sessionScope = (actor: AuthenticatedUser): Prisma.ClassSessionWhereInput => {
  assertTimetableViewer(actor);
  if (actor.role === Role.SUPER_ADMIN || actor.role === Role.ADMIN) return {};
  if (actor.role === Role.TEACHER) return { course: { teacherId: actor.userId } };
  return {
    OR: [
      {
        classType: null,
        course: { enrollments: { some: { userId: actor.userId, isActive: true } } },
      },
      {
        classType: ClassType.ONLINE,
        course: { enrollments: { some: { userId: actor.userId, isActive: true, classType: ClassType.ONLINE } } },
      },
      {
        classType: ClassType.PHYSICAL,
        course: { enrollments: { some: { userId: actor.userId, isActive: true, classType: ClassType.PHYSICAL } } },
      },
    ],
  };
};

export const listUpcomingSessions = async (query: ListUpcomingSessionsQuery, actor: AuthenticatedUser) => {
  return prisma.classSession.findMany({
    where: {
      date: { gte: query.from, lte: query.to },
      deletedAt: null,
      AND: [{ course: { isActive: true } }, sessionScope(actor)],
    },
    select: {
      id: true,
      title: true,
      date: true,
      durationMinutes: true,
      classType: true,
      courseId: true,
      zoomMeetingId: true,
      course: { select: { name: true, year: true } },
    },
    orderBy: { date: 'asc' },
  }).then((sessions) => sessions.map(({ zoomMeetingId, ...session }) => ({
    ...session,
    liveScheduled: Boolean(zoomMeetingId),
  })));
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

/** A class whose teacher is deactivated has nobody to run it, so no sessions are generated for it. */
const ACTIVE_TEACHER = { teacher: { deletedAt: null } } satisfies Prisma.CourseWhereInput;

/**
 * Materialize dated ClassSessions from every active slot for the range.
 * Idempotent: upsert on (timetableSlotId, date) and never clobbers a session
 * that was hand-edited after generation. No actor — used by the endpoint (role
 * guarded) and the weekly BullMQ job alike.
 */
export const generateSessions = async (
  from: Date,
  to: Date,
  actor?: AuthenticatedUser,
): Promise<{ created: number; skipped: number }> => {
  const slots = await prisma.timetableSlot.findMany({
    where: {
      isActive: true,
      ...(actor?.role === Role.TEACHER ? { course: { teacherId: actor.userId } } : { course: ACTIVE_TEACHER }),
    },
    select: {
      id: true,
      title: true,
      dayOfWeek: true,
      startTime: true,
      durationMinutes: true,
      classType: true,
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
          courseId: slot.courseId,
          timetableSlotId: slot.id,
        },
      });
      created += 1;
    }
  }

  return { created, skipped };
};

export const previewGeneration = async (from: Date, to: Date, actor: AuthenticatedUser) => {
  const slots = await prisma.timetableSlot.findMany({
    where: {
      isActive: true,
      ...(actor.role === Role.TEACHER ? { course: { teacherId: actor.userId } } : { course: ACTIVE_TEACHER }),
    },
    select: {
      id: true, title: true, dayOfWeek: true, startTime: true, courseId: true,
      course: { select: { name: true, year: true } },
    },
  });
  const rows = [];
  for (const slot of slots) {
    for (const date of occurrences(from, to, slot.dayOfWeek, slot.startTime)) {
      const existing = await prisma.classSession.findUnique({
        where: { timetableSlotId_date: { timetableSlotId: slot.id, date } },
        select: { id: true },
      });
      rows.push({
        timetableSlotId: slot.id,
        courseId: slot.courseId,
        course: slot.course,
        title: slot.title ?? `${slot.course.name} ${slot.course.year}`,
        date,
        status: existing ? 'EXISTS' as const : 'CREATE' as const,
      });
    }
  }
  return {
    rows,
    createCount: rows.filter((row) => row.status === 'CREATE').length,
    existingCount: rows.filter((row) => row.status === 'EXISTS').length,
  };
};
