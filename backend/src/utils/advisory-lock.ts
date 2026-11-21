import { Prisma } from '@prisma/client';

/**
 * Takes a Postgres advisory lock held until the surrounding transaction ends, so
 * concurrent writers of the same logical value run one after another and the second
 * sees the first's committed row.
 *
 * The key is `namespace:organizationId:key`. The namespace keeps it from colliding with
 * the older per-id locks (`hashtextextended(<id>, 0)` in the exam and marker services)
 * and the organization id is ready for M2 tenant context.
 */
export const withAdvisoryLock = async (
  tx: Prisma.TransactionClient,
  namespace: string,
  organizationId: string,
  key: string,
): Promise<void> => {
  const lockKey = `${namespace}:${organizationId}:${key}`;
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
};
