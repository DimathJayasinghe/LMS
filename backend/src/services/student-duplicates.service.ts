import { Prisma, Role } from '@prisma/client';
import { namesSimilar } from '@/utils/person-name';
import { mobileVariants } from '@/utils/sri-lanka-mobile';

export interface PossibleDuplicate {
  id: string;
  name: string;
  indexNumber: number;
}

const MAX_WARNINGS = 5;
const CANDIDATE_LIMIT = 50;

/**
 * Students of this organization who share a mobile number (their own or a guardian's) with the person being registered
 * and have a similar name. Siblings share a number and have different names, so they are not flagged. A warning for the
 * clerk to weigh, never a block and never a merge.
 */
export const findPossibleDuplicates = async (
  db: Pick<Prisma.TransactionClient, 'user'>,
  organizationId: string,
  person: { name: string; numbers: (string | undefined)[] },
): Promise<PossibleDuplicate[]> => {
  const variants = person.numbers.flatMap((number) => (number ? mobileVariants(number) : []));
  if (variants.length === 0) return [];

  const candidates = await db.user.findMany({
    where: { organizationId, role: Role.STUDENT, OR: [{ phone: { in: variants } }, { guardianMobile: { in: variants } }] },
    select: { id: true, name: true, indexNumber: true },
    orderBy: { indexNumber: 'asc' },
    take: CANDIDATE_LIMIT,
  });

  return candidates.filter((candidate) => namesSimilar(candidate.name, person.name)).slice(0, MAX_WARNINGS);
};
