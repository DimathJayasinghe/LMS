import { PaymentAdjustmentType, PaymentStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import type { RefundPaymentInput } from '@/schemas/payment.schema';
import type { AuthenticatedUser } from '@/types/auth.types';
import { AppError } from '@/utils/app-error';

const adjustmentSelect = {
  id: true,
  type: true,
  amount: true,
  statusBefore: true,
  statusAfter: true,
  paymentAmountBefore: true,
  paymentAmountAfter: true,
  reason: true,
  externalReference: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.PaymentAdjustmentSelect;

export type PaymentAdjustmentRecord = Prisma.PaymentAdjustmentGetPayload<{
  select: typeof adjustmentSelect;
}>;

interface RefundPaymentResult {
  payment: {
    id: string;
    amount: Prisma.Decimal;
    refundedAmount: Prisma.Decimal;
    status: PaymentStatus;
  };
  adjustment: PaymentAdjustmentRecord;
  remainingRefundable: string;
}

const assertLedgerReader = (actor: AuthenticatedUser): void => {
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN && actor.role !== Role.STUDENT) {
    throw new AppError('FORBIDDEN', 403, 'You do not have access to payment adjustments.');
  }
};

export const listPaymentAdjustments = async (
  paymentId: string,
  actor: AuthenticatedUser,
): Promise<PaymentAdjustmentRecord[]> => {
  assertLedgerReader(actor);
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { enrollment: { select: { userId: true } } },
  });
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found.');
  if (actor.role === Role.STUDENT && payment.enrollment.userId !== actor.userId) {
    throw new AppError('PAYMENT_FORBIDDEN', 403, 'You do not have access to this payment.');
  }

  return prisma.paymentAdjustment.findMany({
    where: { paymentId },
    select: adjustmentSelect,
    orderBy: { createdAt: 'desc' },
  });
};

export const refundPayment = async (
  paymentId: string,
  input: RefundPaymentInput,
  actor: AuthenticatedUser,
): Promise<RefundPaymentResult> => {
  if (actor.role !== Role.SUPER_ADMIN) {
    throw new AppError('FORBIDDEN', 403, 'Only the super administrator can record refunds.');
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, amount: true, refundedAmount: true, status: true },
    });
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found.');
    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new AppError('PAYMENT_NOT_REFUNDABLE', 409, 'Only a successful payment with a remaining balance can be refunded.');
    }

    const refundAmount = new Prisma.Decimal(input.amount);
    const remaining = payment.amount.minus(payment.refundedAmount);
    if (refundAmount.greaterThan(remaining)) {
      throw new AppError('REFUND_EXCEEDS_REMAINING', 409, `Refund cannot exceed the remaining ${remaining.toFixed(2)}.`);
    }

    const refundedAmount = payment.refundedAmount.plus(refundAmount);
    const status = refundedAmount.equals(payment.amount) ? PaymentStatus.REFUNDED : PaymentStatus.SUCCESS;
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.SUCCESS, refundedAmount: payment.refundedAmount },
      data: { refundedAmount, status },
    });
    if (updated.count !== 1) {
      throw new AppError('REFUND_CONFLICT', 409, 'The refundable balance changed. Refresh and try again.');
    }

    const adjustment = await tx.paymentAdjustment.create({
      data: {
        paymentId: payment.id,
        createdById: actor.userId,
        type: PaymentAdjustmentType.REFUND,
        amount: refundAmount,
        statusBefore: payment.status,
        statusAfter: status,
        paymentAmountBefore: payment.amount,
        paymentAmountAfter: payment.amount,
        reason: input.reason,
        externalReference: input.externalReference,
      },
      select: adjustmentSelect,
    });

    return {
      payment: { id: payment.id, amount: payment.amount, refundedAmount, status },
      adjustment,
      remainingRefundable: remaining.minus(refundAmount).toFixed(2),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};
