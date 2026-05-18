import { ClassType, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type {
  CreateClassSessionInput,
  ListClassSessionsQuery,
  UpdateClassSessionInput,
} from '@/schemas/class-session.schema';

interface ClassSessionSummary {
  id: string;
  title: string;
  description: string | null;
  classType: ClassType | null;
  date: Date;
  durationMinutes: number;
  zoomLink: string | null;
  zoomMeetingId: string | null;
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
  zoomLink: true,
  zoomMeetingId: true,
  courseId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClassSessionSelect;

const ensureClassExists = async (classId: string): Promise<void> => {
  const course = await prisma.course.findUnique({ where: { id: classId } });
  if (!course) {
    throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
  }
};

export const createClassSession = async (
  classId: string,
  input: CreateClassSessionInput,
): Promise<ClassSessionSummary> => {
  await ensureClassExists(classId);

  return prisma.classSession.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      classType: input.classType ?? null,
      date: input.date,
      durationMinutes: input.durationMinutes,
      zoomLink: input.zoomLink ?? null,
      zoomMeetingId: input.zoomMeetingId ?? null,
      courseId: classId,
    },
    select: classSessionSelect,
  });
};

export const listClassSessions = async (
  classId: string,
  query: ListClassSessionsQuery,
  role: Role,
): Promise<ClassSessionSummary[]> => {
  await ensureClassExists(classId);

  const where: Prisma.ClassSessionWhereInput = {
    courseId: classId,
    ...(query.classType ? { classType: query.classType } : {}),
    ...(role === Role.ADMIN ? {} : { deletedAt: null }),
  };

  return prisma.classSession.findMany({
    where,
    select: classSessionSelect,
    orderBy: { date: 'asc' },
  });
};

export const getClassSessionById = async (
  classId: string,
  sessionId: string,
  role: Role,
): Promise<ClassSessionSummary> => {
  await ensureClassExists(classId);

  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: classSessionSelect,
  });

  if (!session || session.courseId !== classId || (session.deletedAt && role !== Role.ADMIN)) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found.');
  }

  return session;
};

export const updateClassSession = async (
  classId: string,
  sessionId: string,
  input: UpdateClassSessionInput,
): Promise<ClassSessionSummary> => {
  await ensureClassExists(classId);

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });

  if (!session || session.courseId !== classId) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found.');
  }

  return prisma.classSession.update({
    where: { id: sessionId },
    data: {
      title: input.title,
      description: input.description ?? undefined,
      classType: input.classType === undefined ? undefined : input.classType,
      date: input.date,
      durationMinutes: input.durationMinutes,
      zoomLink: input.zoomLink ?? undefined,
      zoomMeetingId: input.zoomMeetingId ?? undefined,
    },
    select: classSessionSelect,
  });
};

export const deleteClassSession = async (
  classId: string,
  sessionId: string,
): Promise<ClassSessionSummary> => {
  await ensureClassExists(classId);

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });

  if (!session || session.courseId !== classId) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found.');
  }

  if (session.deletedAt) {
    return prisma.classSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: classSessionSelect,
    });
  }

  return prisma.classSession.update({
    where: { id: sessionId },
    data: { deletedAt: new Date() },
    select: classSessionSelect,
  });
};
