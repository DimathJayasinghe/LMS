import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  days: vi.fn(), tallies: vi.fn(), report: vi.fn(), byCourse: vi.fn(), students: vi.fn(), clock: vi.fn(), settings: {} as Record<string, unknown>,
}));

vi.mock('@/services/cash-list.service', () => ({ listCashDays: m.days, listCashTallies: m.tallies, CASH_MAX_RANGE_DAYS: 92 }));
vi.mock('@/services/payment.service', () => ({ getFinancialReport: m.report }));
vi.mock('@/services/outstanding.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/outstanding.service')>()), owingByCourse: m.byCourse, owingStudents: m.students,
}));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));
vi.mock('@/config/database', () => ({ prisma: {} }));

import { getCashPanel, getOwingPanel } from './console.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const others = [Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT].map((role) => ({ userId: 'x', role }));
const row = (over: Record<string, unknown> = {}) => ({
  day: '2026-11-20', collectorId: 'c1', collectorName: 'Desk One', instituteId: 'i1', instituteName: 'Nugegoda',
  amount: '4500.00', paymentCount: 3, tally: null, ...over,
});
const counted = (flagged: boolean, reconciledAt: Date | null = null) => ({ id: 't', flagged, reconciledAt });
const course = (courseId: string, name: string, count: number, expected: string) => ({ courseId, name, count, expected });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T06:00:00Z')); // 20 November, 11:30 in Colombo
  vi.resetAllMocks();
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.settings = { 'console.lookbackDays': 30 };
  m.days.mockResolvedValue({ from: '2026-11-20', to: '2026-11-20', tallyEnabled: true, data: [], count: 0 });
  m.tallies.mockResolvedValue({ from: '2026-10-21', to: '2026-11-19', tallyEnabled: true, data: [], count: 0 });
  m.report.mockResolvedValue({ month: '2026-11', byMethod: [] });
  m.byCourse.mockResolvedValue([]);
  m.students.mockResolvedValue(0);
});
afterEach(() => vi.useRealTimers());

