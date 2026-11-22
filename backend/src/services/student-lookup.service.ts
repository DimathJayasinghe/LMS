import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { organizationForUser } from '@/services/settings.service';
import type { StudentLookupQuery } from '@/schemas/user.schema';
import type { AuthenticatedUser } from '@/types/auth.types';

const MAX_RESULTS = 8;

/** The little a desk needs to pick the right student. No contact details, identity numbers or account state. */
const lookupSelect = { id: true, name: true, indexNumber: true, profileImage: true } satisfies Prisma.UserSelect;

export type StudentLookupRow = Prisma.UserGetPayload<{ select: typeof lookupSelect }>;

/**
 * Finds active students of the caller's organization by name, index number or phone, for the front desk to enrol or collect for.
 * The phone is searched but never returned.
 */
export const lookupStudents = async (actor: AuthenticatedUser, { q }: StudentLookupQuery): Promise<StudentLookupRow[]> => {
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) throw new AppError('FORBIDDEN', 403, 'Only front desk and the owner can look up students.');
  const organizationId = await organizationForUser(actor.userId);

  const students: Prisma.UserWhereInput = { organizationId, role: Role.STUDENT, deletedAt: null };

  // The index number is the desk's quickest key, so its owner leads the list however many phone numbers happen to contain the same digits.
  // Nine digits is the most an Int index number can hold without overflowing the column.
  const exact = /^\d{1,9}$/.test(q)
    ? await prisma.user.findFirst({ where: { ...students, indexNumber: Number(q) }, select: lookupSelect })
    : null;

  const matches: Prisma.UserWhereInput[] = [{ name: { contains: q, mode: 'insensitive' } }];
  if (/^\+?[\d\s-]{3,}$/.test(q)) matches.push({ phone: { contains: q.replace(/[\s-]/g, '') } });

  const others = await prisma.user.findMany({
    where: { ...students, ...(exact ? { id: { not: exact.id } } : {}), OR: matches },
    select: lookupSelect,
    orderBy: [{ name: 'asc' }, { indexNumber: 'asc' }],
    take: MAX_RESULTS - (exact ? 1 : 0),
  });
  return exact ? [exact, ...others] : others;
};
