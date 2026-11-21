import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, Role } from '@prisma/client';

const m = vi.hoisted(() => ({ clock: vi.fn(), days: vi.fn(), findMany: vi.fn(), settings: {} as Record<string, unknown> }));

vi.mock('@/config/database', () => ({ prisma: { cashTally: { findMany: m.findMany } } }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/cash-report.service', () => ({ queryCashDays: m.days }));

import { listCashDays, listCashTallies } from './cash-list.service';

const clerk = { userId: 'clerk', role: Role.ADMIN };
const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const NOW = new Date('2026-11-20T10:00:00Z'); // 15:30 on 2026-11-20 in Colombo

const day = (over: Record<string, unknown> = {}) => ({
  day: '2026-11-20', collectorId: 'clerk', collectorName: 'Nimal', instituteId: null, instituteName: null, amount: '7500.00', paymentCount: 3, ...over,
});
const tally = (over: Record<string, unknown> = {}) => ({
  id: 't1', day: '2026-11-20', collectorId: 'clerk', collector: { name: 'Nimal' }, instituteId: null, institute: null,
  countedAmount: new Prisma.Decimal(7500), systemAmount: new Prisma.Decimal(7500), variance: new Prisma.Decimal(0), paymentCount: 3, note: null,
  updatedAt: NOW, reconciledAt: null, reconciledBy: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  m.settings = { 'tally.varianceFlagAmount': 0 };
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.days.mockResolvedValue([]);
  m.findMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('who may read cash', () => {
  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before any lookup', async (role) => {
    await expect(listCashDays({ userId: 'u', role }, {})).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    await expect(listCashTallies({ userId: 'u', role }, {})).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
  });

  it('shows front desk only their own cash, even when no collector is asked for', async () => {
    await listCashDays(clerk, {});
    expect(m.days).toHaveBeenCalledWith(expect.objectContaining({ collectorId: 'clerk' }));
    expect(m.findMany.mock.calls[0]![0].where.collectorId).toBe('clerk');
  });

  it("refuses front desk asking for another collector's cash, and lets them ask for their own", async () => {
    await expect(listCashDays(clerk, { collectorId: 'other' })).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.days).not.toHaveBeenCalled();
    await expect(listCashDays(clerk, { collectorId: 'clerk' })).resolves.toBeTruthy();
  });

  it('lets the owner see everyone, or narrow to one collector and branch', async () => {
    await listCashDays(owner, {});
    expect(m.days.mock.calls[0]![0]).not.toHaveProperty('collectorId', expect.anything());
    await listCashDays(owner, { collectorId: 'clerk', instituteId: 'i1' });
    expect(m.days).toHaveBeenLastCalledWith(expect.objectContaining({ collectorId: 'clerk', instituteId: 'i1' }));
    expect(m.findMany.mock.calls[1]![0].where).toMatchObject({ organizationId: 'org', collectorId: 'clerk', instituteId: 'i1' });
  });
});

describe('the day range', () => {
  it('defaults to the last seven Colombo days ending today', async () => {
    const result = await listCashDays(owner, {});
    expect(result).toMatchObject({ from: '2026-11-14', to: '2026-11-20' });
    expect(m.days).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org', timezone: 'Asia/Colombo', from: '2026-11-14', to: '2026-11-20' }));
  });

  it('counts today in the organization zone, which has turned over at 00:10 local', async () => {
    vi.setSystemTime(new Date('2026-11-20T18:40:00Z'));
    expect(await listCashDays(owner, {})).toMatchObject({ to: '2026-11-21' });
  });

  it('keeps the closes of the same days only, inside the organization', async () => {
    await listCashDays(owner, { from: '2026-11-01', to: '2026-11-10' });
    expect(m.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: 'org', day: { gte: '2026-11-01', lte: '2026-11-10' } });
  });

  it('refuses a range that ends before it starts', async () => {
    await expect(listCashDays(owner, { from: '2026-11-10', to: '2026-11-09' })).rejects.toMatchObject({ code: 'INVALID_RANGE', statusCode: 400 });
  });

  it('allows 92 days and refuses 93', async () => {
    await expect(listCashDays(owner, { from: '2026-08-20', to: '2026-11-20' })).resolves.toBeTruthy();
    await expect(listCashDays(owner, { from: '2026-08-19', to: '2026-11-20' })).rejects.toMatchObject({ code: 'RANGE_TOO_LARGE', statusCode: 400 });
  });

  it('works from a single given end day, going back seven days', async () => {
    expect(await listCashDays(owner, { to: '2026-11-05' })).toMatchObject({ from: '2026-10-30', to: '2026-11-05' });
  });
});

describe('listCashDays', () => {
  it('returns the cash of each day with its count and flags it by the owner threshold', async () => {
    m.days.mockResolvedValue([day(), day({ day: '2026-11-19', amount: '100.00', paymentCount: 1 })]);
    m.findMany.mockResolvedValue([tally({ variance: new Prisma.Decimal(-1), countedAmount: new Prisma.Decimal(7499) })]);
    const { data, count } = await listCashDays(owner, {});
    expect(count).toBe(2);
    expect(data[0]!.tally).toMatchObject({ flagged: true, staleSinceClose: false });
    expect(data[1]!.tally).toBeNull();
  });
});

describe('listCashTallies', () => {
  beforeEach(() => {
    m.days.mockResolvedValue([day(), day({ day: '2026-11-19', collectorId: 'c2', collectorName: 'Amara' })]);
    m.findMany.mockResolvedValue([tally(), tally({ id: 't2', day: '2026-11-19', collectorId: 'c2', collector: { name: 'Amara' }, reconciledAt: NOW, reconciledBy: { name: 'Owner' } })]);
  });

  it('lists only days that were counted', async () => {
    m.days.mockResolvedValue([day(), day({ day: '2026-11-18' })]);
    expect((await listCashTallies(owner, {})).data.map((r) => r.day)).toEqual(['2026-11-20', '2026-11-19']);
  });

  it('can narrow to counts the owner has not reconciled yet', async () => {
    const { data, count } = await listCashTallies(owner, { unreconciled: true });
    expect(data.map((r) => r.tally!.id)).toEqual(['t1']);
    expect(count).toBe(1);
  });
});
