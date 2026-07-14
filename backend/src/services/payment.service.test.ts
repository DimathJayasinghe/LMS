import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const { paymentAggregate, paymentCount, paymentFindUnique, paymentUpdate, dispatch } = vi.hoisted(() => ({
	paymentAggregate: vi.fn(),
	paymentCount: vi.fn(),
	paymentFindUnique: vi.fn(),
	paymentUpdate: vi.fn(),
	dispatch: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		payment: {
			aggregate: paymentAggregate,
			count: paymentCount,
			findUnique: paymentFindUnique,
			update: paymentUpdate,
		},
	},
}));

vi.mock('@/services/notification.service', () => ({ dispatch }));

import { getPaymentsSummary, overridePayment } from './payment.service';

beforeEach(() => {
	paymentAggregate.mockReset();
	paymentCount.mockReset();
	paymentFindUnique.mockReset();
	paymentUpdate.mockReset();
	dispatch.mockReset();
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

describe('overridePayment — method/collectedById', () => {
	const existingPayment = { id: 'pay-1', status: 'PENDING' };
	const updatedPayment = {
		id: 'pay-1',
		amount: new Prisma.Decimal('2500'),
		status: 'SUCCESS',
		method: 'MANUAL',
		collectedById: 'admin-1',
		paymentMonth: '2026-07',
		enrollment: { userId: 'u1', course: { name: 'Physics' } },
	};

	it('sets method: MANUAL and collectedById to the acting admin', async () => {
		paymentFindUnique.mockResolvedValueOnce(existingPayment);
		paymentUpdate.mockResolvedValueOnce(updatedPayment);

		await overridePayment('pay-1', { status: 'SUCCESS' as const, amount: 2500 }, 'admin-1');

		expect(paymentUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ method: 'MANUAL', collectedById: 'admin-1' }),
			}),
		);
	});
});
