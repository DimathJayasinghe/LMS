import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import type {
  CreateSubjectInput,
  ListSubjectsQuery,
  UpdateSubjectInput,
} from '@/schemas/subject.schema';

interface SubjectSummary {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const subjectSelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubjectSelect;

export const createSubject = async (input: CreateSubjectInput): Promise<SubjectSummary> => {
  const existing = await prisma.subject.findUnique({ where: { name: input.name } });
  if (existing) {
    throw new AppError('SUBJECT_ALREADY_EXISTS', 409, 'A subject with this name already exists.');
  }

  return prisma.subject.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
    },
    select: subjectSelect,
  });
};

export const listSubjects = async (
  query: ListSubjectsQuery,
  actor: AuthenticatedUser,
): Promise<SubjectSummary[]> => {
  const where: Prisma.SubjectWhereInput = {
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    // Only the owner sees inactive subjects; everyone else sees active only.
    ...(actor.role === Role.SUPER_ADMIN ? {} : { isActive: true }),
  };

  return prisma.subject.findMany({ where, select: subjectSelect, orderBy: { name: 'asc' } });
};

export const getSubjectById = async (
  id: string,
  actor: AuthenticatedUser,
): Promise<SubjectSummary> => {
  const subject = await prisma.subject.findFirst({
    where: {
      id,
      ...(actor.role === Role.SUPER_ADMIN ? {} : { isActive: true }),
    },
    select: subjectSelect,
  });

  if (!subject) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found.');
  }

  return subject;
};

export const updateSubject = async (
  id: string,
  input: UpdateSubjectInput,
): Promise<SubjectSummary> => {
  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found.');
  }

  if (input.name && input.name !== existing.name) {
    const duplicate = await prisma.subject.findUnique({ where: { name: input.name } });
    if (duplicate) {
      throw new AppError('SUBJECT_ALREADY_EXISTS', 409, 'A subject with this name already exists.');
    }
  }

  return prisma.subject.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description ?? undefined,
      isActive: input.isActive,
    },
    select: subjectSelect,
  });
};
