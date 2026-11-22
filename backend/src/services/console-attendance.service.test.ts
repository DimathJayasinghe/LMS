import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceStatus, ClassType, EnrollmentScanState, Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  sessionFindMany: vi.fn(), attendanceGroupBy: vi.fn(), attendanceCount: vi.fn(), enrollmentGroupBy: vi.fn(),
  clock: vi.fn(), settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => ({
  prisma: {
    classSession: { findMany: m.sessionFindMany },
    attendance: { groupBy: m.attendanceGroupBy, count: m.attendanceCount },
    enrollment: { groupBy: m.enrollmentGroupBy },
  },
}));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));

import { getAttendancePanel } from './console-attendance.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const session = (id: string, courseId: string, over: Record<string, unknown> = {}) => ({
  id, title: `Class ${id}`, date: new Date('2026-11-20T03:30:00Z'), durationMinutes: 90, classType: null, courseId,
  course: { name: `Course ${courseId}` }, timetableSlot: { institute: { name: 'Kandy Branch' } }, ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T06:00:00Z')); // 20 November, 11:30 in Colombo
  vi.resetAllMocks();
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.settings = { 'console.lookbackDays': 30 };
  m.sessionFindMany.mockResolvedValue([]);
  m.attendanceGroupBy.mockResolvedValue([]);
  m.attendanceCount.mockResolvedValue(0);
  m.enrollmentGroupBy.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('getAttendancePanel', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before reading anything', async (role) => {
    await expect(getAttendancePanel({ userId: 'x', role } as never)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.sessionFindMany).not.toHaveBeenCalled();
  });

  it('reads the sessions of the Colombo day, not the UTC day, in this organization', async () => {
    vi.setSystemTime(new Date('2026-11-19T20:00:00Z')); // 20 November, 01:30 in Colombo
    const panel = await getAttendancePanel(owner as never);
    expect(panel.date).toBe('2026-11-20');
    expect(m.sessionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org', deletedAt: null, date: { gte: new Date('2026-11-19T18:30:00Z'), lt: new Date('2026-11-20T18:30:00Z') } },
      orderBy: { date: 'asc' },
    }));
  });

  it('answers no sessions and does not ask about scans or enrollments for them', async () => {
    const panel = await getAttendancePanel(owner as never);
    expect(panel.sessions).toEqual([]);
    expect(m.attendanceGroupBy).not.toHaveBeenCalled();
    expect(m.enrollmentGroupBy).not.toHaveBeenCalled();
  });

  it('counts scans per session the way the class roster counts attendance: present or late, not voided', async () => {
    m.sessionFindMany.mockResolvedValue([session('s1', 'c1'), session('s2', 'c1')]);
    m.attendanceGroupBy.mockResolvedValue([{ classSessionId: 's1', _count: { _all: 12 } }]);
    const panel = await getAttendancePanel(owner as never);
    expect(m.attendanceGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['classSessionId'], where: { classSessionId: { in: ['s1', 's2'] }, voidedAt: null, status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] } },
    }));
    expect(panel.sessions.map((s) => [s.sessionId, s.scanned])).toEqual([['s1', 12], ['s2', 0]]);
  });

  it('counts enrolled students for the session mode: every mode when the session is for all, one when it is not', async () => {
    m.sessionFindMany.mockResolvedValue([
      session('s1', 'c1'), session('s2', 'c1', { classType: ClassType.PHYSICAL }), session('s3', 'c1', { classType: ClassType.ONLINE }),
    ]);
    m.enrollmentGroupBy.mockResolvedValue([
      { courseId: 'c1', classType: ClassType.PHYSICAL, _count: { _all: 30 } },
      { courseId: 'c1', classType: ClassType.ONLINE, _count: { _all: 8 } },
    ]);
    const panel = await getAttendancePanel(owner as never);
    expect(m.enrollmentGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['courseId', 'classType'], where: { courseId: { in: ['c1'] }, isActive: true, user: { deletedAt: null } },
    }));
    expect(panel.sessions.map((s) => s.enrolled)).toEqual([38, 30, 8]);
  });

  it('shows the branch of the timetable slot, or none for a class set up by hand', async () => {
    m.sessionFindMany.mockResolvedValue([session('s1', 'c1'), session('s2', 'c1', { timetableSlot: null }), session('s3', 'c1', { timetableSlot: { institute: null } })]);
    const panel = await getAttendancePanel(owner as never);
    expect(panel.sessions.map((s) => s.instituteName)).toEqual(['Kandy Branch', null, null]);
  });

  it('describes each session with course, start, length and mode', async () => {
    m.sessionFindMany.mockResolvedValue([session('s1', 'c1', { classType: ClassType.ONLINE })]);
    const panel = await getAttendancePanel(owner as never);
    expect(panel.sessions[0]).toEqual({
      sessionId: 's1', title: 'Class s1', courseName: 'Course c1', startsAt: new Date('2026-11-20T03:30:00Z'),
      durationMinutes: 90, classType: ClassType.ONLINE, instituteName: 'Kandy Branch', scanned: 0, enrolled: 0,
    });
  });

  describe('the warning counts', () => {
    it('look back over the lookback days up to the end of today, ignoring voided scans', async () => {
      m.settings['console.lookbackDays'] = 7;
      const panel = await getAttendancePanel(owner as never);
      const window = { gte: new Date('2026-11-13T18:30:00Z'), lt: new Date('2026-11-20T18:30:00Z') };
      expect(panel.flagged).toMatchObject({ from: '2026-11-14', to: '2026-11-20' });
      const wheres = m.attendanceCount.mock.calls.map((call) => call[0].where);
      expect(wheres).toEqual([
        { organizationId: 'org', voidedAt: null, scannedAt: window, enrollmentStateAtScan: EnrollmentScanState.NOT_ENROLLED },
        { organizationId: 'org', voidedAt: null, scannedAt: window, enrollmentStateAtScan: EnrollmentScanState.MODE_MISMATCH },
        { organizationId: 'org', voidedAt: null, scannedAt: window, paidAtScan: false },
      ]);
    });

    it('report scans without enrollment, online-only scans at the door, and scans without a paid month', async () => {
      m.attendanceCount.mockResolvedValueOnce(4).mockResolvedValueOnce(2).mockResolvedValueOnce(9);
      const panel = await getAttendancePanel(owner as never);
      expect(panel.flagged).toEqual({ from: '2026-10-22', to: '2026-11-20', withoutEnrollment: 4, onlineOnly: 2, unpaid: 9 });
    });

    it('are still answered on a day with no class', async () => {
      m.attendanceCount.mockResolvedValue(1);
      const panel = await getAttendancePanel(owner as never);
      expect(panel.sessions).toEqual([]);
      expect(panel.flagged.withoutEnrollment).toBe(1);
    });
  });
});
