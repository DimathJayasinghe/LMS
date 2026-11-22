import { AttendanceStatus, ClassType, PaymentStatus, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { billingMonthOf } from '@/utils/org-time';
import { assertCourseAccess } from '@/services/class.service';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { createSettingsReader } from '@/services/settings.service';
import type { AuthenticatedUser } from '@/types/auth.types';

/**
 * What a teacher may see about a student of their own class: who they are, how they joined, whether this month is
 * paid and how often they came lately. Contact details, ID numbers, amounts and who collected them stay out of this
 * shape on purpose; adding a field here is a privacy decision, not a convenience.
 */
export interface RosterRow {
  studentId: string;
  name: string;
  indexNumber: number;
  classType: ClassType;
  enrolledAt: Date;
  /** Left out when the owner switches `roster.showPaidState` off. */
  feeState?: 'PAID' | 'NOT_PAID';
  attendedLastN: { attended: number; sessions: number };
}

export interface RosterPage {
  data: RosterRow[];
  count: number;
  page: number;
  pageSize: number;
}

const ROSTER_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER];
const ATTENDED: AttendanceStatus[] = [AttendanceStatus.PRESENT, AttendanceStatus.LATE];

/** The last `window` sessions this class has already held, and how many of them each listed student attended. */
const attendanceByStudent = async (courseId: string, studentIds: string[], window: number, now: Date) => {
  const sessions = await prisma.classSession.findMany({
    where: { courseId, deletedAt: null, date: { lte: now } },
    orderBy: { date: 'desc' }, take: window, select: { id: true },
  });
  if (sessions.length === 0) return { held: 0, attended: new Map<string, number>() };
  const groups = await prisma.attendance.groupBy({
    by: ['userId'],
    where: { classSessionId: { in: sessions.map((s) => s.id) }, userId: { in: studentIds }, voidedAt: null, status: { in: ATTENDED } },
    _count: { _all: true },
  });
  return { held: sessions.length, attended: new Map(groups.map((g) => [g.userId, g._count._all])) };
};

export const listRoster = async (courseId: string, actor: AuthenticatedUser, page: number): Promise<RosterPage> => {
  if (!ROSTER_ROLES.includes(actor.role)) throw new AppError('FORBIDDEN', 403, 'You do not have permission to view a class roster.');
  await assertCourseAccess(courseId, actor);
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const setting = createSettingsReader(organizationId);
  const [showPaidState, window, pageSize] = await Promise.all([
    setting('roster.showPaidState'), setting('roster.attendanceWindowSessions'), setting('roster.pageSize'),
  ]);
  const now = new Date();

  const where = { courseId, organizationId, isActive: true, user: { deletedAt: null } };
  const [enrollments, count] = await Promise.all([
    prisma.enrollment.findMany({
      where, orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
      select: {
        classType: true,
        createdAt: true,
        user: { select: { id: true, name: true, indexNumber: true } },
        ...(showPaidState && {
          payments: { where: { paymentMonth: billingMonthOf(now, timezone), status: PaymentStatus.SUCCESS }, select: { id: true }, take: 1 },
        }),
      },
    }),
    prisma.enrollment.count({ where }),
  ]);
  if (enrollments.length === 0) return { data: [], count, page, pageSize };

  const { held, attended } = await attendanceByStudent(courseId, enrollments.map((e) => e.user.id), window, now);
  const data = enrollments.map((enrollment): RosterRow => ({
    studentId: enrollment.user.id,
    name: enrollment.user.name,
    indexNumber: enrollment.user.indexNumber,
    classType: enrollment.classType,
    enrolledAt: enrollment.createdAt,
    ...(showPaidState && { feeState: 'payments' in enrollment && enrollment.payments.length > 0 ? 'PAID' as const : 'NOT_PAID' as const }),
    attendedLastN: { attended: attended.get(enrollment.user.id) ?? 0, sessions: held },
  }));
  return { data, count, page, pageSize };
};
