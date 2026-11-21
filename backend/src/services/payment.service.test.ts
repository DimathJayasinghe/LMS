import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const { adjustmentCreate, paymentAggregate, paymentCount, paymentFindUnique, paymentUpdate, paymentCreate, enrollmentFindUnique, dispatch, getCurrentPaymentMonth, transaction, readSheet } = vi.hoisted(() => ({
	adjustmentCreate: vi.fn(),
	paymentAggregate: vi.fn(),
	paymentCount: vi.fn(),
	paymentFindUnique: vi.fn(),
	paymentUpdate: vi.fn(),
	paymentCreate: vi.fn(),
	enrollmentFindUnique: vi.fn(),
	dispatch: vi.fn(),
	getCurrentPaymentMonth: vi.fn(() => '2026-07'),
	transaction: vi.fn(),
	readSheet: vi.fn(),
}));

const transactionClient = {
	payment: { findUnique: paymentFindUnique, update: paymentUpdate },
	paymentAdjustment: { create: adjustmentCreate },
};

vi.mock('@/config/database', () => ({
	prisma: {
		$transaction: transaction,
		payment: {
			aggregate: paymentAggregate,
			count: paymentCount,
			findUnique: paymentFindUnique,
			update: paymentUpdate,
			create: paymentCreate,
		},
		enrollment: { findUnique: enrollmentFindUnique },
	},
}));

vi.mock('@/services/notification.service', () => ({ dispatch }));
vi.mock('@/services/access.service', () => ({ getCurrentPaymentMonth }));
vi.mock('read-excel-file/node', () => ({ readSheet }));

import { bulkUploadPayments, getPaymentsSummary, overridePayment, collectEntrancePayment } from './payment.service';

beforeEach(() => {
	adjustmentCreate.mockReset();
	paymentAggregate.mockReset();
	paymentCount.mockReset();
	paymentFindUnique.mockReset();
	paymentUpdate.mockReset();
	paymentCreate.mockReset();
	enrollmentFindUnique.mockReset();
	dispatch.mockReset();
	getCurrentPaymentMonth.mockReturnValue('2026-07');
	transaction.mockReset();
	transaction.mockImplementation(async (callback) => callback(transactionClient));
	readSheet.mockReset();
});

describe('bulkUploadPayments — safe .xlsx parsing', () => {
	const file = {
		originalname: 'payments.xlsx',
		buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
	} as Express.Multer.File;

	it('rejects legacy or spoofed spreadsheet input before parsing', async () => {
		await expect(
			bulkUploadPayments({ ...file, originalname: 'payments.xls' }),
		).rejects.toMatchObject({ code: 'BULK_UPLOAD_INVALID_FILE', statusCode: 400 });
		expect(readSheet).not.toHaveBeenCalled();
	});

	it('reads the first sheet, normalizes headers, and creates a valid payment', async () => {
		readSheet.mockResolvedValueOnce([
			['Enrollment ID', 'Payment Month', 'Amount', 'Note'],
			['00000000-0000-4000-8000-000000000001', '2026-07', 2500, 'Front desk import'],
		]);
		enrollmentFindUnique.mockResolvedValueOnce({
			id: '00000000-0000-4000-8000-000000000001',
			course: { monthlyFee: new Prisma.Decimal('2500') },
			user: { id: 'student-1' },
		});
		paymentFindUnique.mockResolvedValueOnce(null);
		paymentCreate.mockResolvedValueOnce({ id: 'payment-1' });

		const result = await bulkUploadPayments(file);

		expect(result).toMatchObject({ total: 1, created: 1, updated: 0, skipped: 0, errors: [] });
		expect(paymentCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				enrollmentId: '00000000-0000-4000-8000-000000000001',
				paymentMonth: '2026-07',
				amount: 2500,
				method: 'BULK',
				status: 'SUCCESS',
			}),
		});
	});
});

