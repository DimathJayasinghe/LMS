import { ClassType, EnrollmentScanState } from '@prisma/client';
import { prisma } from '@/config/database';
import { assertOwner } from '@/services/console-access';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { createSettingsReader } from '@/services/settings.service';
import { ATTENDED_STATUSES } from '@/utils/attendance-status';
import { colomboDayOf, dayRangeInTz, shiftDay } from '@/utils/org-time';
import type { AuthenticatedUser } from '@/types/auth.types';

export interface AttendanceSession {
  sessionId: string;
  title: string;
  courseName: string;
  startsAt: Date;
  durationMinutes: number;
  /** Null when the class is for every mode. */
  classType: ClassType | null;
  /** The branch of the timetable slot that made the class; null for one set up by hand. */
  instituteName: string | null;
  /** Students who attended (present or late), as the class roster counts them; voided scans left out. */
  scanned: number;
  /** Active enrollments that can attend this class. */
  enrolled: number;
}

export interface AttendanceWarnings {
  /** The days searched, inclusive. */
  from: string;
  to: string;
  /** Scans by a student with no enrollment in the class. */
  withoutEnrollment: number;
  /** Scans by a student enrolled online only. */
  onlineOnly: number;
  /** Scans by a student with no paid month at the door. */
  unpaid: number;
}

export interface AttendancePanel {
  date: string;
  sessions: AttendanceSession[];
  flagged: AttendanceWarnings;
}

/** Today's classes with who scanned in, and how many scans in the lookback broke the enrollment or payment rule. */
export const getAttendancePanel = async (actor: AuthenticatedUser): Promise<AttendancePanel> => {
  assertOwner(actor);
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const lookbackDays = await createSettingsReader(organizationId)('console.lookbackDays');
  const date = colomboDayOf(new Date(), timezone);
  const today = dayRangeInTz(date, timezone);

  const sessions = await prisma.classSession.findMany({
    where: { organizationId, deletedAt: null, date: { gte: today.start, lt: today.end } },
    orderBy: { date: 'asc' },
    select: {
      id: true, title: true, date: true, durationMinutes: true, classType: true, courseId: true,
      course: { select: { name: true } },
      timetableSlot: { select: { institute: { select: { name: true } } } },
    },
  });

  const from = shiftDay(date, 1 - lookbackDays);
  const scannedIn = { gte: dayRangeInTz(from, timezone).start, lt: today.end };
  const base = { organizationId, voidedAt: null, scannedAt: scannedIn };
  const [scans, enrollments, withoutEnrollment, onlineOnly, unpaid] = await Promise.all([
    sessions.length === 0 ? [] : prisma.attendance.groupBy({ by: ['classSessionId'], where: { classSessionId: { in: sessions.map((s) => s.id) }, voidedAt: null, status: { in: ATTENDED_STATUSES } }, _count: { _all: true } }),
    sessions.length === 0 ? [] : prisma.enrollment.groupBy({ by: ['courseId', 'classType'], where: { courseId: { in: [...new Set(sessions.map((s) => s.courseId))] }, isActive: true, user: { deletedAt: null } }, _count: { _all: true } }),
    prisma.attendance.count({ where: { ...base, enrollmentStateAtScan: EnrollmentScanState.NOT_ENROLLED } }),
    prisma.attendance.count({ where: { ...base, enrollmentStateAtScan: EnrollmentScanState.MODE_MISMATCH } }),
    prisma.attendance.count({ where: { ...base, paidAtScan: false } }),
  ]);

  const scannedBySession = new Map(scans.map((row) => [row.classSessionId, row._count._all]));
  const enrolledFor = (courseId: string, classType: ClassType | null): number =>
    enrollments.filter((row) => row.courseId === courseId && (classType === null || row.classType === classType)).reduce((sum, row) => sum + row._count._all, 0);

  return {
    date,
    sessions: sessions.map((s) => ({
      sessionId: s.id, title: s.title, courseName: s.course.name, startsAt: s.date, durationMinutes: s.durationMinutes, classType: s.classType,
      instituteName: s.timetableSlot?.institute?.name ?? null, scanned: scannedBySession.get(s.id) ?? 0, enrolled: enrolledFor(s.courseId, s.classType),
    })),
    flagged: { from, to: date, withoutEnrollment, onlineOnly, unpaid },
  };
};
