import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const { paymentGroupBy, queryRaw } = vi.hoisted(() => ({
	paymentGroupBy: vi.fn(),
	queryRaw: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		payment: { groupBy: paymentGroupBy },
		$queryRaw: queryRaw,
	},
}));

import { getFinancialReport } from './payment.service';

const D = (v: string) => new Prisma.Decimal(v);

beforeEach(() => {
	paymentGroupBy.mockReset();
	queryRaw.mockReset();
});

describe('getFinancialReport', () => {
	it('builds a 12-month zero-filled trend + breakdowns + outstanding', async () => {
		// Promise.all call order: groupBy(trend), $queryRaw(byCourse), groupBy(byMethod), $queryRaw(outstanding)
		paymentGroupBy
			.mockResolvedValueOnce([
				{ paymentMonth: '2026-07', _sum: { amount: D('5000') }, _count: { _all: 3 } },
				{ paymentMonth: '2026-05', _sum: { amount: D('2000') }, _count: { _all: 1 } },
			])
			.mockResolvedValueOnce([
				{ method: 'ONLINE', _sum: { amount: D('4000') }, _count: { _all: 2 } },
				{ method: 'BULK', _sum: { amount: D('1000') }, _count: { _all: 1 } },
			]);
		queryRaw
			.mockResolvedValueOnce([{ id: 'c1', name: 'Physics', year: 2026, total: '5000', cnt: 3n }])
			.mockResolvedValueOnce([{ cnt: 4n, expected: '12000' }]);

		const r = await getFinancialReport('2026-07');

		// trend: 12 entries ending at 2026-07, zero-filled where absent
		expect(r.trend).toHaveLength(12);
		expect(r.trend.at(-1)).toEqual({ month: '2026-07', collected: '5000.00', paidCount: 3 });
		expect(r.trend.find((t) => t.month === '2026-05')).toEqual({
			month: '2026-05',
			collected: '2000.00',
			paidCount: 1,
		});
		expect(r.trend.find((t) => t.month === '2026-06')).toEqual({
			month: '2026-06',
			collected: '0.00',
			paidCount: 0,
		});
		expect(r.trend[0]?.month).toBe('2025-08');

		expect(r.byCourse).toEqual([
			{ courseId: 'c1', name: 'Physics', year: 2026, collected: '5000.00', paidCount: 3 },
		]);
		expect(r.byMethod).toEqual([
			{ method: 'ONLINE', collected: '4000.00', paidCount: 2 },
			{ method: 'BULK', collected: '1000.00', paidCount: 1 },
		]);
		expect(r.outstanding).toEqual({ count: 4, expected: '12000.00' });
	});

	it('handles an empty month (no payments, nothing outstanding)', async () => {
		paymentGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ cnt: 0n, expected: 0 }]);

		const r = await getFinancialReport('2026-01');
		expect(r.trend).toHaveLength(12);
		expect(r.trend.every((t) => t.collected === '0.00' && t.paidCount === 0)).toBe(true);
		expect(r.byCourse).toEqual([]);
		expect(r.byMethod).toEqual([]);
		expect(r.outstanding).toEqual({ count: 0, expected: '0.00' });
	});
});
