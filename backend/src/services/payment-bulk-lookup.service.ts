import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import type { BulkEnrollment, BulkExistingPayment } from '@/utils/bulk-payment-plan';
import type { BulkSheetRow } from '@/utils/bulk-payment-rows';

const enrollmentSelect = {
  id: true,
  isActive: true,
  classType: true,
  courseId: true,
  course: { select: { isActive: true, monthlyFee: true } },
  user: { select: { indexNumber: true, deletedAt: true } },
} satisfies Prisma.EnrollmentSelect;

/**
 * Reads, in two queries, everything the sheet points at: the enrollments (this organization only, so another
 * organization's id is simply "not found") and the payments already on the months named.
 */
export const loadBulkContext = async (
  organizationId: string,
  rows: BulkSheetRow[],
): Promise<{ enrollments: BulkEnrollment[]; payments: BulkExistingPayment[] }> => {
  const values = rows.flatMap((row) => (row.value ? [row.value] : []));
  const ids = [...new Set(values.flatMap((value) => (value.enrollmentId ? [value.enrollmentId] : [])))];
  const composites = new Map(
    values.filter((value) => !value.enrollmentId).map((value) => [
      `${value.indexNumber}:${value.courseId}:${value.classType}`,
      { user: { indexNumber: value.indexNumber! }, courseId: value.courseId!, classType: value.classType! },
    ]),
  );
  if (!ids.length && !composites.size) return { enrollments: [], payments: [] };

  const found = await prisma.enrollment.findMany({
    where: { organizationId, OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...composites.values()] },
    select: enrollmentSelect,
  });
  if (!found.length) return { enrollments: [], payments: [] };

  const payments = await prisma.payment.findMany({
    where: { enrollmentId: { in: found.map((enrollment) => enrollment.id) }, paymentMonth: { in: [...new Set(values.map((value) => value.paymentMonth))] } },
    select: { id: true, enrollmentId: true, paymentMonth: true, status: true },
  });

  return {
    enrollments: found.map((enrollment) => ({
      id: enrollment.id,
      isActive: enrollment.isActive,
      classType: enrollment.classType,
      courseId: enrollment.courseId,
      courseActive: enrollment.course.isActive,
      monthlyFee: enrollment.course.monthlyFee,
      studentIndexNumber: enrollment.user.indexNumber,
      studentActive: enrollment.user.deletedAt === null,
    })),
    payments,
  };
};
