import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const m = vi.hoisted(() => ({ queryRaw: vi.fn(), aggregate: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: { $queryRaw: m.queryRaw, payment: { aggregate: m.aggregate } } }));

import { queryCashDays, sumCash } from './cash-report.service';

const base = { organizationId: 'org', timezone: 'Asia/Colombo' };

beforeEach(() => vi.resetAllMocks());

describe('queryCashDays', () => {
  it('asks for the Colombo days from the start of the first to the end of the last, in the organization zone', async () => {
    m.queryRaw.mockResolvedValue([]);
    await queryCashDays({ ...base, from: '2026-11-19', to: '2026-11-20' });
    const sql = m.queryRaw.mock.calls[0]![0] as Prisma.Sql;
    expect(sql.values).toEqual(expect.arrayContaining(['org', 'Asia/Colombo', new Date('2026-11-18T18:30:00.000Z'), new Date('2026-11-20T18:30:00.000Z')]));
  });

  it('counts only cash the desk took, whether or not it was refunded since', async () => {
    m.queryRaw.mockResolvedValue([]);
    await queryCashDays({ ...base, from: '2026-11-20', to: '2026-11-20' });
    const text = (m.queryRaw.mock.calls[0]![0] as Prisma.Sql).sql;
    expect(text).toContain(`"method" = 'ENTRANCE'`);
    expect(text).toContain(`"status" IN ('SUCCESS', 'REFUNDED')`);
  });

  it('narrows by collector and branch only when given', async () => {
    m.queryRaw.mockResolvedValue([]);
    await queryCashDays({ ...base, from: '2026-11-20', to: '2026-11-20' });
    await queryCashDays({ ...base, from: '2026-11-20', to: '2026-11-20', collectorId: 'c1', instituteId: 'i1' });
    const open = m.queryRaw.mock.calls[0]![0] as Prisma.Sql;
    const narrow = m.queryRaw.mock.calls[1]![0] as Prisma.Sql;
    expect(open.values).not.toContain('c1');
    expect(narrow.values).toEqual(expect.arrayContaining(['c1', 'i1']));
  });

  it('maps rows to the shape the screen uses', async () => {
    m.queryRaw.mockResolvedValue([{ day: '2026-11-20', collectorId: 'c1', collectorName: 'Nimal', instituteId: null, instituteName: null, amount: '7500.00', paymentCount: 3 }]);
    await expect(queryCashDays({ ...base, from: '2026-11-20', to: '2026-11-20' })).resolves.toEqual([
      { day: '2026-11-20', collectorId: 'c1', collectorName: 'Nimal', instituteId: null, instituteName: null, amount: '7500.00', paymentCount: 3 },
    ]);
  });
});

describe('sumCash', () => {
  it('sums one collector, branch and Colombo day, with midnight in the organization zone', async () => {
    m.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal('7500') }, _count: 3 });
    const result = await sumCash({ payment: { aggregate: m.aggregate } } as never, { ...base, collectorId: 'c1', instituteId: 'i1', day: '2026-11-20' });
    expect(result.amount.toFixed(2)).toBe('7500.00');
    expect(result.count).toBe(3);
    expect(m.aggregate).toHaveBeenCalledWith({
      where: {
        organizationId: 'org', method: 'ENTRANCE', status: { in: ['SUCCESS', 'REFUNDED'] }, collectedById: 'c1', collectedAtInstituteId: 'i1',
        collectedAt: { gte: new Date('2026-11-19T18:30:00.000Z'), lt: new Date('2026-11-20T18:30:00.000Z') },
      },
      _sum: { amount: true }, _count: true,
    });
  });

  it('matches payments with no recorded branch when no branch is given', async () => {
    m.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 });
    const result = await sumCash({ payment: { aggregate: m.aggregate } } as never, { ...base, collectorId: 'c1', instituteId: null, day: '2026-11-20' });
    expect(result.amount.toFixed(2)).toBe('0.00');
    expect(m.aggregate.mock.calls[0]![0].where.collectedAtInstituteId).toBeNull();
  });

  it('puts a 00:10 Colombo payment in the new day', async () => {
    m.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 });
    await sumCash({ payment: { aggregate: m.aggregate } } as never, { ...base, collectorId: 'c1', instituteId: null, day: '2026-11-21' });
    const { gte, lt } = m.aggregate.mock.calls[0]![0].where.collectedAt;
    const tenPastMidnight = new Date('2026-11-20T18:40:00.000Z');
    expect(tenPastMidnight >= gte && tenPastMidnight < lt).toBe(true);
  });
});
