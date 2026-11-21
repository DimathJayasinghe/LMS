import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION } from '@/utils/constants';
import { withAdvisoryLock } from '@/utils/advisory-lock';
import { colomboDayOf } from '@/utils/org-time';
import { isFlagged } from '@/utils/cash-rows';
import { logInTransaction } from '@/services/audit.service';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { createSettingsReader } from '@/services/settings.service';
import { sumCash } from '@/services/cash-report.service';
import type { CloseCashDayInput } from '@/schemas/cash.schema';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { AuditContext } from '@/types/audit.types';

export interface ClosedCashDay {
  id: string;
  collectorId: string;
  day: string;
  instituteId: string | null;
  countedAmount: string;
  systemAmount: string;
  variance: string;
  paymentCount: number;
  note: string | null;
  flagged: boolean;
}

/**
 * Records one collector's count of the cash they took on one Colombo day at one branch (D-OPS-1). A record, not a lock:
 * cash taken later still lands, and the row then reports itself stale. The collector is always the caller.
 */
export const closeCashDay = async (actor: AuthenticatedUser, input: CloseCashDayInput, context: AuditContext): Promise<ClosedCashDay> => {
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) throw new AppError('FORBIDDEN', 403, 'Only front desk and the owner can count the cash.');
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const setting = createSettingsReader(organizationId);
  if (!(await setting('tally.enabled'))) throw new AppError('TALLY_DISABLED', 409, 'The end-of-day cash count is turned off.');

  const today = colomboDayOf(new Date(), timezone);
  const day = input.day ?? today;
  if (day > today) throw new AppError('DAY_IN_FUTURE', 400, 'That day has not started yet.');
  const instituteId = input.instituteId ?? null;
  if (instituteId && !(await prisma.institute.findFirst({ where: { id: instituteId, organizationId }, select: { id: true } }))) {
    throw new AppError('INSTITUTE_NOT_FOUND', 404, 'Branch not found.');
  }

  const counted = new Prisma.Decimal(input.countedAmount);
  const result = await prisma.$transaction(async (tx) => {
    await withAdvisoryLock(tx, 'cash-tally', organizationId, `${actor.userId}:${day}:${instituteId ?? 'none'}`);
    const existing = await tx.cashTally.findFirst({ where: { organizationId, collectorId: actor.userId, day, instituteId }, select: { id: true, reconciledAt: true } });
    if (existing?.reconciledAt) throw new AppError('TALLY_RECONCILED', 409, 'The owner already reconciled this day. Ask the owner if it needs a correction.');

    const system = await sumCash(tx, { organizationId, timezone, collectorId: actor.userId, instituteId, day });
    const figures = { countedAmount: counted, systemAmount: system.amount, variance: counted.minus(system.amount), paymentCount: system.count, note: input.note ?? null };
    const saved = existing
      ? await tx.cashTally.update({ where: { id: existing.id }, data: figures })
      : await tx.cashTally.create({ data: { organizationId, collectorId: actor.userId, day, instituteId, ...figures } });

    await logInTransaction(tx, {
      action: AUDIT_ACTION.CASH_DAY_CLOSED, description: `Cash counted for ${day}`, targetType: 'CashTally', targetId: saved.id, organizationId, context,
      metadata: { day, instituteId, countedAmount: counted.toFixed(2), systemAmount: system.amount.toFixed(2), variance: figures.variance.toFixed(2), paymentCount: system.count },
    });
    return { id: saved.id, figures };
  });

  const { figures } = result;
  return {
    id: result.id, collectorId: actor.userId, day, instituteId, countedAmount: counted.toFixed(2), systemAmount: figures.systemAmount.toFixed(2),
    variance: figures.variance.toFixed(2), paymentCount: figures.paymentCount, note: figures.note, flagged: isFlagged(figures.variance, await setting('tally.varianceFlagAmount')),
  };
};

/** Owner marks a counted day as checked against the cash. Repeating it changes nothing and writes no second audit row. */
export const reconcileCashTally = async (
  actor: AuthenticatedUser,
  id: string,
  context: AuditContext,
): Promise<{ id: string; reconciledAt: Date; alreadyReconciled: boolean }> => {
  if (actor.role !== Role.SUPER_ADMIN) throw new AppError('FORBIDDEN', 403, 'Only the owner can reconcile a cash day.');
  const { organizationId } = await organizationClockForUser(actor.userId);
  const where = { id, organizationId };
  const found = await prisma.cashTally.findFirst({ where, select: { id: true, reconciledAt: true } });
  if (!found) throw new AppError('CASH_TALLY_NOT_FOUND', 404, 'Cash count not found.');
  if (found.reconciledAt) return { id, reconciledAt: found.reconciledAt, alreadyReconciled: true };

  const now = new Date();
  const won = await prisma.$transaction(async (tx) => {
    const done = await tx.cashTally.updateMany({ where: { ...where, reconciledAt: null }, data: { reconciledAt: now, reconciledById: actor.userId } });
    if (done.count === 0) return false;
    await logInTransaction(tx, { action: AUDIT_ACTION.CASH_TALLY_RECONCILED, description: 'Cash day reconciled', targetType: 'CashTally', targetId: id, organizationId, context });
    return true;
  });
  if (won) return { id, reconciledAt: now, alreadyReconciled: false };

  const current = await prisma.cashTally.findFirst({ where, select: { reconciledAt: true } });
  return { id, reconciledAt: current?.reconciledAt ?? now, alreadyReconciled: true };
};