describe.each([['cash', () => getCashPanel], ['owing', () => getOwingPanel]] as const)('the %s panel is for the owner only', (_name, panel) => {
  it.each(others)('refuses $role with 403 and reads nothing', async (actor) => {
    await expect(panel()(actor as never, {})).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.days).not.toHaveBeenCalled();
    expect(m.byCourse).not.toHaveBeenCalled();
  });

  it('checks the role before the date, so a refused caller learns nothing about the query', async () => {
    await expect(panel()(others[0] as never, { date: '2099-01-01', month: '2099-01' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('getCashPanel', () => {
  it('answers zeros and empty lists on an empty database', async () => {
    await expect(getCashPanel(owner as never, {})).resolves.toEqual({
      date: '2026-11-20', tallyEnabled: true, collectedTotal: '0.00', paymentCount: 0, rows: [], flagged: [],
      unreconciled: { count: 0, rows: [], from: '2026-10-21', to: '2026-11-19' }, month: { month: '2026-11', byMethod: [] },
    });
  });

  it("reads today's Colombo day, the older counts before it, and the month of that day", async () => {
    await getCashPanel(owner as never, {});
    expect(m.days).toHaveBeenCalledWith(owner, { from: '2026-11-20', to: '2026-11-20' });
    expect(m.tallies).toHaveBeenCalledWith(owner, { from: '2026-10-21', to: '2026-11-19', unreconciled: true });
    expect(m.report).toHaveBeenCalledWith('2026-11', {}, owner);
  });

  it('uses the day asked for, and the month of that day', async () => {
    await getCashPanel(owner as never, { date: '2026-10-05' });
    expect(m.days).toHaveBeenCalledWith(owner, { from: '2026-10-05', to: '2026-10-05' });
    expect(m.tallies).toHaveBeenCalledWith(owner, { from: '2026-09-05', to: '2026-10-04', unreconciled: true });
    expect(m.report).toHaveBeenCalledWith('2026-10', {}, owner);
  });

  it('never asks the cash list for more days than it allows', async () => {
    m.settings['console.lookbackDays'] = 3650;
    await getCashPanel(owner as never, {});
    expect(m.tallies).toHaveBeenCalledWith(owner, { from: '2026-08-20', to: '2026-11-19', unreconciled: true });
  });

  it('asks for a window the cash list accepts, judged by its real rule and limit', async () => {
    const { CASH_MAX_RANGE_DAYS } = await vi.importActual<typeof import('@/services/cash-list.service')>('@/services/cash-list.service');
    const { daysBetween } = await import('@/utils/org-time');
    m.settings['console.lookbackDays'] = 3650;
    await getCashPanel(owner as never, {});
    const [, { from, to }] = m.tallies.mock.calls[0] as [unknown, { from: string; to: string }];
    expect(daysBetween(from, to)).toBeLessThanOrEqual(CASH_MAX_RANGE_DAYS);
    expect(CASH_MAX_RANGE_DAYS).toBe(92);
  });

  it('refuses a day that has not happened yet, without reading anything', async () => {
    await expect(getCashPanel(owner as never, { date: '2026-11-21' })).rejects.toMatchObject({ code: 'DAY_IN_FUTURE', statusCode: 400 });
    expect(m.days).not.toHaveBeenCalled();
  });

  it('totals what the underlying rows say, to the cent', async () => {
    m.days.mockResolvedValue({
      from: '2026-11-20', to: '2026-11-20', tallyEnabled: true, count: 2,
      data: [row({ amount: '4500.10', paymentCount: 3 }), row({ collectorId: 'c2', amount: '0.20', paymentCount: 1 })],
    });
    const panel = await getCashPanel(owner as never, {});
    expect(panel.collectedTotal).toBe('4500.30');
    expect(panel.paymentCount).toBe(4);
    expect(panel.rows).toHaveLength(2);
  });

  it('lists the flagged counts of today and of the older days still waiting, and counts them apart', async () => {
    const flaggedToday = row({ collectorId: 'c2', tally: counted(true) });
    const olderFlagged = row({ day: '2026-11-18', tally: counted(true) });
    const olderClean = row({ day: '2026-11-17', tally: counted(false) });
    m.days.mockResolvedValue({ from: '', to: '', tallyEnabled: true, count: 2, data: [row({ tally: counted(false) }), flaggedToday] });
    m.tallies.mockResolvedValue({ from: '', to: '', tallyEnabled: true, count: 2, data: [olderFlagged, olderClean] });
    const panel = await getCashPanel(owner as never, {});
    expect(panel.flagged).toEqual([flaggedToday, olderFlagged]);
    expect(panel.unreconciled.count).toBe(2);
    expect(panel.unreconciled.rows).toEqual([olderFlagged, olderClean]);
  });

  it('does not flag a count the owner has already reconciled', async () => {
    const reconciledToday = row({ tally: counted(true, new Date('2026-11-20T08:00:00Z')) });
    const stillOpen = row({ collectorId: 'c2', tally: counted(true) });
    m.days.mockResolvedValue({ from: '', to: '', tallyEnabled: true, count: 2, data: [reconciledToday, stillOpen] });
    const panel = await getCashPanel(owner as never, {});
    expect(panel.flagged).toEqual([stillOpen]);
    expect(panel.rows).toEqual([reconciledToday, stillOpen]);
  });

  it('hands back the window the waiting days were counted over, so a link can open exactly that queue', async () => {
    m.tallies.mockResolvedValue({ from: '2026-10-21', to: '2026-11-19', tallyEnabled: true, count: 0, data: [] });
    const panel = await getCashPanel(owner as never, {});
    expect(panel.unreconciled).toMatchObject({ from: '2026-10-21', to: '2026-11-19' });
  });

  it('shows the newest 20 waiting days and the true total', async () => {
    const many = Array.from({ length: 25 }, (_, i) => row({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, tally: counted(false) }));
    m.tallies.mockResolvedValue({ from: '', to: '', tallyEnabled: true, count: 25, data: many });
    const panel = await getCashPanel(owner as never, {});
    expect(panel.unreconciled.count).toBe(25);
    expect(panel.unreconciled.rows).toEqual(many.slice(0, 20));
  });

  it('passes the month totals by method through untouched', async () => {
    const byMethod = [{ method: 'ENTRANCE', collected: '90000.00', paidCount: 60 }, { method: 'ONLINE', collected: '30000.00', paidCount: 20 }];
    m.report.mockResolvedValue({ month: '2026-11', byMethod });
    await expect((await getCashPanel(owner as never, {})).month).toEqual({ month: '2026-11', byMethod });
  });

  it('keeps the tally switch of the underlying list so the screen can hide counts', async () => {
    m.days.mockResolvedValue({ from: '', to: '', tallyEnabled: false, count: 0, data: [] });
    await expect(getCashPanel(owner as never, {})).resolves.toMatchObject({ tallyEnabled: false });
  });
});

describe('getOwingPanel', () => {
  it('answers zeros on an empty database', async () => {
    await expect(getOwingPanel(owner as never, {})).resolves.toEqual({ month: '2026-11', students: 0, amount: '0.00', courses: [], otherCourses: 0 });
  });

  it('counts students, not enrollments: one who owes two classes is one student', async () => {
    m.byCourse.mockResolvedValue([course('c1', 'Physics', 3, '4500.00'), course('c2', 'Chemistry', 3, '6000.00')]);
    m.students.mockResolvedValue(4);
    const panel = await getOwingPanel(owner as never, {});
    expect(panel.students).toBe(4);
    expect(m.students).toHaveBeenCalledWith({ organizationId: 'org', timezone: 'Asia/Colombo', month: '2026-11' });
  });

  it('reads the current Colombo month through the one owing definition', async () => {
    await getOwingPanel(owner as never, {});
    expect(m.byCourse).toHaveBeenCalledWith({ organizationId: 'org', timezone: 'Asia/Colombo', month: '2026-11' });
  });

  it('refuses a month that has not started', async () => {
    await expect(getOwingPanel(owner as never, { month: '2026-12' })).rejects.toMatchObject({ code: 'MONTH_IN_FUTURE', statusCode: 400 });
    expect(m.byCourse).not.toHaveBeenCalled();
  });

  it('totals the amount over every course, lists the five owing most, and counts the rest', async () => {
    m.byCourse.mockResolvedValue([
      course('c1', 'Physics', 3, '4500.00'), course('c2', 'Chemistry', 2, '3000.50'), course('c3', 'Maths', 1, '1200.00'),
      course('c4', 'Biology', 4, '8000.00'), course('c5', 'English', 1, '500.00'), course('c6', 'Art', 1, '400.00'), course('c7', 'Music', 1, '300.25'),
    ]);
    m.students.mockResolvedValue(11);
    const panel = await getOwingPanel(owner as never, { month: '2026-10' });
    expect(panel.month).toBe('2026-10');
    expect(panel.students).toBe(11);
    expect(panel.amount).toBe('17900.75');
    expect(panel.courses.map((c) => c.courseId)).toEqual(['c4', 'c1', 'c2', 'c3', 'c5']);
    expect(panel.otherCourses).toBe(2);
  });

  it('breaks a tie in the amount by course name so the order never flickers', async () => {
    m.byCourse.mockResolvedValue([course('c2', 'Zoology', 1, '1000.00'), course('c1', 'Art', 1, '1000.00')]);
    expect((await getOwingPanel(owner as never, {})).courses.map((c) => c.name)).toEqual(['Art', 'Zoology']);
  });
});
