import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const db = vi.hoisted(() => ({
  course: { findMany: vi.fn() },
  classSession: { groupBy: vi.fn() },
  exam: { groupBy: vi.fn() },
  markerAssignment: { findMany: vi.fn() },
}));
vi.mock('@/config/database', () => ({ prisma: db }));

import { listHandoverDependencies, listOrphanedClasses, orphanedCourseWhere } from './handover-dependencies.service';

const NOW = new Date('2026-11-22T10:00:00.000Z');
const course = (id: string, isActive: boolean) => ({ id, name: `Course ${id}`, year: 2026, isActive, subject: { name: 'Physics' } });
const lookup = (userId = 'leaver') => listHandoverDependencies(db as never, userId, { lookaheadDays: 14, now: NOW });

beforeEach(() => {
  vi.clearAllMocks();
  db.course.findMany.mockResolvedValue([]);
  db.classSession.groupBy.mockResolvedValue([]);
  db.exam.groupBy.mockResolvedValue([]);
  db.markerAssignment.findMany.mockResolvedValue([]);
});

describe('listHandoverDependencies — teacher side', () => {
  it('lists every active class, with its sessions in the look-ahead window and its open exams', async () => {
    db.course.findMany.mockResolvedValue([course('a', true), course('b', true)]);
    db.classSession.groupBy.mockResolvedValue([{ courseId: 'a', _count: { _all: 3 } }]);
    db.exam.groupBy.mockResolvedValue([{ courseId: 'b', _count: { _all: 1 } }]);

    const result = await lookup();

    expect(result.courses).toEqual([
      { id: 'a', name: 'Course a', year: 2026, subjectName: 'Physics', isActive: true, upcomingSessions: 3, openExams: 0 },
      { id: 'b', name: 'Course b', year: 2026, subjectName: 'Physics', isActive: true, upcomingSessions: 0, openExams: 1 },
    ]);
  });

  it('looks only forward by the configured number of days and ignores deleted sessions and exams', async () => {
    db.course.findMany.mockResolvedValue([course('a', true)]);
    await lookup();

    const sessionWhere = db.classSession.groupBy.mock.calls[0]![0].where;
    expect(sessionWhere).toMatchObject({ courseId: { in: ['a'] }, deletedAt: null });
    expect(sessionWhere.date.gte).toEqual(NOW);
    expect(sessionWhere.date.lt).toEqual(new Date('2026-12-06T10:00:00.000Z'));
    expect(db.exam.groupBy.mock.calls[0]![0].where).toMatchObject({ courseId: { in: ['a'] }, deletedAt: null, isPublished: false });
  });

  it('leaves an ended class with nothing pending where it is, as history', async () => {
    db.course.findMany.mockResolvedValue([course('done', false), course('pending-session', false), course('pending-exam', false)]);
    db.classSession.groupBy.mockResolvedValue([{ courseId: 'pending-session', _count: { _all: 1 } }]);
    db.exam.groupBy.mockResolvedValue([{ courseId: 'pending-exam', _count: { _all: 2 } }]);

    const ids = (await lookup()).courses.map((c) => c.id);

    expect(ids).toEqual(['pending-session', 'pending-exam']);
  });

  it('answers empty for an account that owns nothing without counting anything', async () => {
    const result = await lookup();
    expect(result).toEqual({ courses: [], markerAllocations: [] });
    expect(db.classSession.groupBy).not.toHaveBeenCalled();
    expect(db.exam.groupBy).not.toHaveBeenCalled();
  });
});

describe('listHandoverDependencies — marker side', () => {
  it('lists allocations on exams whose results are not published yet', async () => {
    db.markerAssignment.findMany.mockResolvedValue([{ exam: { id: 'e1', title: 'Term test', course: { name: 'Physics 2026' } } }]);

    const result = await lookup('marker');

    expect(result.markerAllocations).toEqual([{ examId: 'e1', examTitle: 'Term test', courseName: 'Physics 2026' }]);
    expect(db.markerAssignment.findMany.mock.calls[0]![0].where).toEqual({ markerId: 'marker', exam: { deletedAt: null, isPublished: false } });
  });
});

describe('orphaned classes', () => {
  it('scopes to the organization and treats a deactivated or re-roled owner as nobody to run the class', () => {
    expect(orphanedCourseWhere('org-1')).toEqual({
      organizationId: 'org-1',
      isActive: true,
      teacher: { OR: [{ deletedAt: { not: null } }, { role: { not: Role.TEACHER } }] },
    });
  });

  it('groups the classes by the teacher who left', async () => {
    db.course.findMany.mockResolvedValue([
      { id: 'a', name: 'Physics', year: 2026, teacher: { id: 't1', name: 'Ms Perera', role: Role.TEACHER, deletedAt: new Date('2026-11-01') } },
      { id: 'b', name: 'Chemistry', year: 2026, teacher: { id: 't1', name: 'Ms Perera', role: Role.TEACHER, deletedAt: new Date('2026-11-01') } },
      { id: 'c', name: 'Maths', year: 2026, teacher: { id: 't2', name: 'Mr Silva', role: Role.MARKER, deletedAt: null } },
    ]);

    const groups = await listOrphanedClasses('org-1', db as never);

    expect(groups).toEqual([
      { teacher: { id: 't1', name: 'Ms Perera', deactivated: true, role: Role.TEACHER }, courses: [{ id: 'a', name: 'Physics', year: 2026 }, { id: 'b', name: 'Chemistry', year: 2026 }] },
      { teacher: { id: 't2', name: 'Mr Silva', deactivated: false, role: Role.MARKER }, courses: [{ id: 'c', name: 'Maths', year: 2026 }] },
    ]);
  });
});
