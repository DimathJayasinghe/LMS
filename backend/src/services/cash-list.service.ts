import { Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { buildCashRows, type CashRow } from '@/utils/cash-rows';
import { colomboDayOf, daysBetween, shiftDay } from '@/utils/org-time';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { createSettingsReader } from '@/services/settings.service';
import { queryCashDays } from '@/services/cash-report.service';
import type { CashQueryInput, CashTallyQueryInput } from '@/schemas/cash.schema';
import type { AuthenticatedUser } from '@/types/auth.types';

/** Widest range one request may cover; the report is not paged, so the window is what keeps it small. */
export const CASH_MAX_RANGE_DAYS = 92;
const DEFAULT_RANGE_DAYS = 6;

export interface CashList {
  from: string;
  to: string;
  /** False when the owner turned the end-of-day count off; screens hide their count controls. */
  tallyEnabled: boolean;
  data: CashRow[];
  count: number;
}

const tallySelect = {
  id: true, day: true, collectorId: true, instituteId: true, countedAmount: true, systemAmount: true, variance: true, paymentCount: true,
  note: true, updatedAt: true, reconciledAt: true,
  collector: { select: { name: true } }, institute: { select: { name: true } }, reconciledBy: { select: { name: true } },
} as const;

/**
 * Cash by Colombo day, collector and branch, joined to the counts recorded for them (D-OPS-1). Front desk sees only their
 * own cash; the owner sees everyone's and may narrow by collector and branch.
 */
export const listCashDays = async (actor: AuthenticatedUser, query: CashQueryInput): Promise<CashList> => {
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) throw new AppError('FORBIDDEN', 403, 'Only front desk and the owner can see cash totals.');
  if (actor.role === Role.ADMIN && query.collectorId && query.collectorId !== actor.userId) {
    throw new AppError('FORBIDDEN', 403, "You can only see the cash you collected.");
  }
  const collectorId = actor.role === Role.ADMIN ? actor.userId : query.collectorId;

  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const to = query.to ?? colomboDayOf(new Date(), timezone);
  const from = query.from ?? shiftDay(to, -DEFAULT_RANGE_DAYS);
  if (from > to) throw new AppError('INVALID_RANGE', 400, 'The start day is after the end day.');
  if (daysBetween(from, to) > CASH_MAX_RANGE_DAYS) throw new AppError('RANGE_TOO_LARGE', 400, `Choose at most ${CASH_MAX_RANGE_DAYS + 1} days.`);

  const setting = createSettingsReader(organizationId);
  const [days, tallies, threshold, tallyEnabled] = await Promise.all([
    queryCashDays({ organizationId, timezone, from, to, collectorId, instituteId: query.instituteId }),
    prisma.cashTally.findMany({
      where: { organizationId, day: { gte: from, lte: to }, ...(collectorId ? { collectorId } : {}), ...(query.instituteId ? { instituteId: query.instituteId } : {}) },
      select: tallySelect,
    }),
    setting('tally.varianceFlagAmount'),
    setting('tally.enabled'),
  ]);
  const data = buildCashRows(days, tallies, threshold);
  return { from, to, tallyEnabled, data, count: data.length };
};

/** The same rows, restricted to days that were counted; the owner's queue is `unreconciled`. */
export const listCashTallies = async (actor: AuthenticatedUser, query: CashTallyQueryInput): Promise<CashList> => {
  const { unreconciled, ...rest } = query;
  const all = await listCashDays(actor, rest);
  const data = all.data.filter((row) => row.tally && !(unreconciled && row.tally.reconciledAt));
  return { ...all, data, count: data.length };
};
