import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildCashRows, isFlagged, type CashDay, type TallyRecord } from './cash-rows';

const day = (over: Partial<CashDay> = {}): CashDay => ({
  day: '2026-11-20', collectorId: 'c1', collectorName: 'Nimal', instituteId: 'i1', instituteName: 'Kandy',
  amount: '7500.00', paymentCount: 3, ...over,
});
const tally = (over: Partial<TallyRecord> = {}): TallyRecord => ({
  id: 't1', day: '2026-11-20', collectorId: 'c1', collector: { name: 'Nimal' }, instituteId: 'i1', institute: { name: 'Kandy' },
  countedAmount: new Prisma.Decimal('7499'), systemAmount: new Prisma.Decimal('7500'), variance: new Prisma.Decimal('-1'),
  paymentCount: 3, note: null, updatedAt: new Date('2026-11-20T15:00:00Z'), reconciledAt: null, reconciledBy: null, ...over,
});

describe('isFlagged', () => {
  it('flags any difference when the threshold is zero', () => {
    expect(isFlagged(new Prisma.Decimal('-1'), 0)).toBe(true);
    expect(isFlagged(new Prisma.Decimal('0'), 0)).toBe(false);
  });
  it('flags only beyond the threshold, in either direction', () => {
    expect(isFlagged(new Prisma.Decimal('50'), 50)).toBe(false);
    expect(isFlagged(new Prisma.Decimal('50.01'), 50)).toBe(true);
    expect(isFlagged(new Prisma.Decimal('-50.01'), 50)).toBe(true);
  });
});

describe('buildCashRows', () => {
  it('shows a day with cash and no close as an open row with no tally', () => {
    expect(buildCashRows([day()], [], 0)).toEqual([{ ...day(), tally: null }]);
  });

  it('attaches the tally of the same collector, day and branch with the variance flag', () => {
    const [row] = buildCashRows([day()], [tally()], 0);
    expect(row!.tally).toMatchObject({ id: 't1', countedAmount: '7499.00', systemAmount: '7500.00', variance: '-1.00', flagged: true, staleSinceClose: false, reconciledAt: null });
  });

  it('does not attach a tally of another branch or another collector', () => {
    const rows = buildCashRows([day()], [tally({ instituteId: 'i2', institute: { name: 'Galle' } }), tally({ id: 't3', collectorId: 'c2' })], 0);
    expect(rows.find((r) => r.collectorId === 'c1' && r.instituteId === 'i1')!.tally).toBeNull();
  });

  it('matches the no-branch day to the no-branch tally', () => {
    const [row] = buildCashRows([day({ instituteId: null, instituteName: null })], [tally({ instituteId: null, institute: null })], 0);
    expect(row!.tally?.id).toBe('t1');
  });

  it('marks a close stale when cash changed after it, by amount or by count', () => {
    expect(buildCashRows([day({ amount: '10000.00', paymentCount: 4 })], [tally()], 0)[0]!.tally!.staleSinceClose).toBe(true);
    expect(buildCashRows([day({ amount: '7500.00', paymentCount: 4 })], [tally()], 0)[0]!.tally!.staleSinceClose).toBe(true);
    expect(buildCashRows([day({ amount: '7500.00', paymentCount: 3 })], [tally()], 0)[0]!.tally!.staleSinceClose).toBe(false);
  });

  it('keeps a closed day whose cash is gone as a zero row, stale', () => {
    const [row] = buildCashRows([], [tally()], 0);
    expect(row).toMatchObject({ collectorName: 'Nimal', instituteName: 'Kandy', amount: '0.00', paymentCount: 0 });
    expect(row!.tally!.staleSinceClose).toBe(true);
  });

  it('uses the threshold given, not the one stored at close time', () => {
    expect(buildCashRows([day()], [tally()], 5)[0]!.tally!.flagged).toBe(false);
  });

  it('reports who reconciled and when', () => {
    const at = new Date('2026-11-21T04:00:00Z');
    const [row] = buildCashRows([day()], [tally({ reconciledAt: at, reconciledBy: { name: 'Owner' } })], 0);
    expect(row!.tally).toMatchObject({ reconciledAt: at, reconciledByName: 'Owner' });
  });

  it('orders newest day first, then collector name, then branch with no branch last', () => {
    const rows = buildCashRows([
      day({ day: '2026-11-19' }),
      day({ collectorId: 'c2', collectorName: 'Amara', instituteId: null, instituteName: null }),
      day({ collectorId: 'c2', collectorName: 'Amara' }),
      day(),
    ], [], 0);
    expect(rows.map((r) => [r.day, r.collectorName, r.instituteName])).toEqual([
      ['2026-11-20', 'Amara', 'Kandy'], ['2026-11-20', 'Amara', null], ['2026-11-20', 'Nimal', 'Kandy'], ['2026-11-19', 'Nimal', 'Kandy'],
    ]);
  });
});
