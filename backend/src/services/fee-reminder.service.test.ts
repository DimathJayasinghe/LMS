import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationType, Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  enrollmentFindMany: vi.fn(), groupBy: vi.fn(), clock: vi.fn(), describe: vi.fn(), dispatch: vi.fn(), audit: vi.fn(), lock: vi.fn(),
  order: [] as string[], settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => ({
  prisma: {
    enrollment: { findMany: m.enrollmentFindMany },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ notification: { groupBy: m.groupBy } }),
  },
}));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));
vi.mock('@/services/outstanding-rows.service', () => ({ describeOutstanding: m.describe, outstandingEnrollmentSelect: { id: true } }));
vi.mock('@/services/notification.service', () => ({ dispatch: m.dispatch }));
vi.mock('@/services/audit.service', () => ({ logInTransaction: m.audit }));
vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: m.lock }));

import { sendFeeReminders } from './fee-reminder.service';

const desk = { userId: 'desk', role: Role.ADMIN };
const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const ctx = { actorId: 'desk', actorRole: 'ADMIN', ip: '10.0.0.1', userAgent: 'test' };
const row = (enrollmentId: string, studentId: string, courseName: string, over: Record<string, unknown> = {}) => ({
  enrollmentId, studentId, studentName: `Name ${studentId}`, indexNumber: 1, phone: '0771234567', courseId: 'c1', courseName,
  classType: 'PHYSICAL', monthsOwed: 1, amount: '1500.00', totalOwed: '1500.00', inGrace: false, graceUntil: null, ...over,
});
const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const E3 = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T06:00:00Z')); // 20 November in Colombo
  vi.resetAllMocks();
  m.order.length = 0;
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.settings = { 'fees.reminderFromDay': 11, 'fees.reminderMaxPerStudentPerMonth': 1 };
  m.enrollmentFindMany.mockResolvedValue([]);
  m.describe.mockResolvedValue([]);
  m.groupBy.mockImplementation(async () => { m.order.push('count'); return []; });
  m.lock.mockImplementation(async () => { m.order.push('lock'); });
  m.dispatch.mockImplementation(async () => { m.order.push('dispatch'); });
  m.audit.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

const withRows = (rows: ReturnType<typeof row>[], found: string[] = rows.map((r) => r.enrollmentId)) => {
  // The owing query carries an AND of the shared filter; the existence check does not.
  m.enrollmentFindMany.mockImplementation(async (args: { where: { AND?: unknown } }) => (args.where.AND ? rows.map((r) => ({ id: r.enrollmentId })) : found.map((id) => ({ id }))));
  m.describe.mockResolvedValue(rows);
};

describe('who may send', () => {
  it.each([Role.ADMIN, Role.SUPER_ADMIN])('lets %s send', async (role) => {
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, { userId: 'a', role }, ctx)).resolves.toEqual({ sent: 0, skipped: [] });
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before any lookup', async (role) => {
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, { userId: 'a', role }, ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.dispatch).not.toHaveBeenCalled();
  });
});

describe('when reminders may go out', () => {
  it('refuses before the owner-set day of the month, naming the day', async () => {
    vi.setSystemTime(new Date('2026-11-10T06:00:00Z'));
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx)).rejects.toMatchObject({ code: 'REMINDER_TOO_EARLY', statusCode: 409, message: expect.stringContaining('11') });
    expect(m.dispatch).not.toHaveBeenCalled();
    expect(m.lock).not.toHaveBeenCalled();
  });

  it('allows the first allowed day itself', async () => {
    vi.setSystemTime(new Date('2026-11-11T06:00:00Z'));
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx)).resolves.toBeTruthy();
  });

  it('counts the day in Colombo, not UTC', async () => {
    vi.setSystemTime(new Date('2026-11-10T19:00:00Z')); // already 11 November in Colombo
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx)).resolves.toBeTruthy();
  });

  it('is off when the owner sets the monthly cap to zero', async () => {
    m.settings['fees.reminderMaxPerStudentPerMonth'] = 0;
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx)).rejects.toMatchObject({ code: 'REMINDERS_DISABLED', statusCode: 409 });
  });

  it('refuses a month that has not started, before anything is read', async () => {
    await expect(sendFeeReminders({ month: '2026-12', courseId: 'c1' }, desk, ctx)).rejects.toMatchObject({ code: 'MONTH_IN_FUTURE', statusCode: 400 });
    expect(m.enrollmentFindMany).not.toHaveBeenCalled();
  });
});

describe('the selection', () => {
  it('answers 404 and sends nothing when a chosen enrollment is not in the course or the organization', async () => {
    withRows([row(E1, 's1', 'Physics')], [E1]);
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1', enrollmentIds: [E1, E2] }, desk, ctx)).rejects.toMatchObject({ code: 'ENROLLMENT_NOT_FOUND', statusCode: 404 });
    expect(m.dispatch).not.toHaveBeenCalled();
    expect(m.lock).not.toHaveBeenCalled();
    const lookup = m.enrollmentFindMany.mock.calls[0]![0].where;
    expect(lookup).toEqual({ id: { in: [E1, E2] }, organizationId: 'org', courseId: 'c1' });
  });

  it('ignores a repeated id when checking that every id exists', async () => {
    withRows([row(E1, 's1', 'Physics')], [E1]);
    await expect(sendFeeReminders({ month: '2026-11', enrollmentIds: [E1, E1] }, desk, ctx)).resolves.toMatchObject({ sent: 1 });
  });

  it('reports a chosen enrollment that no longer owes instead of texting it', async () => {
    withRows([row(E1, 's1', 'Physics')], [E1, E2]);
    const result = await sendFeeReminders({ month: '2026-11', enrollmentIds: [E1, E2] }, desk, ctx);
    expect(result).toEqual({ sent: 1, skipped: [{ enrollmentId: E2, reason: 'NOT_OWING' }] });
    expect(m.dispatch).toHaveBeenCalledTimes(1);
  });

  it('with only a course, reminds every owing student of it', async () => {
    withRows([row(E1, 's1', 'Physics'), row(E2, 's2', 'Physics')]);
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx)).resolves.toMatchObject({ sent: 2 });
    expect(m.enrollmentFindMany).toHaveBeenCalledTimes(1);
  });
});

