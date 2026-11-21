import { NotificationType } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION } from '@/utils/constants';
import { withAdvisoryLock } from '@/utils/advisory-lock';
import { billingMonthOf, dayOfMonthInTz, monthStartInTz, shiftMonth } from '@/utils/org-time';
import { logInTransaction } from '@/services/audit.service';
import { dispatch } from '@/services/notification.service';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { assertCanReadOutstanding, assertMonthStarted, outstandingWhere } from '@/services/outstanding.service';
import { describeOutstanding, outstandingEnrollmentSelect, type OutstandingRow } from '@/services/outstanding-rows.service';
import { createSettingsReader } from '@/services/settings.service';
import type { SendFeeRemindersInput } from '@/schemas/outstanding.schema';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { AuditContext } from '@/types/audit.types';

export type ReminderSkipReason = 'NOT_OWING' | 'IN_GRACE' | 'REMINDER_LIMIT_REACHED';

export interface ReminderResult {
  /** Reminders created: one per student, however many of their courses owe. */
  sent: number;
  skipped: { enrollmentId: string; reason: ReminderSkipReason }[];
}

const courseLabel = (rows: OutstandingRow[]): string => {
  const names = [...new Set(rows.map((r) => r.courseName))];
  return names.length === 1 ? names[0]! : `${names[0]} and ${names.length - 1} more`;
};

/**
 * Manual fee reminders (F-78). Only from the owner-set day of the month, never to a student still inside the grace days,
 * and at most `fees.reminderMaxPerStudentPerMonth` per student per Colombo month, counted from the durable in-app rows.
 * The in-app row is always created; SMS follows the per-type setting, which is seeded off. The count and the sends run
 * under one lock so two desks pressing the button together cannot both get past the cap.
 */
export const sendFeeReminders = async (input: SendFeeRemindersInput, actor: AuthenticatedUser, context: AuditContext): Promise<ReminderResult> => {
  assertCanReadOutstanding(actor);
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const now = new Date();
  const currentMonth = billingMonthOf(now, timezone);
  assertMonthStarted(input.month, currentMonth);

  const setting = createSettingsReader(organizationId);
  const [fromDay, maxPerMonth] = await Promise.all([setting('fees.reminderFromDay'), setting('fees.reminderMaxPerStudentPerMonth')]);
  if (maxPerMonth === 0) throw new AppError('REMINDERS_DISABLED', 409, 'Fee reminders are switched off in the organization settings.');
  if (dayOfMonthInTz(now, timezone) < fromDay) {
    throw new AppError('REMINDER_TOO_EARLY', 409, `Fee reminders start on day ${fromDay} of the month, after the grace days.`);
  }

  const ids = input.enrollmentIds ? [...new Set(input.enrollmentIds)] : undefined;
  if (ids) {
    const found = await prisma.enrollment.findMany({ where: { id: { in: ids }, organizationId, ...(input.courseId ? { courseId: input.courseId } : {}) }, select: { id: true } });
    if (found.length !== ids.length) throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'One of the chosen enrollments was not found.');
  }
  const owing = await prisma.enrollment.findMany({
    where: { AND: [outstandingWhere({ organizationId, timezone, month: input.month, courseWhere: input.courseId ? { id: input.courseId } : undefined }), ids ? { id: { in: ids } } : {}] },
    select: outstandingEnrollmentSelect,
  });
  const rows = await describeOutstanding({ organizationId, timezone, month: input.month, now }, owing);

  const skipped: ReminderResult['skipped'] = (ids ?? []).filter((id) => !rows.some((r) => r.enrollmentId === id)).map((enrollmentId) => ({ enrollmentId, reason: 'NOT_OWING' }));
  for (const r of rows) if (r.inGrace) skipped.push({ enrollmentId: r.enrollmentId, reason: 'IN_GRACE' });
  const byStudent = new Map<string, OutstandingRow[]>();
  for (const r of rows.filter((x) => !x.inGrace)) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);

  return prisma.$transaction(async (tx) => {
    await withAdvisoryLock(tx, 'fee-reminders', organizationId, currentMonth);
    const earlier = await tx.notification.groupBy({
      by: ['userId'],
      where: {
        type: NotificationType.FEE_DUE, userId: { in: [...byStudent.keys()] },
        createdAt: { gte: monthStartInTz(currentMonth, timezone), lt: monthStartInTz(shiftMonth(currentMonth, 1), timezone) },
      },
      _count: { _all: true },
    });
    const already = new Map(earlier.map((e) => [e.userId, e._count._all]));
    let sent = 0;
    for (const [studentId, studentRows] of byStudent) {
      if ((already.get(studentId) ?? 0) >= maxPerMonth) {
        for (const r of studentRows) skipped.push({ enrollmentId: r.enrollmentId, reason: 'REMINDER_LIMIT_REACHED' });
        continue;
      }
      await dispatch({ type: NotificationType.FEE_DUE, userId: studentId, link: '/payments', params: { courseName: courseLabel(studentRows), paymentMonth: input.month }, forceInApp: true });
      sent += 1;
    }
    const skippedByReason = skipped.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }), {});
    await logInTransaction(tx, {
      action: AUDIT_ACTION.FEE_REMINDER_SENT, description: 'Fee reminders sent', organizationId, context,
      metadata: { month: input.month, ...(input.courseId ? { courseId: input.courseId } : {}), sent, skipped: skippedByReason },
    });
    return { sent, skipped };
  }, { timeout: 60_000 });
};
