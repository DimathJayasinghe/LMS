import { Role, type Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { assertOwner } from '@/services/console-access';
import { orphanedCourseWhere } from '@/services/handover-dependencies.service';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { colomboDayOf } from '@/utils/org-time';
import type { AuthenticatedUser } from '@/types/auth.types';

const ROWS_SHOWN = 10;

export interface SetupClass {
  courseId: string;
  name: string;
  year: number;
  teacherName: string;
}

export interface SetupList {
  /** All of them, not only those listed. */
  count: number;
  rows: SetupClass[];
}

export interface SetupPanel {
  /** Active classes whose teacher left (deactivated, or moved to another role): students pay for a class nobody can run. */
  orphanedClasses: SetupList;
  /** Active classes from an earlier year than the current one. */
  oldBatches: SetupList;
  /** Active students the owner cannot send an SMS to. */
  studentsWithoutPhone: number;
}

const classes = async (where: Prisma.CourseWhereInput): Promise<SetupList> => {
  const [rows, count] = await Promise.all([
    prisma.course.findMany({
      where, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: ROWS_SHOWN,
      select: { id: true, name: true, year: true, teacher: { select: { name: true } } },
    }),
    prisma.course.count({ where }),
  ]);
  return { count, rows: rows.map((c) => ({ courseId: c.id, name: c.name, year: c.year, teacherName: c.teacher.name })) };
};

/** What is half set up or out of date: the setup problems an owner would otherwise find out about from a parent. */
export const getSetupPanel = async (actor: AuthenticatedUser): Promise<SetupPanel> => {
  assertOwner(actor);
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const year = Number(colomboDayOf(new Date(), timezone).slice(0, 4));

  const [orphanedClasses, oldBatches, studentsWithoutPhone] = await Promise.all([
    classes(orphanedCourseWhere(organizationId)),
    classes({ organizationId, isActive: true, year: { lt: year } }),
    prisma.user.count({ where: { organizationId, role: Role.STUDENT, deletedAt: null, OR: [{ phone: null }, { phone: '' }] } }),
  ]);
  return { orphanedClasses, oldBatches, studentsWithoutPhone };
};
