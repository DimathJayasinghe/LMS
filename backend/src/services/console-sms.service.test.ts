import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, SmsStatus } from '@prisma/client';

const m = vi.hoisted(() => ({ groupBy: vi.fn(), findMany: vi.fn(), clock: vi.fn() }));

vi.mock('@/config/database', () => ({ prisma: { smsLog: { groupBy: m.groupBy, findMany: m.findMany } } }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));

import { getSmsPanel } from './console-sms.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const counts = (sent = 0, failed = 0, pending = 0) => [
  ...(sent ? [{ status: SmsStatus.SENT, _count: { _all: sent } }] : []),
  ...(failed ? [{ status: SmsStatus.FAILED, _count: { _all: failed } }] : []),
  ...(pending ? [{ status: SmsStatus.PENDING, _count: { _all: pending } }] : []),
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T06:00:00Z')); // 20 November, 11:30 in Colombo
  vi.resetAllMocks();
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.groupBy.mockResolvedValue([]);
  m.findMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('getSmsPanel', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before reading anything', async (role) => {
    await expect(getSmsPanel({ userId: 'x', role } as never)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.groupBy).not.toHaveBeenCalled();
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('answers zeros on an empty log', async () => {
    await expect(getSmsPanel(owner as never)).resolves.toEqual({
      week: { from: '2026-11-14', sent: 0, failed: 0, pending: 0 },
      month: { month: '2026-11', sent: 0, failed: 0, pending: 0 },
      failures: [],
    });
  });

  it('counts the last seven Colombo days, today included, and the billing month, each by status', async () => {
    m.groupBy.mockResolvedValueOnce(counts(40, 3, 1)).mockResolvedValueOnce(counts(120, 9));
    const panel = await getSmsPanel(owner as never);
    expect(m.groupBy).toHaveBeenNthCalledWith(1, { by: ['status'], where: { organizationId: 'org', createdAt: { gte: new Date('2026-11-13T18:30:00Z') } }, _count: { _all: true } });
    expect(m.groupBy).toHaveBeenNthCalledWith(2, { by: ['status'], where: { organizationId: 'org', createdAt: { gte: new Date('2026-10-31T18:30:00Z') } }, _count: { _all: true } });
    expect(panel.week).toEqual({ from: '2026-11-14', sent: 40, failed: 3, pending: 1 });
    expect(panel.month).toEqual({ month: '2026-11', sent: 120, failed: 9, pending: 0 });
  });

  describe('the recent failures', () => {
    const failure = (over: Record<string, unknown> = {}) => ({
      id: 'l1', createdAt: new Date('2026-11-19T08:00:00Z'), phoneNumber: '0771234567', errorDetail: 'Insufficient balance', ...over,
    });

    it('are the newest ten failed rows of this organization', async () => {
      await getSmsPanel(owner as never);
      expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { organizationId: 'org', status: SmsStatus.FAILED }, orderBy: { createdAt: 'desc' }, take: 10,
      }));
    });

    it('never read the message text', async () => {
      await getSmsPanel(owner as never);
      const { select } = m.findMany.mock.calls[0]![0] as { select: Record<string, boolean> };
      expect(select).not.toHaveProperty('message');
      expect(Object.keys(select).sort()).toEqual(['createdAt', 'errorDetail', 'id', 'phoneNumber']);
    });

    it('show the phone masked and the reason with any number in it hidden', async () => {
      m.findMany.mockResolvedValue([
        failure(),
        failure({ id: 'l2', phoneNumber: '+94771234567', errorDetail: 'Invalid recipient 94771234567' }),
        failure({ id: 'l3', errorDetail: null }),
      ]);
      const panel = await getSmsPanel(owner as never);
      expect(panel.failures).toEqual([
        { id: 'l1', at: new Date('2026-11-19T08:00:00Z'), phone: '*******567', reason: 'Insufficient balance' },
        { id: 'l2', at: new Date('2026-11-19T08:00:00Z'), phone: '*********567', reason: 'Invalid recipient ***' },
        { id: 'l3', at: new Date('2026-11-19T08:00:00Z'), phone: '*******567', reason: null },
      ]);
    });

    it('carry no full phone number and no message in the whole answer', async () => {
      m.findMany.mockResolvedValue([failure({ message: 'Your child owes Rs 3000', errorDetail: 'bad 0771234567' })]);
      const text = JSON.stringify(await getSmsPanel(owner as never));
      expect(text).not.toContain('0771234567');
      expect(text).not.toContain('Your child owes');
    });
  });
});
