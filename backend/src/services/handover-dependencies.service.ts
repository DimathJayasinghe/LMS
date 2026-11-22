import { Role, type Prisma } from '@prisma/client';
import { prisma } from '@/config/database';

type Db = Pick<Prisma.TransactionClient, 'course' | 'classSession' | 'exam' | 'markerAssignment'>;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HandoverCourse {
  id: string;
  name: string;
  year: number;
  subjectName: string;
  isActive: boolean;
  /** Sessions starting between now and the look-ahead horizon. */
  upcomingSessions: number;
  /** Exams not deleted whose results are not published yet. */
  openExams: number;
}

export interface MarkerAllocation {
  examId: string;
  examTitle: string;
  courseName: string;
}

export interface HandoverDependencies {
  courses: HandoverCourse[];
  markerAllocations: MarkerAllocation[];
}

const countsByCourse = (rows: { courseId: string; _count: { _all: number } }[]): Map<string, number> =>
  new Map(rows.map((row) => [row.courseId, row._count._all]));

/**
 * Everything that still needs a person once this account stops teaching or marking: the classes it owns that are
 * running, have sessions coming up or have an exam waiting for results, and the exams it was allocated to mark. An ended
 * class with nothing pending stays with its teacher as the record of who taught it. Sessions, exams and marking follow a
 * class to its new teacher on their own because they belong to the class, not to the person.
 */
export const listHandoverDependencies = async (
  db: Db,
  userId: string,
  options: { lookaheadDays: number; now: Date },
): Promise<HandoverDependencies> => {
  const owned = await db.course.findMany({
    where: { teacherId: userId },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, year: true, isActive: true, subject: { select: { name: true } } },
  });

  const ids = owned.map((course) => course.id);
  const horizon = new Date(options.now.getTime() + options.lookaheadDays * DAY_MS);
  const [sessions, exams] = ids.length === 0
    ? [[], []]
    : await Promise.all([
        db.classSession.groupBy({ by: ['courseId'], where: { courseId: { in: ids }, deletedAt: null, date: { gte: options.now, lt: horizon } }, _count: { _all: true } }),
        db.exam.groupBy({ by: ['courseId'], where: { courseId: { in: ids }, deletedAt: null, isPublished: false }, _count: { _all: true } }),
      ]);
  const sessionCounts = countsByCourse(sessions);
  const examCounts = countsByCourse(exams);

  const courses = owned
    .map((course) => ({
      id: course.id,
      name: course.name,
      year: course.year,
      subjectName: course.subject.name,
      isActive: course.isActive,
      upcomingSessions: sessionCounts.get(course.id) ?? 0,
      openExams: examCounts.get(course.id) ?? 0,
    }))
    .filter((course) => course.isActive || course.upcomingSessions > 0 || course.openExams > 0);

  const allocations = await db.markerAssignment.findMany({
    where: { markerId: userId, exam: { deletedAt: null, isPublished: false } },
    select: { exam: { select: { id: true, title: true, course: { select: { name: true } } } } },
  });

  return {
    courses,
    markerAllocations: allocations.map(({ exam }) => ({ examId: exam.id, examTitle: exam.title, courseName: exam.course.name })),
  };
};

/** A teacher who can run a class: an active account that still holds the teacher role. */
export const workingTeacherWhere: Prisma.UserWhereInput = { deletedAt: null, role: Role.TEACHER };

/**
 * Active classes whose teacher left: deactivated, or moved to another role. One definition for the owner console count
 * and for the list the owner hands over from, so the two always agree; session generation uses the same working-teacher
 * clause, so a class on this list gets no new sessions until it is handed over.
 */
export const orphanedCourseWhere = (organizationId: string): Prisma.CourseWhereInput => ({
  organizationId,
  isActive: true,
  teacher: { NOT: workingTeacherWhere },
});

export interface OrphanedGroup {
  teacher: { id: string; name: string; role: Role; deactivated: boolean };
  courses: { id: string; name: string; year: number }[];
}

export const listOrphanedClasses = async (organizationId: string, db: Pick<Prisma.TransactionClient, 'course'> = prisma): Promise<OrphanedGroup[]> => {
  const rows = await db.course.findMany({
    where: orphanedCourseWhere(organizationId),
    orderBy: [{ teacher: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, year: true, teacher: { select: { id: true, name: true, role: true, deletedAt: true } } },
  });

  const groups = new Map<string, OrphanedGroup>();
  for (const row of rows) {
    const group = groups.get(row.teacher.id) ?? {
      teacher: { id: row.teacher.id, name: row.teacher.name, role: row.teacher.role, deactivated: row.teacher.deletedAt !== null },
      courses: [],
    };
    group.courses.push({ id: row.id, name: row.name, year: row.year });
    groups.set(row.teacher.id, group);
  }
  return [...groups.values()];
};
