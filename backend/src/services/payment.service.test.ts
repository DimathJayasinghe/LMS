import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const { paymentAggregate, paymentCount } = vi.hoisted(() => ({
	paymentAggregate: vi.fn(),
	paymentCount: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		payment: { aggregate: paymentAggregate, count: paymentCount },
	},
}));

import { getPaymentsSummary } from './payment.service';

beforeEach(() => {
	paymentAggregate.mockReset();
	paymentCount.mockReset();
});

describe('getPaymentsSummary', () => {
	it('sums SUCCESS amounts and tallies per-status counts', async () => {
		paymentAggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal('7500') } });
		// Promise.all invokes the counts in order: paid (SUCCESS), pending, failed.
		paymentCount.mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

		const result = await getPaymentsSummary('2026-07');

		expect(result).toEqual({
			month: '2026-07',
			collectedTotal: '7500.00',
			paidCount: 3,
			pendingCount: 2,
			failedCount: 1,
		});
		// The rupee total is scoped to SUCCESS payments in that month only.
		expect(paymentAggregate).toHaveBeenCalledWith({
			_sum: { amount: true },
			where: { paymentMonth: '2026-07', status: 'SUCCESS' },
		});
		expect(paymentCount).toHaveBeenNthCalledWith(1, {
			where: { paymentMonth: '2026-07', status: 'SUCCESS' },
		});
		expect(paymentCount).toHaveBeenNthCalledWith(2, {
			where: { paymentMonth: '2026-07', status: 'PENDING' },
		});
		expect(paymentCount).toHaveBeenNthCalledWith(3, {
			where: { paymentMonth: '2026-07', status: 'FAILED' },
		});
	});

	it('returns a zeroed total for an empty month (null sum)', async () => {
		paymentAggregate.mockResolvedValue({ _sum: { amount: null } });
		paymentCount.mockResolvedValue(0);

		const result = await getPaymentsSummary('2026-01');

		expect(result).toEqual({
			month: '2026-01',
			collectedTotal: '0.00',
			paidCount: 0,
			pendingCount: 0,
			failedCount: 0,
		});
	});
});
