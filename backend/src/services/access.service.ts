// Content-access gate — the single place that decides whether a STUDENT may
// see or stream a course's content. Enforces the architecture §7.1 rule:
// "no signed URL / stream token is ever handed out without passing the gate."
//
// assertStudentContentAccess gates STUDENT on enrollment (+ payment); privileged
// roles bypass it. This module also hosts assertMarkerAssignedToExam — the gate
// that scopes a MARKER to the exams they are actually assigned to. Reusable
// marker-group membership is deliberately not an exam-access grant.

import { PaymentStatus, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';

/** Current billing month in the Payment.paymentMonth format ("YYYY-MM"). */
export const getCurrentPaymentMonth = (now: Date = new Date()): string =>
  now.toISOString().slice(0, 7);

const findActiveEnrollment = async (
  userId: string,
  courseId: string,
): Promise<{ id: string } | null> =>
  prisma.enrollment.findFirst({
    where: { userId, courseId, isActive: true },
    select: { id: true },
  });

/**
 * Gate a STUDENT's access to a course's content. No-op for non-students.
 *
 *  - requirePaid = false → must hold an active enrollment (see schedule, list).
 *  - requirePaid = true  → must ALSO have a SUCCESS payment for the CURRENT
 *    month on that course (stream video / premium content). Plan §13.
 */
export const assertStudentContentAccess = async (
  actor: AuthenticatedUser,
  courseId: string,
  opts: { requirePaid?: boolean } = {},
): Promise<void> => {
  if (actor.role !== Role.STUDENT) return;

  const enrollment = await findActiveEnrollment(actor.userId, courseId);
  if (!enrollment) {
    throw new AppError('NOT_ENROLLED', 403, 'You are not enrolled in this course.');
  }

  if (opts.requirePaid) {
    const month = getCurrentPaymentMonth();
    const paid = await prisma.payment.findFirst({
      where: {
        status: PaymentStatus.SUCCESS,
        paymentMonth: month,
        enrollment: { userId: actor.userId, courseId },
      },
      select: { id: true },
    });
    if (!paid) {
      throw new AppError(
        'PAYMENT_REQUIRED',
        402,
        `Please pay the ${month} fee for this course to access its content.`,
      );
    }
  }
};

/**
 * Authorization gate: a MARKER may only act on an exam they are assigned to
 * (grade its submissions, read its detail). Extracted here — the authz-gate
 * module — so submission.service and exam.service share one definition instead
 * of each carrying its own copy. Throws 403 MARKER_NOT_ASSIGNED if unassigned.
 */
export const assertMarkerAssignedToExam = async (
  markerId: string,
  examId: string,
): Promise<void> => {
  const assignment = await prisma.markerAssignment.findUnique({
    where: { markerId_examId: { markerId, examId } },
  });
  if (!assignment) {
    throw new AppError('MARKER_NOT_ASSIGNED', 403, 'You are not assigned to mark this exam.');
  }
};