describe('who is left out', () => {
  it('skips a student still inside the grace days', async () => {
    withRows([row(E1, 's1', 'Physics', { inGrace: true }), row(E2, 's2', 'Physics')]);
    const result = await sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx);
    expect(result).toEqual({ sent: 1, skipped: [{ enrollmentId: E1, reason: 'IN_GRACE' }] });
  });

  it('skips a student who already got the monthly maximum, counted from this Colombo month in the notification table', async () => {
    withRows([row(E1, 's1', 'Physics'), row(E2, 's2', 'Physics')]);
    m.groupBy.mockImplementation(async () => { m.order.push('count'); return [{ userId: 's1', _count: { _all: 1 } }]; });
    const result = await sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx);
    expect(result).toEqual({ sent: 1, skipped: [{ enrollmentId: E1, reason: 'REMINDER_LIMIT_REACHED' }] });
    expect(m.groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: { type: NotificationType.FEE_DUE, userId: { in: ['s1', 's2'] }, createdAt: { gte: new Date('2026-10-31T18:30:00.000Z'), lt: new Date('2026-11-30T18:30:00.000Z') } },
      _count: { _all: true },
    });
  });

  it('honours a higher owner cap: one earlier reminder still leaves room when the cap is two', async () => {
    m.settings['fees.reminderMaxPerStudentPerMonth'] = 2;
    withRows([row(E1, 's1', 'Physics')]);
    m.groupBy.mockImplementation(async () => [{ userId: 's1', _count: { _all: 1 } }]);
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx)).resolves.toMatchObject({ sent: 1 });
  });

  it('sends one reminder per student even when two of their courses owe', async () => {
    withRows([row(E1, 's1', 'Physics'), row(E2, 's1', 'Chemistry')]);
    const result = await sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx);
    expect(result).toEqual({ sent: 1, skipped: [] });
    expect(m.dispatch).toHaveBeenCalledTimes(1);
    expect(m.dispatch.mock.calls[0]![0].params).toEqual({ courseName: 'Physics and 1 more', paymentMonth: '2026-11' });
  });

  it('is in-grace per enrollment: a graced course does not hide an owing one', async () => {
    withRows([row(E1, 's1', 'Physics', { inGrace: true }), row(E2, 's1', 'Chemistry')]);
    const result = await sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx);
    expect(result).toEqual({ sent: 1, skipped: [{ enrollmentId: E1, reason: 'IN_GRACE' }] });
    expect(m.dispatch.mock.calls[0]![0].params.courseName).toBe('Chemistry');
  });
});

describe('what is sent', () => {
  it('creates the in-app row regardless of its setting and links to the payments page', async () => {
    withRows([row(E1, 's1', 'Physics')]);
    await sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx);
    expect(m.dispatch).toHaveBeenCalledWith({ type: NotificationType.FEE_DUE, userId: 's1', link: '/payments', params: { courseName: 'Physics', paymentMonth: '2026-11' }, forceInApp: true });
  });

  it('takes the per-month lock before counting earlier reminders, and counts before sending', async () => {
    withRows([row(E1, 's1', 'Physics')]);
    await sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx);
    expect(m.order).toEqual(['lock', 'count', 'dispatch']);
    expect(m.lock).toHaveBeenCalledWith(expect.anything(), 'fee-reminders', 'org', '2026-11');
  });

  it('sends nothing and writes one audit row when everyone is skipped', async () => {
    withRows([row(E1, 's1', 'Physics', { inGrace: true })]);
    await sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx);
    expect(m.dispatch).not.toHaveBeenCalled();
    expect(m.audit).toHaveBeenCalledTimes(1);
  });
});

describe('audit', () => {
  it('writes counts only, in the same transaction, with no names, phones or amounts', async () => {
    withRows([row(E1, 's1', 'Physics'), row(E2, 's2', 'Physics', { inGrace: true })]);
    await sendFeeReminders({ month: '2026-11', courseId: 'c1' }, owner, { ...ctx, actorRole: 'SUPER_ADMIN' });
    const [, input] = m.audit.mock.calls[0]!;
    expect(input).toMatchObject({
      action: 'FEE_REMINDER_SENT', organizationId: 'org',
      metadata: { month: '2026-11', courseId: 'c1', sent: 1, skipped: { IN_GRACE: 1 } },
    });
    const stored = JSON.stringify(input);
    expect(stored).not.toContain('Name s1');
    expect(stored).not.toContain('0771234567');
    expect(stored).not.toContain('1500');
  });

  it('fails the request when the audit row cannot be written', async () => {
    withRows([row(E1, 's1', 'Physics')]);
    m.audit.mockRejectedValue(new Error('audit down'));
    await expect(sendFeeReminders({ month: '2026-11', courseId: 'c1' }, desk, ctx)).rejects.toThrow('audit down');
  });
});

describe('check ordering', () => {
  it('a student too early for reminders is told so before a bad enrollment id is reported', async () => {
    vi.setSystemTime(new Date('2026-11-05T06:00:00Z'));
    await expect(sendFeeReminders({ month: '2026-11', enrollmentIds: [E3] }, desk, ctx)).rejects.toMatchObject({ code: 'REMINDER_TOO_EARLY' });
    expect(m.enrollmentFindMany).not.toHaveBeenCalled();
  });
});
