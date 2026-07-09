import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import type {
  CreateInstituteInput,
  ListInstitutesQuery,
  UpdateInstituteInput,
} from '@/schemas/institute.schema';

interface InstituteSummary {
  id: string;
  name: string;
  code: string;
  city: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const instituteSelect = {
  id: true,
  name: true,
  code: true,
  city: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InstituteSelect;

/** Rejects if another institute already uses the given name or code. */
const assertNameCodeFree = async (
  name: string | undefined,
  code: string | undefined,
  excludeId?: string,
): Promise<void> => {
  if (!name && !code) return;
  const clash = await prisma.institute.findFirst({
    where: {
      OR: [...(name ? [{ name }] : []), ...(code ? [{ code }] : [])],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('INSTITUTE_ALREADY_EXISTS', 409, 'An institute with this name or code already exists.');
  }
};

export const createInstitute = async (input: CreateInstituteInput): Promise<InstituteSummary> => {
  await assertNameCodeFree(input.name, input.code);

  return prisma.institute.create({
    data: {
      name: input.name,
      code: input.code,
      city: input.city ?? null,
      isActive: input.isActive ?? true,
    },
    select: instituteSelect,
  });
};

export const listInstitutes = async (
  query: ListInstitutesQuery,
  actor: AuthenticatedUser,
): Promise<InstituteSummary[]> => {
  const where: Prisma.InstituteWhereInput = {
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    // Students/staff only pick from active institutes; the owner sees all.
    ...(actor.role === Role.SUPER_ADMIN ? {} : { isActive: true }),
  };

  return prisma.institute.findMany({ where, select: instituteSelect, orderBy: { name: 'asc' } });
};

export const getInstituteById = async (
  id: string,
  actor: AuthenticatedUser,
): Promise<InstituteSummary> => {
  const institute = await prisma.institute.findFirst({
    where: {
      id,
      ...(actor.role === Role.SUPER_ADMIN ? {} : { isActive: true }),
    },
    select: instituteSelect,
  });

  if (!institute) {
    throw new AppError('INSTITUTE_NOT_FOUND', 404, 'Institute not found.');
  }

  return institute;
};

export const updateInstitute = async (
  id: string,
  input: UpdateInstituteInput,
): Promise<InstituteSummary> => {
  const existing = await prisma.institute.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('INSTITUTE_NOT_FOUND', 404, 'Institute not found.');
  }

  await assertNameCodeFree(
    input.name && input.name !== existing.name ? input.name : undefined,
    input.code && input.code !== existing.code ? input.code : undefined,
    id,
  );

  return prisma.institute.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      city: input.city ?? undefined,
      isActive: input.isActive,
    },
    select: instituteSelect,
  });
};
