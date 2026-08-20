import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentStatus, Prisma, Role } from '@prisma/client';

const { adjustmentCreate, adjustmentFindMany, paymentFindUnique, paymentUpdateMany, transaction } = vi.hoisted(() => ({
  adjustmentCreate: vi.fn(),
  adjustmentFindMany: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

const tx = {
  payment: { findUnique: paymentFindUnique, updateMany: paymentUpdateMany },
  paymentAdjustment: { create: adjustmentCreate },
};

vi.mock('@/config/database', () => ({
  prisma: {
    $transaction: transaction,
    payment: { findUnique: paymentFindUnique },
    paymentAdjustment: { findMany: adjustmentFindMany },
  },
}));

import { listPaymentAdjustments, refundPayment } from './payment-adjustment.service';

const owner = { userId: 'owner-1', role: Role.SUPER_ADMIN };
const input = { amount: 500, reason: 'Duplicate cash collection', externalReference: 'CASH-REF-100' };
const refundablePayment = {
  id: 'payment-1',
  amount: new Prisma.Decimal(2500),
  refundedAmount: new Prisma.Decimal(500),
  status: PaymentStatus.SUCCESS,
};

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (callback) => callback(tx));
  paymentUpdateMany.mockResolvedValue({ count: 1 });
  adjustmentCreate.mockResolvedValue({ id: 'adjustment-1' });
});

describe('refundPayment', () => {
  it('defaults-deny non-SUPER_ADMIN callers before reading the payment', async () => {
    await expect(refundPayment('payment-1', input, { userId: 'admin-1', role: Role.ADMIN }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns PAYMENT_NOT_FOUND before refundability checks', async () => {
    paymentFindUnique.mockResolvedValue(null);
    await expect(refundPayment('payment-1', input, owner))
      .rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND', statusCode: 404 });
  });

  it.each([PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.REFUNDED])(
    'rejects a %s payment without writing',
    async (status) => {
      paymentFindUnique.mockResolvedValue({ ...refundablePayment, status });
      await expect(refundPayment('payment-1', input, owner))
        .rejects.toMatchObject({ code: 'PAYMENT_NOT_REFUNDABLE', statusCode: 409 });
      expect(paymentUpdateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects a refund above the remaining gross balance', async () => {
    paymentFindUnique.mockResolvedValue(refundablePayment);
    await expect(refundPayment('payment-1', { ...input, amount: 2001 }, owner))
      .rejects.toMatchObject({ code: 'REFUND_EXCEEDS_REMAINING', statusCode: 409 });
    expect(adjustmentCreate).not.toHaveBeenCalled();
  });

  it('records a partial refund while keeping SUCCESS', async () => {
    paymentFindUnique.mockResolvedValue(refundablePayment);
    const result = await refundPayment('payment-1', input, owner);

    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: PaymentStatus.SUCCESS, refundedAmount: refundablePayment.refundedAmount },
      data: { refundedAmount: new Prisma.Decimal(1000), status: PaymentStatus.SUCCESS },
    });
    expect(adjustmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: 'payment-1',
        createdById: 'owner-1',
        type: 'REFUND',
        amount: new Prisma.Decimal(500),
        statusBefore: PaymentStatus.SUCCESS,
        statusAfter: PaymentStatus.SUCCESS,
        reason: input.reason,
        externalReference: input.externalReference,
      }),
      select: expect.any(Object),
    });
    expect(result.remainingRefundable).toBe('1500.00');
  });

  it('marks an exact remaining-balance refund as REFUNDED', async () => {
    paymentFindUnique.mockResolvedValue(refundablePayment);
    await refundPayment('payment-1', { ...input, amount: 2000 }, owner);
    expect(paymentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { refundedAmount: new Prisma.Decimal(2500), status: PaymentStatus.REFUNDED },
    }));
  });

  it('rejects a concurrent balance change instead of risking an over-refund', async () => {
    paymentFindUnique.mockResolvedValue(refundablePayment);
    paymentUpdateMany.mockResolvedValue({ count: 0 });
    await expect(refundPayment('payment-1', input, owner))
      .rejects.toMatchObject({ code: 'REFUND_CONFLICT', statusCode: 409 });
    expect(adjustmentCreate).not.toHaveBeenCalled();
  });
});

describe('listPaymentAdjustments', () => {
  it('allows a student to read only their own payment ledger', async () => {
    paymentFindUnique.mockResolvedValue({ enrollment: { userId: 'student-1' } });
    adjustmentFindMany.mockResolvedValue([{ id: 'adjustment-1' }]);
    await expect(listPaymentAdjustments('payment-1', { userId: 'student-1', role: Role.STUDENT }))
      .resolves.toEqual([{ id: 'adjustment-1' }]);
  });

  it("rejects a student reading another student's ledger", async () => {
    paymentFindUnique.mockResolvedValue({ enrollment: { userId: 'student-2' } });
    await expect(listPaymentAdjustments('payment-1', { userId: 'student-1', role: Role.STUDENT }))
      .rejects.toMatchObject({ code: 'PAYMENT_FORBIDDEN', statusCode: 403 });
    expect(adjustmentFindMany).not.toHaveBeenCalled();
  });
});
