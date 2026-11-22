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
 * The phone is searched but never returned, so the desk can match a parent's number to a child without seeing contact data
 * for everyone. Replaces the full-profile `GET /users` search that the desk used for this.
 */
export const lookupStudents = async (actor: AuthenticatedUser, { q }: StudentLookupQuery): Promise<StudentLookupRow[]> => {
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) throw new AppError('FORBIDDEN', 403, 'Only front desk and the owner can look up students.');
  const organizationId = await organizationForUser(actor.userId);

  const matches: Prisma.UserWhereInput[] = [{ name: { contains: q, mode: 'insensitive' } }];
  // Nine digits is the most an Int index number can hold without overflowing the column.
  if (/^\d{1,9}$/.test(q)) matches.push({ indexNumber: Number(q) });
  if (/^\+?[\d\s-]{3,}$/.test(q)) matches.push({ phone: { contains: q.replace(/[\s-]/g, '') } });

  return prisma.user.findMany({
    where: { organizationId, role: Role.STUDENT, deletedAt: null, OR: matches },
    select: lookupSelect,
    orderBy: [{ name: 'asc' }, { indexNumber: 'asc' }],
    take: MAX_RESULTS,
  });
};
