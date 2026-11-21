import { Prisma, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { dayRangeInTz } from '@/utils/org-time';
import type { CashDay } from '@/utils/cash-rows';

// The "cash" of D-OPS-1 is the money the desk took (method ENTRANCE). A refund does not un-collect it, so REFUNDED counts too.
const COUNTED_STATUSES = [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED];

interface Scope {
  organizationId: string;
  timezone: string;
}

/**
 * Cash by (Colombo day, collector, branch) over `from`..`to` inclusive, newest day first. `collectedAt` is a timestamp without
 * a zone that Prisma fills in UTC, so it is read as UTC first and only then moved into the organization's zone.
 */
export const queryCashDays = async (
  query: Scope & { from: string; to: string; collectorId?: string; instituteId?: string },
): Promise<CashDay[]> => {
  const start = dayRangeInTz(query.from, query.timezone).start;
  const end = dayRangeInTz(query.to, query.timezone).end;
  const collector = query.collectorId ? Prisma.sql`AND p."collectedById" = ${query.collectorId}` : Prisma.empty;
  const institute = query.instituteId ? Prisma.sql`AND p."collectedAtInstituteId" = ${query.instituteId}` : Prisma.empty;
  return prisma.$queryRaw<CashDay[]>(Prisma.sql`
    SELECT to_char((p."collectedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${query.timezone}, 'YYYY-MM-DD') AS "day",
           p."collectedById" AS "collectorId", u."name" AS "collectorName",
           p."collectedAtInstituteId" AS "instituteId", i."name" AS "instituteName",
           SUM(p."amount")::text AS "amount", COUNT(*)::int AS "paymentCount"
    FROM "Payment" p
    JOIN "User" u ON u."id" = p."collectedById"
    LEFT JOIN "Institute" i ON i."id" = p."collectedAtInstituteId"
    WHERE p."organizationId" = ${query.organizationId}
      AND p."method" = 'ENTRANCE' AND p."status" IN ('SUCCESS', 'REFUNDED')
      AND p."collectedAt" >= ${start} AND p."collectedAt" < ${end}
      ${collector} ${institute}
    GROUP BY 1, 2, 3, 4, 5
  `);
};

/** What the system says one collector took at one branch (or with no branch recorded) on one Colombo day. */
export const sumCash = async (
  client: Pick<Prisma.TransactionClient, 'payment'>,
  query: Scope & { collectorId: string; instituteId: string | null; day: string },
): Promise<{ amount: Prisma.Decimal; count: number }> => {
  const { start, end } = dayRangeInTz(query.day, query.timezone);
  const total = await client.payment.aggregate({
    where: {
      organizationId: query.organizationId,
      method: PaymentMethod.ENTRANCE,
      status: { in: COUNTED_STATUSES },
      collectedById: query.collectorId,
      collectedAtInstituteId: query.instituteId,
      collectedAt: { gte: start, lt: end },
    },
    _sum: { amount: true },
    _count: true,
  });
  return { amount: total._sum.amount ?? new Prisma.Decimal(0), count: total._count };
};
