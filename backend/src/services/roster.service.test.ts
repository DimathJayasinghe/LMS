import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AttendanceStatus, PaymentStatus, Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const m = vi.hoisted(() => ({
  enrollmentFindMany: vi.fn(), enrollmentCount: vi.fn(), sessionFindMany: vi.fn(), attendanceGroupBy: vi.fn(),
  assertCourseAccess: vi.fn(), clock: vi.fn(), settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => ({
  prisma: {
    enrollment: { findMany: m.enrollmentFindMany, count: m.enrollmentCount },
    classSession: { findMany: m.sessionFindMany },
    attendance: { groupBy: m.attendanceGroupBy },
  },
}));
vi.mock('@/services/class.service', () => ({ assertCourseAccess: m.assertCourseAccess }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));

import { listRoster } from './roster.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const desk = { userId: 'desk', role: Role.ADMIN };
const teacher = { userId: 'teacher', role: Role.TEACHER };
const row = (n: number, over: Record<string, unknown> = {}) => ({
  classType: 'PHYSICAL', createdAt: new Date(`2026-0${(n % 9) + 1}-05T05:00:00Z`),
  user: { id: `u${n}`, name: `Student ${n}`, indexNumber: 1000 + n },
  payments: [], ...over,
});
const sessions = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `s${i}` }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T06:00:00Z')); // 20 November, 11:30 in Colombo
  vi.resetAllMocks();
  m.assertCourseAccess.mockResolvedValue({ id: 'c1', teacherId: 'teacher' });
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.settings = { 'roster.showPaidState': true, 'roster.attendanceWindowSessions': 8, 'roster.pageSize': 100 };
  m.enrollmentFindMany.mockResolvedValue([row(1)]);
  m.enrollmentCount.mockResolvedValue(1);
  m.sessionFindMany.mockResolvedValue(sessions(3));
  m.attendanceGroupBy.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

const noQueries = () => {
  expect(m.clock).not.toHaveBeenCalled();
  expect(m.enrollmentFindMany).not.toHaveBeenCalled();
  expect(m.sessionFindMany).not.toHaveBeenCalled();
  expect(m.attendanceGroupBy).not.toHaveBeenCalled();
};

describe('listRoster — who may ask', () => {
  it.each([Role.MARKER, Role.STUDENT])('refuses %s before looking at the course', async (role) => {
    await expect(listRoster('c1', { userId: 'x', role }, 1)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.assertCourseAccess).not.toHaveBeenCalled();
    noQueries();
  });

  it.each([teacher, desk, owner])('hands the $role actor to the shared course check', async (actor) => {
    await listRoster('c1', actor, 1);
    expect(m.assertCourseAccess).toHaveBeenCalledWith('c1', actor);
    expect(m.enrollmentFindMany).toHaveBeenCalledTimes(1);
  });

  it('answers an unknown course with 404 and reads nothing else', async () => {
    m.assertCourseAccess.mockRejectedValue(new AppError('CLASS_NOT_FOUND', 404, 'Class (course) not found.'));
    await expect(listRoster('nope', teacher, 1)).rejects.toMatchObject({ code: 'CLASS_NOT_FOUND', statusCode: 404 });
    noQueries();
  });

  it("refuses a teacher for a colleague's class and reads nothing else", async () => {
    m.assertCourseAccess.mockRejectedValue(new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.'));
    await expect(listRoster('c2', teacher, 1)).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
    noQueries();
  });
});

describe('listRoster — which students and what is read about them', () => {
  it('lists active enrollments of active students in this organization, by name', async () => {
    await listRoster('c1', teacher, 1);
    const args = m.enrollmentFindMany.mock.calls[0]![0];
    expect(args.where).toEqual({ courseId: 'c1', organizationId: 'org', isActive: true, user: { deletedAt: null } });
    expect(args.orderBy).toEqual([{ user: { name: 'asc' } }, { id: 'asc' }]);
    expect(m.enrollmentCount).toHaveBeenCalledWith({ where: args.where });
  });

  it('reads only name, index number and id of the student', async () => {
    await listRoster('c1', teacher, 1);
    const { select } = m.enrollmentFindMany.mock.calls[0]![0];
    expect(select.user).toEqual({ select: { id: true, name: true, indexNumber: true } });
    expect(Object.keys(select).sort()).toEqual(['classType', 'createdAt', 'payments', 'user']);
  });

  it('returns exactly the allowed keys per row and nothing else', async () => {
    m.attendanceGroupBy.mockResolvedValue([{ userId: 'u1', _count: { _all: 2 } }]);
    m.enrollmentFindMany.mockResolvedValue([row(1, { payments: [{ id: 'p1' }] })]);
    const { data } = await listRoster('c1', teacher, 1);
    expect(Object.keys(data[0]!).sort()).toEqual(['attendedLastN', 'classType', 'enrolledAt', 'feeState', 'indexNumber', 'name', 'studentId']);
    expect(data[0]).toEqual({
      studentId: 'u1', name: 'Student 1', indexNumber: 1001, classType: 'PHYSICAL',
      enrolledAt: new Date('2026-02-05T05:00:00Z'), feeState: 'PAID', attendedLastN: { attended: 2, sessions: 3 },
    });
  });

  it('pages by the organization page size and reports the total', async () => {
    m.settings['roster.pageSize'] = 25;
    m.enrollmentCount.mockResolvedValue(61);
    const result = await listRoster('c1', teacher, 3);
    expect(m.enrollmentFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 25 }));
    expect(result).toMatchObject({ count: 61, page: 3, pageSize: 25 });
  });
});