describe('getPaymentsSummary', () => {
	it('sums SUCCESS amounts and tallies per-status counts', async () => {
		paymentAggregate.mockResolvedValue({
			_sum: { amount: new Prisma.Decimal('7500'), refundedAmount: new Prisma.Decimal('500') },
		});
		// Promise.all invokes the counts in order: paid, pending, failed, refunded.
		paymentCount.mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(1);

		const result = await getPaymentsSummary('2026-07');

		expect(result).toEqual({
			month: '2026-07',
			collectedTotal: '7000.00',
			paidCount: 3,
			pendingCount: 2,
			failedCount: 1,
			refundedCount: 1,
		});
		// The rupee total is scoped to SUCCESS payments in that month only.
		expect(paymentAggregate).toHaveBeenCalledWith({
			_sum: { amount: true, refundedAmount: true },
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
		expect(paymentCount).toHaveBeenNthCalledWith(4, {
			where: { paymentMonth: '2026-07', status: 'REFUNDED' },
		});
	});

	it('returns a zeroed total for an empty month (null sum)', async () => {
		paymentAggregate.mockResolvedValue({ _sum: { amount: null, refundedAmount: null } });
		paymentCount.mockResolvedValue(0);

		const result = await getPaymentsSummary('2026-01');

		expect(result).toEqual({
			month: '2026-01',
			collectedTotal: '0.00',
			paidCount: 0,
			pendingCount: 0,
			failedCount: 0,
			refundedCount: 0,
		});
	});
});

describe('overridePayment — method/collectedById', () => {
	const existingPayment = {
		id: 'pay-1',
		amount: new Prisma.Decimal('2500'),
		refundedAmount: new Prisma.Decimal('0'),
		status: 'PENDING',
	};
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
		adjustmentCreate.mockResolvedValueOnce({ id: 'adjustment-1' });

		await overridePayment('pay-1', { status: 'SUCCESS' as const, amount: 2500, note: 'Cash correction' }, 'admin-1');

		expect(paymentUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ method: 'MANUAL', collectedById: 'admin-1' }),
			}),
		);
		expect(adjustmentCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				paymentId: 'pay-1',
				createdById: 'admin-1',
				type: 'OVERRIDE',
				statusBefore: 'PENDING',
				statusAfter: 'SUCCESS',
				reason: 'Cash correction',
			}),
		});
	});

	it('refuses to rewrite a fully refunded payment', async () => {
		paymentFindUnique.mockResolvedValueOnce({ ...existingPayment, status: 'REFUNDED' });
		await expect(overridePayment('pay-1', {
			status: 'SUCCESS', amount: 2500, note: 'Reopen payment',
		}, 'admin-1')).rejects.toMatchObject({ code: 'PAYMENT_REFUNDED_IMMUTABLE', statusCode: 409 });
		expect(paymentUpdate).not.toHaveBeenCalled();
	});

	it('refuses to lower the gross amount below completed refunds', async () => {
		paymentFindUnique.mockResolvedValueOnce({ ...existingPayment, refundedAmount: new Prisma.Decimal('1000') });
		await expect(overridePayment('pay-1', {
			status: 'SUCCESS', amount: 999, note: 'Incorrect reduction',
		}, 'admin-1')).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_BELOW_REFUNDED', statusCode: 409 });
		expect(adjustmentCreate).not.toHaveBeenCalled();
	});
});

describe('collectEntrancePayment', () => {
	const activeEnrollment = {
		id: 'e1',
		isActive: true,
		userId: 'u1',
		course: { name: 'Physics', monthlyFee: new Prisma.Decimal('2500') },
	};
	const created = {
		id: 'pay-new',
		amount: new Prisma.Decimal('2500'),
		status: 'SUCCESS',
		method: 'ENTRANCE',
		paymentMonth: '2026-07',
		enrollment: { userId: 'u1', course: { name: 'Physics' } },
	};

	it('creates a new SUCCESS/ENTRANCE payment when none exists, defaulting the amount to monthlyFee', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce(null);
		paymentCreate.mockResolvedValueOnce(created);

		const result = await collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' });

		expect(paymentCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					enrollmentId: 'e1',
					paymentMonth: '2026-07',
					amount: 2500,
					status: 'SUCCESS',
					method: 'ENTRANCE',
					collectedById: 'admin-1',
				}),
			}),
		);
		expect(result).toEqual(created);
	});

	it('updates an existing PENDING/FAILED row instead of creating a duplicate', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce({ id: 'pay-old', status: 'FAILED', payhereId: null });
		paymentUpdate.mockResolvedValueOnce(created);

		await collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' });

		expect(paymentUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'pay-old' } }),
		);
		expect(paymentCreate).not.toHaveBeenCalled();
	});

	it('rejects with ALREADY_PAID_ONLINE when the month is already a confirmed online payment', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce({ id: 'pay-online', status: 'SUCCESS', payhereId: 'payhere_1' });

		await expect(
			collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' }),
		).rejects.toMatchObject({ code: 'ALREADY_PAID_ONLINE', statusCode: 409 });
		expect(paymentUpdate).not.toHaveBeenCalled();
		expect(paymentCreate).not.toHaveBeenCalled();
	});

	it('does not overwrite a fully refunded payment', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce({ id: 'pay-refunded', status: 'REFUNDED', payhereId: null });

		await expect(
			collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' }),
		).rejects.toMatchObject({ code: 'PAYMENT_REFUNDED_IMMUTABLE', statusCode: 409 });
		expect(paymentUpdate).not.toHaveBeenCalled();
	});

	it('rejects ENROLLMENT_NOT_ACTIVE before touching Payment', async () => {
		enrollmentFindUnique.mockResolvedValueOnce({ ...activeEnrollment, isActive: false });

		await expect(
			collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-07' }),
		).rejects.toMatchObject({ code: 'ENROLLMENT_NOT_ACTIVE', statusCode: 400 });
		expect(paymentFindUnique).not.toHaveBeenCalled();
	});

	it('rejects FUTURE_MONTH', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);

		await expect(
			collectEntrancePayment('admin-1', { enrollmentId: 'e1', paymentMonth: '2026-08' }),
		).rejects.toMatchObject({ code: 'FUTURE_MONTH', statusCode: 400 });
		expect(paymentFindUnique).not.toHaveBeenCalled();
	});

	it('persists collectedAtInstituteId/collectedViaBarcode when passed', async () => {
		enrollmentFindUnique.mockResolvedValueOnce(activeEnrollment);
		paymentFindUnique.mockResolvedValueOnce(null);
		paymentCreate.mockResolvedValueOnce(created);

		await collectEntrancePayment('admin-1', {
			enrollmentId: 'e1',
			paymentMonth: '2026-07',
			collectedAtInstituteId: 'inst-1',
			collectedViaBarcode: 'NUG-001',
		});

		expect(paymentCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					collectedAtInstituteId: 'inst-1',
					collectedViaBarcode: 'NUG-001',
				}),
			}),
		);
	});
});
