import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  clock: vi.fn(), institute: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), sum: vi.fn(),
  audit: vi.fn(), lock: vi.fn(), calls: [] as string[], committed: [] as unknown[], settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => ({
  prisma: {
    institute: { findFirst: m.institute },
    cashTally: { findFirst: m.findFirst },
    // A real transaction keeps nothing when its callback throws; the mock models that so rollback can be asserted.
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const staged: unknown[] = [];
      const tx = {
        cashTally: {
          findFirst: (a: unknown) => { m.calls.push('read'); return m.findFirst(a); },
          create: (a: unknown) => { staged.push(a); return m.create(a); },
          update: (a: unknown) => { staged.push(a); return m.update(a); },
          updateMany: (a: unknown) => { staged.push(a); return m.updateMany(a); },
        },
      };
      const result = await run(tx);
      m.committed.push(...staged);
      return result;
    },
  },
}));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/cash-report.service', () => ({ sumCash: m.sum }));
vi.mock('@/services/audit.service', () => ({ logInTransaction: m.audit }));
vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: (...args: unknown[]) => { m.calls.push('lock'); return m.lock(...args); } }));

import { closeCashDay, reconcileCashTally } from './cash-tally.service';

const admin = { userId: 'clerk', role: Role.ADMIN };
const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const ctx = { actorId: 'clerk', actorRole: 'ADMIN', ip: '10.0.0.1', userAgent: 'test' };
const NOW = new Date('2026-11-20T10:00:00Z'); // 15:30 on 2026-11-20 in Colombo
const input = (over: Record<string, unknown> = {}) => ({ countedAmount: 7500, ...over }) as Parameters<typeof closeCashDay>[1];
const stored = (over: Record<string, unknown> = {}) => ({
  id: 't1', collectorId: 'clerk', day: '2026-11-20', instituteId: null, countedAmount: new Prisma.Decimal(7500), systemAmount: new Prisma.Decimal(7500),
  variance: new Prisma.Decimal(0), paymentCount: 3, note: null, reconciledAt: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  m.calls.length = 0;
  m.committed.length = 0;
  m.settings = { 'tally.enabled': true, 'tally.varianceFlagAmount': 0 };
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.institute.mockResolvedValue({ id: 'i1' });
  m.findFirst.mockResolvedValue(null);
  m.sum.mockResolvedValue({ amount: new Prisma.Decimal(7500), count: 3 });
  m.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 't-new', ...data }));
  m.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 't1', ...data }));
  m.updateMany.mockResolvedValue({ count: 1 });
  m.audit.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('closeCashDay: who may close', () => {
  it.each([Role.ADMIN, Role.SUPER_ADMIN])('lets %s count the cash they took', async (role) => {
    await expect(closeCashDay({ userId: 'u', role }, input(), ctx)).resolves.toMatchObject({ collectorId: 'u' });
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before any lookup', async (role) => {
    await expect(closeCashDay({ userId: 'u', role }, input(), ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it('counts the cash of the caller only, whatever else the request carries', async () => {
    await closeCashDay(admin, { ...input(), collectorId: 'someone-else' } as never, ctx);
    expect(m.sum).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ collectorId: 'clerk' }));
    expect(m.create.mock.calls[0]![0].data.collectorId).toBe('clerk');
  });
});

describe('closeCashDay: what may be closed', () => {
  it('refuses when the owner turned the tally off, writing nothing', async () => {
    m.settings['tally.enabled'] = false;
    await expect(closeCashDay(admin, input(), ctx)).rejects.toMatchObject({ code: 'TALLY_DISABLED', statusCode: 409 });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('defaults to the Colombo day, which has already turned at 00:10 local', async () => {
    m.sum.mockResolvedValue({ amount: new Prisma.Decimal(0), count: 0 });
    vi.setSystemTime(new Date('2026-11-20T18:40:00Z'));
    await closeCashDay(admin, input({ countedAmount: 0 }), ctx);
    expect(m.create.mock.calls[0]![0].data.day).toBe('2026-11-21');
  });

  it('accepts a past day and today, refuses a day that has not started', async () => {
    await expect(closeCashDay(admin, input({ day: '2026-11-19' }), ctx)).resolves.toMatchObject({ day: '2026-11-19' });
    await expect(closeCashDay(admin, input({ day: '2026-11-20' }), ctx)).resolves.toMatchObject({ day: '2026-11-20' });
    await expect(closeCashDay(admin, input({ day: '2026-11-21' }), ctx)).rejects.toMatchObject({ code: 'DAY_IN_FUTURE', statusCode: 400 });
  });

  it('answers 404 for a branch that is not in this organization, before counting', async () => {
    m.institute.mockResolvedValue(null);
    await expect(closeCashDay(admin, input({ instituteId: 'foreign' }), ctx)).rejects.toMatchObject({ code: 'INSTITUTE_NOT_FOUND', statusCode: 404 });
    expect(m.institute).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'org' }, select: { id: true } });
    expect(m.sum).not.toHaveBeenCalled();
  });

  it('does not look up a branch when the close is for cash with no branch recorded', async () => {
    await closeCashDay(admin, input({ instituteId: null }), ctx);
    expect(m.institute).not.toHaveBeenCalled();
    expect(m.sum).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ instituteId: null }));
  });
});

