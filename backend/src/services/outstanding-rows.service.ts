import { ClassType, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { billingMonthOf, dayOfMonthInTz, monthsEndingAt, shiftMonth } from '@/utils/org-time';
import { getMonthFeeForEnrollment } from '@/services/month-fee.service';
import { createSettingsReader } from '@/services/settings.service';

export interface OutstandingRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  indexNumber: number;
  /** The student's own mobile; a guardian number replaces it once guardians exist (D-IDENTITY-2). */
  phone: string | null;
  courseId: string;
  courseName: string;
  classType: ClassType;
  monthsOwed: number;
  /** Fee for the requested month. */
  amount: string;
  /** Fee for every owed month in the arrears window. */
  totalOwed: string;
  inGrace: boolean;
  /** Last grace day of the current month, whether or not it has passed; null for past months or when grace is off. */
  graceUntil: string | null;
}

export const outstandingEnrollmentSelect = {
  id: true,
  classType: true,
  createdAt: true,
  user: { select: { id: true, name: true, indexNumber: true, phone: true } },
  course: { select: { id: true, name: true, monthlyFee: true } },
} satisfies Prisma.EnrollmentSelect;

export type OutstandingEnrollment = Prisma.EnrollmentGetPayload<{ select: typeof outstandingEnrollmentSelect }>;

/**
 * Months owed, amounts and grace for a set of owing enrollments, from one payment query. The grace rule is the one the
 * content gate uses (`isStudentCovered`): inside the first `fees.graceDays` of the current month, with the previous
 * month paid when the owner requires it, and never after a refund of the current month.
 */
export const describeOutstanding = async (
  ctx: { organizationId: string; timezone: string; month: string; now: Date },
  enrollments: OutstandingEnrollment[],
): Promise<OutstandingRow[]> => {
  if (enrollments.length === 0) return [];
  const { organizationId, timezone, month, now } = ctx;
  const setting = createSettingsReader(organizationId);
  const [arrearsMonths, graceDays, requiresPrevious] = await Promise.all([
    setting('fees.arrearsReportMonths'), setting('fees.graceDays'), setting('fees.graceRequiresPreviousMonthPaid'),
  ]);
  const windowMonths = monthsEndingAt(month, Math.max(1, arrearsMonths));
  const previous = shiftMonth(month, -1);
  const payments = await prisma.payment.findMany({
    where: {
      enrollmentId: { in: enrollments.map((e) => e.id) },
      paymentMonth: { in: [...new Set([...windowMonths, previous])] },
      status: { in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
    },
    select: { enrollmentId: true, paymentMonth: true, status: true },
  });
  const has = (enrollmentId: string, paymentMonth: string, status: PaymentStatus) =>
    payments.some((p) => p.enrollmentId === enrollmentId && p.paymentMonth === paymentMonth && p.status === status);

  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const graceOpen = month === billingMonthOf(now, timezone) && graceDays > 0;
  const graceUntil = graceOpen ? `${month}-${String(Math.min(graceDays, lastDay)).padStart(2, '0')}` : null;
  const withinGraceDays = graceOpen && dayOfMonthInTz(now, timezone) <= graceDays;

  return enrollments.map((e): OutstandingRow => {
    const firstBillable = billingMonthOf(e.createdAt, timezone);
    const owed = windowMonths.filter((m) => m >= firstBillable && !has(e.id, m, PaymentStatus.SUCCESS));
    const total = owed.reduce((sum, m) => sum.plus(getMonthFeeForEnrollment(e, m)), new Prisma.Decimal(0));
    const inGrace = withinGraceDays && !has(e.id, month, PaymentStatus.REFUNDED) && (!requiresPrevious || has(e.id, previous, PaymentStatus.SUCCESS));
    return {
      enrollmentId: e.id, studentId: e.user.id, studentName: e.user.name, indexNumber: e.user.indexNumber, phone: e.user.phone,
      courseId: e.course.id, courseName: e.course.name, classType: e.classType,
      monthsOwed: owed.length, amount: getMonthFeeForEnrollment(e, month).toFixed(2), totalOwed: total.toFixed(2),
      inGrace, graceUntil,
    };
  });
};
