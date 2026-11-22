import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, SubmissionSource, SubmissionStatus } from '@prisma/client';

const m = vi.hoisted(() => ({
  examFindMany: vi.fn(), examCount: vi.fn(), groupBy: vi.fn(), clock: vi.fn(), settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => ({ prisma: { exam: { findMany: m.examFindMany, count: m.examCount }, submission: { groupBy: m.groupBy } } }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));

import { getMarkingPanel } from './console-marking.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const exam = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Paper ${id}`, type: 'HYBRID', endTime: new Date('2026-11-19T10:00:00Z'), course: { name: 'Physics' }, ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T06:00:00Z'));
  vi.resetAllMocks();
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.settings = { 'console.lookbackDays': 30 };
  m.examFindMany.mockResolvedValue([]);
  m.examCount.mockResolvedValue(0);
  m.groupBy.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('getMarkingPanel', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before reading anything', async (role) => {
    await expect(getMarkingPanel({ userId: 'x', role } as never)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.examFindMany).not.toHaveBeenCalled();
  });

  it('reads the exams that ended inside the lookback and are not published, newest first, in this organization', async () => {
    await getMarkingPanel(owner as never);
    const where = {
      organizationId: 'org', deletedAt: null, isPublished: false,
      endTime: { gte: new Date('2026-10-21T06:00:00Z'), lt: new Date('2026-11-20T06:00:00Z') },
    };
    expect(m.examFindMany).toHaveBeenCalledWith(expect.objectContaining({ where, orderBy: { endTime: 'desc' }, take: 20 }));
    expect(m.examCount).toHaveBeenCalledWith({ where });
  });

  it('follows the owner lookback setting', async () => {
    m.settings['console.lookbackDays'] = 7;
    const panel = await getMarkingPanel(owner as never);
    expect(m.examFindMany.mock.calls[0]![0].where.endTime.gte).toEqual(new Date('2026-11-13T06:00:00Z'));
    expect(panel.lookbackDays).toBe(7);
  });

  it('answers empty without asking about submissions when no exam is waiting', async () => {
    await expect(getMarkingPanel(owner as never)).resolves.toEqual({ lookbackDays: 30, total: 0, exams: [] });
    expect(m.groupBy).not.toHaveBeenCalled();
  });

  it('counts submitted, graded, ungraded, incomplete and hall-entered per exam', async () => {
    m.examFindMany.mockResolvedValue([exam('e1'), exam('e2', { type: 'MCQ', course: { name: 'Chemistry' } })]);
    m.examCount.mockResolvedValue(2);
    m.groupBy
      .mockResolvedValueOnce([
        { examId: 'e1', status: SubmissionStatus.COMPLETED, _count: { _all: 10 } },
        { examId: 'e1', status: SubmissionStatus.UPLOADING, _count: { _all: 2 } },
        { examId: 'e2', status: SubmissionStatus.COMPLETED, _count: { _all: 4 } },
      ])
      .mockResolvedValueOnce([{ examId: 'e1', _count: { _all: 6 } }])
      .mockResolvedValueOnce([{ examId: 'e1', _count: { _all: 3 } }]);
    const panel = await getMarkingPanel(owner as never);
    expect(panel.exams).toEqual([
      { examId: 'e1', title: 'Paper e1', courseName: 'Physics', type: 'HYBRID', endedAt: new Date('2026-11-19T10:00:00Z'), submitted: 10, graded: 4, ungraded: 6, incomplete: 2, hall: 3 },
      { examId: 'e2', title: 'Paper e2', courseName: 'Chemistry', type: 'MCQ', endedAt: new Date('2026-11-19T10:00:00Z'), submitted: 4, graded: 4, ungraded: 0, incomplete: 0, hall: 0 },
    ]);
    expect(panel.total).toBe(2);
  });

  it('asks the three counts only about the exams it lists, and only about finished work for ungraded and hall', async () => {
    m.examFindMany.mockResolvedValue([exam('e1')]);
    await getMarkingPanel(owner as never);
    const [all, ungraded, hall] = m.groupBy.mock.calls.map((call) => call[0]);
    expect(all).toMatchObject({ by: ['examId', 'status'], where: { examId: { in: ['e1'] } } });
    expect(ungraded).toMatchObject({ by: ['examId'], where: { examId: { in: ['e1'] }, status: SubmissionStatus.COMPLETED, marks: null } });
    expect(hall).toMatchObject({ by: ['examId'], where: { examId: { in: ['e1'] }, status: SubmissionStatus.COMPLETED, source: SubmissionSource.HALL } });
  });

  it('keeps the true total when more exams wait than are listed', async () => {
    m.examFindMany.mockResolvedValue([exam('e1')]);
    m.examCount.mockResolvedValue(37);
    await expect(getMarkingPanel(owner as never)).resolves.toMatchObject({ total: 37, exams: [expect.objectContaining({ examId: 'e1' })] });
  });
});
