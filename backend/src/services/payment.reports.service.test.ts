import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma, Role } from '@prisma/client';

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
vi.mock('@/services/notification.service', () => ({ dispatch: vi.fn() }));

import { getFinancialReport } from './payment.service';

const D = (v: string) => new Prisma.Decimal(v);
const superAdmin = { userId: 'super-admin-1', role: Role.SUPER_ADMIN };
const teacher = { userId: 'teacher-1', role: Role.TEACHER };

beforeEach(() => {
	paymentGroupBy.mockReset();
	queryRaw.mockReset();
});

describe('getFinancialReport', () => {
	it('rejects roles outside super-admin and teacher at the service boundary', async () => {
		await expect(
			getFinancialReport('2026-07', {}, { userId: 'front-desk-1', role: Role.ADMIN }),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(paymentGroupBy).not.toHaveBeenCalled();
		expect(queryRaw).not.toHaveBeenCalled();
	});

	it('builds a 12-month zero-filled trend + breakdowns + outstanding', async () => {
		// Promise.all call order: groupBy(trend), raw(byCourse), raw(byTeacher),
		// groupBy(byMethod), raw(outstanding).
		paymentGroupBy
			.mockResolvedValueOnce([
				{ paymentMonth: '2026-07', _sum: { amount: D('5000'), refundedAmount: D('500') }, _count: { _all: 3 } },
				{ paymentMonth: '2026-05', _sum: { amount: D('2000'), refundedAmount: D('0') }, _count: { _all: 1 } },
			])
			.mockResolvedValueOnce([
				{ method: 'ONLINE', _sum: { amount: D('4000'), refundedAmount: D('500') }, _count: { _all: 2 } },
				{ method: 'BULK', _sum: { amount: D('1000'), refundedAmount: D('0') }, _count: { _all: 1 } },
			]);
		queryRaw
			.mockResolvedValueOnce([{ id: 'c1', name: 'Physics', year: 2026, total: '5000', cnt: 3n }])
			.mockResolvedValueOnce([{ id: 't1', name: 'Dr Silva', total: '5000', cnt: 3n }])
			.mockResolvedValueOnce([{ cnt: 4n, expected: '12000' }]);

		const r = await getFinancialReport('2026-07', {}, superAdmin);

		// trend: 12 entries ending at 2026-07, zero-filled where absent
		expect(r.trend).toHaveLength(12);
		expect(r.trend.at(-1)).toEqual({ month: '2026-07', collected: '4500.00', paidCount: 3 });
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
		expect(r.byTeacher).toEqual([
			{ teacherId: 't1', name: 'Dr Silva', collected: '5000.00', paidCount: 3 },
		]);
		expect(r.byMethod).toEqual([
			{ method: 'ONLINE', collected: '3500.00', paidCount: 2 },
			{ method: 'BULK', collected: '1000.00', paidCount: 1 },
		]);
		expect(r.outstanding).toEqual({ count: 4, expected: '12000.00' });
	});

	it('handles an empty month (no payments, nothing outstanding)', async () => {
		paymentGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		queryRaw
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ cnt: 0n, expected: 0 }]);

		const r = await getFinancialReport('2026-01', {}, superAdmin);
		expect(r.trend).toHaveLength(12);
		expect(r.trend.every((t) => t.collected === '0.00' && t.paidCount === 0)).toBe(true);
		expect(r.byCourse).toEqual([]);
		expect(r.byTeacher).toEqual([]);
		expect(r.byMethod).toEqual([]);
		expect(r.outstanding).toEqual({ count: 0, expected: '0.00' });
	});

	it('forces teacher reports to the authenticated teacher even when another teacher is requested', async () => {
		paymentGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

		await getFinancialReport(
			'2026-07',
			{ teacherId: '00000000-0000-4000-8000-000000000099', courseId: '00000000-0000-4000-8000-000000000010' },
			teacher,
		);

		expect(paymentGroupBy).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				where: expect.objectContaining({
					enrollment: {
						course: {
							teacherId: teacher.userId,
							id: '00000000-0000-4000-8000-000000000010',
						},
					},
				}),
			}),
		);
	});
});
