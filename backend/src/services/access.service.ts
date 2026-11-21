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
import { billingMonthOf, dayOfMonthInTz } from '@/utils/org-time';
import { createSettingsReader } from '@/services/settings.service';

/** Current billing month in the Payment.paymentMonth format ("YYYY-MM"). */
export const getCurrentPaymentMonth = (now: Date = new Date(), timezone = 'Asia/Colombo'): string =>
  billingMonthOf(now, timezone);

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
 *  - requirePaid = true  → must ALSO be covered for the organization billing
 *    month, including the configured grace period.
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
    const coverage = await isStudentCovered({ userId: actor.userId, courseId, now: new Date() });
    if (!coverage.covered) {
      throw new AppError('PAYMENT_REQUIRED', 402, `Please pay the ${coverage.month} fee for this course to access its content.`);
    }
  }
};

export const isStudentCovered = async ({ userId, courseId, enrollmentId, now }: {
  userId: string; courseId: string; enrollmentId?: string; now: Date;
}): Promise<{ covered: boolean; reason: 'PAID' | 'GRACE' | 'UNPAID'; month: string; graceUntil: string | null }> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true, organization: { select: { timezone: true } } } });
  if (!user?.organizationId || !user.organization) throw new AppError('ORGANIZATION_NOT_FOUND', 404, 'Organization not found.');
  const tz = user.organization.timezone;
  const month = billingMonthOf(now, tz);
  const settings = createSettingsReader(user.organizationId);
  const graceDays = await settings('fees.graceDays');
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const graceUntil = graceDays ? `${month}-${String(Math.min(graceDays, lastDay)).padStart(2, '0')}` : null;
  const enrollment = { userId, courseId, isActive: true, ...(enrollmentId ? { id: enrollmentId } : {}) };
  const active = await prisma.enrollment.findFirst({ where: enrollment, select: { id: true } });
  if (!active) return { covered: false, reason: 'UNPAID', month, graceUntil };
  const paid = (paymentMonth: string) => prisma.payment.findFirst({ where: { status: PaymentStatus.SUCCESS, paymentMonth, enrollment }, select: { id: true } });
  if (await paid(month)) return { covered: true, reason: 'PAID', month, graceUntil };
  if (dayOfMonthInTz(now, tz) <= graceDays) {
    const requiresPrevious = await settings('fees.graceRequiresPreviousMonthPaid');
    const previous = new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
    if (!requiresPrevious || await paid(previous)) return { covered: true, reason: 'GRACE', month, graceUntil };
  }
  return { covered: false, reason: 'UNPAID', month, graceUntil };
};

/**
 * Student start gate for exam instances. Legacy exams deliberately preserve
 * course-wide enrollment behavior; scoped instances additionally require the
 * student's frozen participant row in the requested ONLINE audience.
 */
export const assertStudentExamStartAccess = async (
  actor: AuthenticatedUser,
  examId: string,
  audienceId?: string,
): Promise<void> => {
  if (actor.role !== Role.STUDENT) return;
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, courseId: true, paperRevisionId: true } });
  if (!exam) throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
  await assertStudentContentAccess(actor, exam.courseId);
  if (!exam.paperRevisionId) return;
  if (!audienceId) throw new AppError('EXAM_AUDIENCE_REQUIRED', 400, 'Choose your assigned online audience.');
  const participant = await prisma.examParticipant.findFirst({
    where: { examId, userId: actor.userId, audienceId, audience: { deliveryMode: 'ONLINE' } }, select: { id: true },
  });
  if (!participant) throw new AppError('EXAM_PARTICIPANT_NOT_FOUND', 403, 'You are not eligible to start this exam audience.');
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
  audienceId?: string,
): Promise<void> => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, paperRevisionId: true },
  });
  if (!exam) {
    throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
  }

  // A NULL paper revision is the deliberately preserved legacy contract: its
  // MarkerAssignment is a whole-exam grant. Scoped instances are deny-by-
  // default. List/detail callers may establish that at least one exact grant
  // exists, but every answer query still supplies its own grant-bound audience
  // predicate; group membership never appears in this check.
  if (exam.paperRevisionId) {
    if (audienceId) return assertMarkerAssignedToExamAudience(markerId, examId, audienceId);
    const assignment = await prisma.markerAssignment.findFirst({
      where: {
        markerId,
        examId,
        marker: { role: Role.MARKER, deletedAt: null },
        audienceGrants: { some: { examId } },
      },
      select: { id: true },
    });
    if (assignment) return;
    throw new AppError('MARKER_NOT_ASSIGNED', 403, 'You are not assigned to mark this exam audience.');
  }

  const assignment = await prisma.markerAssignment.findUnique({
    where: { markerId_examId: { markerId, examId } },
    select: { id: true, marker: { select: { role: true, deletedAt: true } } },
  });
  if (!assignment || assignment.marker.role !== Role.MARKER || assignment.marker.deletedAt) {
    throw new AppError('MARKER_NOT_ASSIGNED', 403, 'You are not assigned to mark this exam.');
  }
};

/** Answer-bearing callers must supply an exact audience, never optional scope. */
export const assertMarkerAssignedToExamAudience = async (
  markerId: string,
  examId: string,
  audienceId: string,
): Promise<void> => {
  if (!audienceId) throw new AppError('MARKER_NOT_ASSIGNED', 403, 'An exact exam audience is required.');
  const assignment = await prisma.markerAssignment.findFirst({
    where: { markerId, examId, marker: { role: Role.MARKER, deletedAt: null }, audienceGrants: { some: { examId, audienceId } } },
    select: { id: true },
  });
  if (!assignment) throw new AppError('MARKER_NOT_ASSIGNED', 403, 'You are not assigned to mark this exam audience.');
};
