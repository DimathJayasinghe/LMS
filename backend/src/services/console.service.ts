import { Prisma } from '@prisma/client';
import { AppError } from '@/utils/app-error';
import { billingMonthOf, colomboDayOf, shiftDay } from '@/utils/org-time';
import { CASH_MAX_RANGE_DAYS, listCashDays, listCashTallies } from '@/services/cash-list.service';
import { assertOwner } from '@/services/console-access';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { assertMonthStarted, owingByCourse, owingStudents, type OwingCourse } from '@/services/outstanding.service';
import { getFinancialReport, type FinancialReport } from '@/services/payment.service';
import { createSettingsReader } from '@/services/settings.service';
import type { CashRow } from '@/utils/cash-rows';
import type { AuthenticatedUser } from '@/types/auth.types';

/**
 * The owner's read-only console. Every figure comes from a service that already answers it for its own screen, so a
 * panel can never disagree with the list it summarises. Nothing here writes.
 */
const WAITING_DAYS_SHOWN = 20;
const OWING_COURSES_SHOWN = 5;

export interface CashPanel {
  date: string;
  tallyEnabled: boolean;
  /** What the desk took on `date`, from the payments themselves. */
  collectedTotal: string;
  paymentCount: number;
  rows: CashRow[];
  /** Counts that differ from the system figure beyond the owner's threshold and are not reconciled yet: today's, and older days. */
  flagged: CashRow[];
  /** Counted days before `date` the owner has not reconciled, newest first, with the days that were searched. */
  unreconciled: { count: number; rows: CashRow[]; from: string; to: string };
  /** Fees for the billing month of `date`, by method and net of refunds: what the month's payments are for, which on a day near a month end can differ from what was taken in the month. */
  month: { month: string; byMethod: FinancialReport['byMethod'] };
}

export const getCashPanel = async (actor: AuthenticatedUser, query: { date?: string }): Promise<CashPanel> => {
  assertOwner(actor);
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const today = colomboDayOf(new Date(), timezone);
  const date = query.date ?? today;
  if (date > today) throw new AppError('DAY_IN_FUTURE', 400, 'That day has not happened yet.');

  const lookback = Math.min(await createSettingsReader(organizationId)('console.lookbackDays'), CASH_MAX_RANGE_DAYS);
  const [day, older, report] = await Promise.all([
    listCashDays(actor, { from: date, to: date }),
    listCashTallies(actor, { from: shiftDay(date, -lookback), to: shiftDay(date, -1), unreconciled: true }),
    getFinancialReport(date.slice(0, 7), {}, actor),
  ]);
  const total = day.data.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  return {
    date,
    tallyEnabled: day.tallyEnabled,
    collectedTotal: total.toFixed(2),
    paymentCount: day.data.reduce((sum, row) => sum + row.paymentCount, 0),
    rows: day.data,
    flagged: [...day.data, ...older.data].filter((row) => row.tally?.flagged && !row.tally.reconciledAt),
    unreconciled: { count: older.count, rows: older.data.slice(0, WAITING_DAYS_SHOWN), from: older.from, to: older.to },
    month: { month: report.month, byMethod: report.byMethod },
  };
};

export interface OwingPanel {
  month: string;
  /** Different students who owe for the month: one who owes two classes counts once. */
  students: number;
  /** Over every course, not only those listed. */
  amount: string;
  /** The courses owing most, largest first. */
  courses: OwingCourse[];
  /** Courses with something owing that are not listed. */
  otherCourses: number;
}

export const getOwingPanel = async (actor: AuthenticatedUser, query: { month?: string }): Promise<OwingPanel> => {
  assertOwner(actor);
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const month = query.month ?? billingMonthOf(new Date(), timezone);
  assertMonthStarted(month, billingMonthOf(new Date(), timezone));

  const scope = { organizationId, timezone, month };
  const [courses, students] = await Promise.all([owingByCourse(scope), owingStudents(scope)]);
  const biggest = [...courses].sort((a, b) => new Prisma.Decimal(b.expected).comparedTo(a.expected) || a.name.localeCompare(b.name));
  return {
    month,
    students,
    amount: courses.reduce((sum, c) => sum.plus(c.expected), new Prisma.Decimal(0)).toFixed(2),
    courses: biggest.slice(0, OWING_COURSES_SHOWN),
    otherCourses: Math.max(0, biggest.length - OWING_COURSES_SHOWN),
  };
};