describe('closeCashDay: the count', () => {
  it('records the typed count against what the system says and the difference between them', async () => {
    m.sum.mockResolvedValue({ amount: new Prisma.Decimal(7500), count: 3 });
    const result = await closeCashDay(admin, input({ countedAmount: 7499.5, note: ' short ' }), ctx);
    expect(m.create.mock.calls[0]![0].data).toMatchObject({
      organizationId: 'org', collectorId: 'clerk', day: '2026-11-20', instituteId: null, paymentCount: 3, note: ' short ',
    });
    expect(result).toMatchObject({ countedAmount: '7499.50', systemAmount: '7500.00', variance: '-0.50', paymentCount: 3, flagged: true });
  });

  it('shows an over-count as a positive variance', async () => {
    expect(await closeCashDay(admin, input({ countedAmount: 7600 }), ctx)).toMatchObject({ variance: '100.00', flagged: true });
  });

  it('does not flag a matching count, and honours the owner threshold at its boundary', async () => {
    expect((await closeCashDay(admin, input({ countedAmount: 7500 }), ctx)).flagged).toBe(false);
    m.settings['tally.varianceFlagAmount'] = 50;
    expect((await closeCashDay(admin, input({ countedAmount: 7450 }), ctx)).flagged).toBe(false);
    expect((await closeCashDay(admin, input({ countedAmount: 7449 }), ctx)).flagged).toBe(true);
  });

  it('allows a nil count on a day with no cash', async () => {
    m.sum.mockResolvedValue({ amount: new Prisma.Decimal(0), count: 0 });
    expect(await closeCashDay(admin, input({ countedAmount: 0 }), ctx)).toMatchObject({ variance: '0.00', flagged: false });
  });

  it('updates the same row on a second close of the same day and branch instead of adding one', async () => {
    m.findFirst.mockResolvedValue(stored());
    await closeCashDay(admin, input({ countedAmount: 7400 }), ctx);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' }, data: expect.objectContaining({ countedAmount: new Prisma.Decimal(7400), variance: new Prisma.Decimal(-100) }) }));
  });

  it('refuses to change a day the owner already reconciled', async () => {
    m.findFirst.mockResolvedValue(stored({ reconciledAt: new Date() }));
    await expect(closeCashDay(admin, input(), ctx)).rejects.toMatchObject({ code: 'TALLY_RECONCILED', statusCode: 409 });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('takes the per-collector, per-day, per-branch lock before reading the existing row', async () => {
    await closeCashDay(admin, input({ instituteId: 'i1' }), ctx);
    expect(m.lock).toHaveBeenCalledWith(expect.anything(), 'cash-tally', 'org', 'clerk:2026-11-20:i1');
    expect(m.calls.indexOf('lock')).toBeLessThan(m.calls.indexOf('read'));
  });

  it('counts the cash inside the lock so a payment cannot slip between the sum and the write', async () => {
    m.sum.mockImplementation(async () => { m.calls.push('sum'); return { amount: new Prisma.Decimal(7500), count: 3 }; });
    await closeCashDay(admin, input(), ctx);
    expect(m.calls.indexOf('lock')).toBeLessThan(m.calls.indexOf('sum'));
  });
});

describe('closeCashDay: audit', () => {
  it('writes one row in the same transaction with the figures and the actor context', async () => {
    await closeCashDay(admin, input({ countedAmount: 7400, instituteId: 'i1' }), ctx);
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.audit.mock.calls[0]![1]).toMatchObject({
      action: 'CASH_DAY_CLOSED', targetType: 'CashTally', targetId: 't-new', organizationId: 'org', context: ctx,
      metadata: { day: '2026-11-20', instituteId: 'i1', countedAmount: '7400.00', systemAmount: '7500.00', variance: '-100.00', paymentCount: 3 },
    });
  });

  it('rolls the count back when the audit write fails', async () => {
    m.audit.mockRejectedValue(new Error('audit down'));
    await expect(closeCashDay(admin, input(), ctx)).rejects.toThrow('audit down');
    expect(m.committed).toEqual([]);
  });
});

describe('reconcileCashTally', () => {
  beforeEach(() => m.findFirst.mockResolvedValue({ id: 't1', reconciledAt: null }));

  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('is the owner only: %s is refused before any lookup', async (role) => {
    await expect(reconcileCashTally({ userId: 'u', role }, 't1', ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('answers 404 for a tally that does not exist or belongs to another organization', async () => {
    m.findFirst.mockResolvedValue(null);
    await expect(reconcileCashTally(owner, 'nope', ctx)).rejects.toMatchObject({ code: 'CASH_TALLY_NOT_FOUND', statusCode: 404 });
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'nope', organizationId: 'org' } }));
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('marks the day reconciled by the owner and writes one audit row', async () => {
    const result = await reconcileCashTally(owner, 't1', ctx);
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: 't1', organizationId: 'org', reconciledAt: null }, data: { reconciledAt: NOW, reconciledById: 'owner' } });
    expect(m.audit.mock.calls[0]![1]).toMatchObject({ action: 'CASH_TALLY_RECONCILED', targetType: 'CashTally', targetId: 't1', organizationId: 'org', context: ctx });
    expect(result).toEqual({ id: 't1', reconciledAt: NOW, alreadyReconciled: false });
  });

  it('is idempotent: reconciling twice changes nothing and adds no audit row', async () => {
    const earlier = new Date('2026-11-19T10:00:00Z');
    m.findFirst.mockResolvedValue({ id: 't1', reconciledAt: earlier });
    expect(await reconcileCashTally(owner, 't1', ctx)).toEqual({ id: 't1', reconciledAt: earlier, alreadyReconciled: true });
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('adds no audit row when another owner reconciled it between the lookup and the write', async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    m.findFirst.mockResolvedValueOnce({ id: 't1', reconciledAt: null }).mockResolvedValueOnce({ id: 't1', reconciledAt: NOW });
    expect(await reconcileCashTally(owner, 't1', ctx)).toMatchObject({ alreadyReconciled: true });
    expect(m.audit).not.toHaveBeenCalled();
  });
});
