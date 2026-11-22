import { PaymentStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { billingMonthOf, monthStartInTz, shiftMonth } from '@/utils/org-time';
import { getMonthFeeForEnrollment } from '@/services/month-fee.service';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { describeOutstanding, outstandingEnrollmentSelect, type OutstandingRow } from '@/services/outstanding-rows.service';
import type { AuthenticatedUser } from '@/types/auth.types';

export type { OutstandingRow } from '@/services/outstanding-rows.service';

export interface OutstandingScope {
  organizationId: string;
  timezone: string;
  /** Billing month `YYYY-MM` that has no successful payment. */
  month: string;
  /** Narrows the courses (a teacher's own, one course); the active-course rule is always added on top. */
  courseWhere?: Prisma.CourseWhereInput;
}

/** The one definition of "owes": the list, the report figure and the reminders all read it. */
export const outstandingWhere = ({ organizationId, timezone, month, courseWhere }: OutstandingScope): Prisma.EnrollmentWhereInput => ({
  organizationId,
  isActive: true,
  user: { deletedAt: null },
  course: { ...courseWhere, isActive: true },
  // The first month a student can owe is the Colombo month they enrolled in.
  createdAt: { lt: monthStartInTz(shiftMonth(month, 1), timezone) },
  payments: { none: { paymentMonth: month, status: PaymentStatus.SUCCESS } },
});

export interface OwingCourse {
  courseId: string;
  name: string;
  count: number;
  /** What the owing students would pay for the month, as a fixed(2) string. */
  expected: string;
}

/** Who owes, grouped by course and priced through the fee function. Order is not defined. */
export const owingByCourse = async (scope: OutstandingScope): Promise<OwingCourse[]> => {
  const groups = await prisma.enrollment.groupBy({ by: ['courseId'], where: outstandingWhere(scope), _count: { _all: true } });
  if (groups.length === 0) return [];
  const courses = await prisma.course.findMany({ where: { id: { in: groups.map((g) => g.courseId) } }, select: { id: true, name: true, monthlyFee: true } });
  const courseOf = new Map(courses.map((c) => [c.id, c]));
  return groups.flatMap((group) => {
    const course = courseOf.get(group.courseId);
    if (!course) return [];
    const expected = getMonthFeeForEnrollment({ course }, scope.month).times(group._count._all).toFixed(2);
    return [{ courseId: course.id, name: course.name, count: group._count._all, expected }];
  });
};

/** How many different students owe, whatever number of their classes they owe for. */
export const owingStudents = async (scope: OutstandingScope): Promise<number> =>
  (await prisma.enrollment.groupBy({ by: ['userId'], where: outstandingWhere(scope) })).length;

export const countOutstanding = async (scope: OutstandingScope): Promise<{ count: number; expected: string }> => {
  const courses = await owingByCourse(scope);
  return {
    count: courses.reduce((sum, c) => sum + c.count, 0),
    expected: courses.reduce((sum, c) => sum.plus(c.expected), new Prisma.Decimal(0)).toFixed(2),
  };
};

export interface OutstandingQuery {
  month?: string;
  courseId?: string;
  page?: number;
  limit?: number;
}

export interface OutstandingList {
  month: string;
  data: OutstandingRow[];
  count: number;
}

/** Front desk and owner only; the role is checked here as well as at the route. */
export const assertCanReadOutstanding = (actor: AuthenticatedUser): void => {
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) {
    throw new AppError('FORBIDDEN', 403, 'You do not have permission to view who owes fees.');
  }
};

/** A month that has not started owes nothing, so asking for one is a mistake worth naming. */
export const assertMonthStarted = (month: string, currentMonth: string): void => {
  if (month > currentMonth) throw new AppError('MONTH_IN_FUTURE', 400, 'That month has not started yet, so nothing is owed for it.');
};

export const listOutstanding = async (actor: AuthenticatedUser, query: OutstandingQuery): Promise<OutstandingList> => {
  assertCanReadOutstanding(actor);
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const now = new Date();
  const month = query.month ?? billingMonthOf(now, timezone);
  assertMonthStarted(month, billingMonthOf(now, timezone));

  const where = outstandingWhere({ organizationId, timezone, month, courseWhere: query.courseId ? { id: query.courseId } : undefined });
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const [enrollments, count] = await Promise.all([
    prisma.enrollment.findMany({
      where, select: outstandingEnrollmentSelect, skip: (page - 1) * limit, take: limit,
      orderBy: [{ course: { name: 'asc' } }, { user: { indexNumber: 'asc' } }],
    }),
    prisma.enrollment.count({ where }),
  ]);
  return { month, data: await describeOutstanding({ organizationId, timezone, month, now }, enrollments), count };
};
