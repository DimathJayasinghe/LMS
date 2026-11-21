import { ClassType, Prisma, Role, VideoStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import type {
  CreateClassSessionInput,
  ListClassSessionsQuery,
  UpdateClassSessionInput,
} from '@/schemas/class-session.schema';
import { assertCourseAccess } from '@/services/class.service';
import { assertStudentContentAccess } from '@/services/access.service';
import * as StreamService from '@/services/stream.service';

interface ClassSessionSummary {
  id: string;
  title: string;
  description: string | null;
  classType: ClassType | null;
  date: Date;
  durationMinutes: number;
  zoomMeetingId: string | null;
  liveScheduled: boolean;
  hasRecording: boolean;
  courseId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const classSessionSelect = {
  id: true,
  title: true,
  description: true,
  classType: true,
  date: true,
  durationMinutes: true,
  zoomMeetingId: true,
  courseId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  // Only a boolean leaves the service: staff who cannot open recordings still see
  // whether one exists without learning anything about it.
  _count: { select: { videoRecordings: { where: { status: VideoStatus.READY } } } },
} satisfies Prisma.ClassSessionSelect;

type ClassSessionRow = Prisma.ClassSessionGetPayload<{ select: typeof classSessionSelect }>;

const presentSession = (
  { _count, ...session }: ClassSessionRow,
  actor: AuthenticatedUser,
): ClassSessionSummary => ({
  ...session,
  liveScheduled: Boolean(session.zoomMeetingId),
  hasRecording: _count.videoRecordings > 0,
  // Operational staff need the provider meeting number for attendance reconciliation.
  // Students only need the boolean state; the token endpoint supplies credentials after
  // its enrolled + paid check. Markers are denied session reads below.
  zoomMeetingId: actor.role === Role.STUDENT ? null : session.zoomMeetingId,
});

const assertSessionViewer = (actor: AuthenticatedUser): void => {
  if (actor.role === Role.MARKER) {
    throw new AppError('FORBIDDEN', 403, 'Markers can access only their assigned exam work.');
  }
};

const ensureClassExists = async (classId: string): Promise<void> => {
  const course = await prisma.course.findUnique({ where: { id: classId } });
  if (!course) {
    throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
  }
};

export const createClassSession = async (
  classId: string,
  input: CreateClassSessionInput,
  actor: AuthenticatedUser,
): Promise<ClassSessionSummary> => {
  await assertCourseAccess(classId, actor);

  const session = await prisma.classSession.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      classType: input.classType ?? null,
      date: input.date,
      durationMinutes: input.durationMinutes,
      courseId: classId,
    },
    select: classSessionSelect,
  });

  await StreamService.broadcastTimetableUpdated({
    courseId: classId,
    sessionId: session.id,
    action: 'created',
  });

  return presentSession(session, actor);
};

export const listClassSessions = async (
  classId: string,
  query: ListClassSessionsQuery,
  actor: AuthenticatedUser,
): Promise<ClassSessionSummary[]> => {
  const role = actor.role;
  assertSessionViewer(actor);
  await ensureClassExists(classId);
  // Students may only see the schedule of courses they are enrolled in.
  await assertStudentContentAccess(actor, classId, { requirePaid: false });

  // Teachers may only see the schedule of courses they teach.
  await assertCourseAccess(classId, actor);

  const where: Prisma.ClassSessionWhereInput = {
    courseId: classId,
    ...(query.classType ? { classType: query.classType } : {}),
    ...(role === Role.SUPER_ADMIN ? {} : { deletedAt: null }),
  };

  const sessions = await prisma.classSession.findMany({
    where,
    select: classSessionSelect,
    orderBy: { date: 'asc' },
  });
  return sessions.map((session) => presentSession(session, actor));
};

export const getClassSessionById = async (
  classId: string,
  sessionId: string,
  actor: AuthenticatedUser,
): Promise<ClassSessionSummary> => {
  const role = actor.role;
  assertSessionViewer(actor);
  await ensureClassExists(classId);
  await assertStudentContentAccess(actor, classId, { requirePaid: false });

  // Teachers may only see the schedule of courses they teach.
  await assertCourseAccess(classId, actor);

  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: classSessionSelect,
  });

  if (!session || session.courseId !== classId || (session.deletedAt && role !== Role.SUPER_ADMIN)) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found.');
  }

  return presentSession(session, actor);
};

export const updateClassSession = async (
  classId: string,
  sessionId: string,
  input: UpdateClassSessionInput,
  actor: AuthenticatedUser,
): Promise<ClassSessionSummary> => {
  await assertCourseAccess(classId, actor);

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });

  if (!session || session.courseId !== classId) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found.');
  }

  const updated = await prisma.classSession.update({
    where: { id: sessionId },
    data: {
      title: input.title,
      description: input.description ?? undefined,
      classType: input.classType === undefined ? undefined : input.classType,
      date: input.date,
      durationMinutes: input.durationMinutes,
    },
    select: classSessionSelect,
  });

  await StreamService.broadcastTimetableUpdated({
    courseId: classId,
    sessionId,
    action: 'updated',
  });

  return presentSession(updated, actor);
};

export const deleteClassSession = async (
  classId: string,
  sessionId: string,
  actor: AuthenticatedUser,
): Promise<ClassSessionSummary> => {
  await assertCourseAccess(classId, actor);

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });

  if (!session || session.courseId !== classId) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found.');
  }

  if (session.deletedAt) {
    const existing = await prisma.classSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: classSessionSelect,
    });
    return presentSession(existing, actor);
  }

  const deleted = await prisma.classSession.update({
    where: { id: sessionId },
    data: { deletedAt: new Date() },
    select: classSessionSelect,
  });

  await StreamService.broadcastTimetableUpdated({
    courseId: classId,
    sessionId,
    action: 'deleted',
  });

  return presentSession(deleted, actor);
};
