import { SmsStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { assertOwner } from '@/services/console-access';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { billingMonthOf, colomboDayOf, dayRangeInTz, monthStartInTz, shiftDay } from '@/utils/org-time';
import { maskPhone, scrubProviderText } from '@/utils/sms-privacy';
import type { AuthenticatedUser } from '@/types/auth.types';

const FAILURES_SHOWN = 10;
const WEEK_DAYS = 7;

export interface SmsCounts {
  sent: number;
  failed: number;
  pending: number;
}

export interface SmsFailure {
  id: string;
  at: Date;
  /** Last three digits only. */
  phone: string;
  /** The provider's reason, shortened, with any number in it hidden. */
  reason: string | null;
}

export interface SmsPanel {
  /** The last seven days, today included, counted from `from`. */
  week: SmsCounts & { from: string };
  month: SmsCounts & { month: string };
  failures: SmsFailure[];
}

type StatusCount = { status: SmsStatus; _count: { _all: number } };
const toCounts = (rows: StatusCount[]): SmsCounts => {
  const of = (status: SmsStatus): number => rows.find((row) => row.status === status)?._count._all ?? 0;
  return { sent: of(SmsStatus.SENT), failed: of(SmsStatus.FAILED), pending: of(SmsStatus.PENDING) };
};

/** How the SMS trial is going: delivery counts and the latest failures. Message bodies are never read and numbers never shown whole. */
export const getSmsPanel = async (actor: AuthenticatedUser): Promise<SmsPanel> => {
  assertOwner(actor);
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const now = new Date();
  const today = colomboDayOf(now, timezone);
  const from = shiftDay(today, 1 - WEEK_DAYS);
  const month = billingMonthOf(now, timezone);
  const since = (gte: Date) => prisma.smsLog.groupBy({ by: ['status'], where: { organizationId, createdAt: { gte } }, _count: { _all: true } });

  const [week, monthRows, failed] = await Promise.all([
    since(dayRangeInTz(from, timezone).start),
    since(monthStartInTz(month, timezone)),
    prisma.smsLog.findMany({
      where: { organizationId, status: SmsStatus.FAILED }, orderBy: { createdAt: 'desc' }, take: FAILURES_SHOWN,
      select: { id: true, createdAt: true, phoneNumber: true, errorDetail: true },
    }),
  ]);
  return {
    week: { from, ...toCounts(week) },
    month: { month, ...toCounts(monthRows) },
    failures: failed.map((row) => ({ id: row.id, at: row.createdAt, phone: maskPhone(row.phoneNumber), reason: scrubProviderText(row.errorDetail) })),
  };
};