describe('listRoster — fee state', () => {
  const paymentFilter = () => m.enrollmentFindMany.mock.calls[0]![0].select.payments;

  it('asks for a successful payment of the current Colombo month, one row at most', async () => {
    await listRoster('c1', teacher, 1);
    expect(paymentFilter()).toEqual({ where: { paymentMonth: '2026-11', status: PaymentStatus.SUCCESS }, select: { id: true }, take: 1 });
  });

  it('says NOT_PAID when there is no such payment and PAID when there is', async () => {
    m.enrollmentFindMany.mockResolvedValue([row(1), row(2, { payments: [{ id: 'p2' }] })]);
    const { data } = await listRoster('c1', teacher, 1);
    expect(data.map((r) => r.feeState)).toEqual(['NOT_PAID', 'PAID']);
  });

  it('counts the month in Colombo time: the last minute of November is still November', async () => {
    vi.setSystemTime(new Date('2026-11-30T18:29:59Z'));
    await listRoster('c1', teacher, 1);
    expect(paymentFilter().where.paymentMonth).toBe('2026-11');
  });

  it('counts the month in Colombo time: midnight on the 1st is already December', async () => {
    vi.setSystemTime(new Date('2026-11-30T18:30:00Z'));
    await listRoster('c1', teacher, 1);
    expect(paymentFilter().where.paymentMonth).toBe('2026-12');
  });

  it('leaves out the fee key and the payment read when the owner turns it off', async () => {
    m.settings['roster.showPaidState'] = false;
    m.enrollmentFindMany.mockResolvedValue([row(1)]);
    const { data } = await listRoster('c1', teacher, 1);
    expect(data[0]).not.toHaveProperty('feeState');
    expect(Object.keys(m.enrollmentFindMany.mock.calls[0]![0].select).sort()).toEqual(['classType', 'createdAt', 'user']);
  });
});

describe('listRoster — attendance over the last sessions', () => {
  it('takes the most recent held, undeleted sessions of this class', async () => {
    m.settings['roster.attendanceWindowSessions'] = 5;
    await listRoster('c1', teacher, 1);
    expect(m.sessionFindMany).toHaveBeenCalledWith({
      where: { courseId: 'c1', deletedAt: null, date: { lte: new Date('2026-11-20T06:00:00Z') } },
      orderBy: { date: 'desc' }, take: 5, select: { id: true },
    });
  });

  it('counts present or late, not voided, for the students on the page only', async () => {
    m.enrollmentFindMany.mockResolvedValue([row(1), row(2)]);
    await listRoster('c1', teacher, 1);
    expect(m.attendanceGroupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: {
        classSessionId: { in: ['s0', 's1', 's2'] }, userId: { in: ['u1', 'u2'] }, voidedAt: null,
        status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
      },
      _count: { _all: true },
    });
  });

  it('gives a student with no rows zero out of the sessions held', async () => {
    m.enrollmentFindMany.mockResolvedValue([row(1), row(2)]);
    m.attendanceGroupBy.mockResolvedValue([{ userId: 'u2', _count: { _all: 3 } }]);
    const { data } = await listRoster('c1', teacher, 1);
    expect(data.map((r) => r.attendedLastN)).toEqual([{ attended: 0, sessions: 3 }, { attended: 3, sessions: 3 }]);
  });

  it('reports fewer sessions than the window when the class has held fewer', async () => {
    m.sessionFindMany.mockResolvedValue(sessions(2));
    const { data } = await listRoster('c1', teacher, 1);
    expect(data[0]!.attendedLastN.sessions).toBe(2);
  });

  it('skips the attendance read when no session has been held yet', async () => {
    m.sessionFindMany.mockResolvedValue([]);
    const { data } = await listRoster('c1', teacher, 1);
    expect(m.attendanceGroupBy).not.toHaveBeenCalled();
    expect(data[0]!.attendedLastN).toEqual({ attended: 0, sessions: 0 });
  });

  it('skips the session and attendance reads when the class has no students', async () => {
    m.enrollmentFindMany.mockResolvedValue([]);
    m.enrollmentCount.mockResolvedValue(0);
    const result = await listRoster('c1', teacher, 1);
    expect(m.sessionFindMany).not.toHaveBeenCalled();
    expect(m.attendanceGroupBy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ data: [], count: 0 });
  });
});

describe('listRoster — query count', () => {
  it('does not read more per student: 100 rows cost the same as 1', async () => {
    m.enrollmentFindMany.mockResolvedValue(Array.from({ length: 100 }, (_, i) => row(i)));
    await listRoster('c1', teacher, 1);
    expect(m.enrollmentFindMany).toHaveBeenCalledTimes(1);
    expect(m.enrollmentCount).toHaveBeenCalledTimes(1);
    expect(m.sessionFindMany).toHaveBeenCalledTimes(1);
    expect(m.attendanceGroupBy).toHaveBeenCalledTimes(1);
  });
});
