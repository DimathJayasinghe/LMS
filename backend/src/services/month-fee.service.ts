import { Prisma } from '@prisma/client';

/**
 * The fee for one billing month of one enrollment. Today every month costs the course's monthly fee; D-MONEY-2 swaps
 * this single function for the dated fee calculation, so money code must not read `Course.monthlyFee` on its own.
 */
export const getMonthFeeForEnrollment = (
  enrollment: { course: { monthlyFee: Prisma.Decimal | number | string } },
  _month: string,
): Prisma.Decimal => new Prisma.Decimal(enrollment.course.monthlyFee);
