import { PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION } from '@/utils/constants';
import { withAdvisoryLock } from '@/utils/advisory-lock';
import { billingMonthOf, shiftMonth } from '@/utils/org-time';
import { parseBulkWorkbook } from '@/utils/bulk-payment-rows';
import { planBulkRows, type BulkAction, type BulkRowError } from '@/utils/bulk-payment-plan';
import { hasPrismaCode } from '@/utils/prisma-error';
import { logInTransaction } from '@/services/audit.service';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { createSettingsReader } from '@/services/settings.service';
import { loadBulkContext } from '@/services/payment-bulk-lookup.service';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { AuditContext } from '@/types/audit.types';

export interface BulkUploadOutcome {
  dryRun: boolean;
  /** True only when the payments were written: a preview, or a file with any refused row, writes nothing. */
  applied: boolean;
  total: number;
  /** Rows that become new payments (or would, in a preview or when another row is refused). */
  created: number;
  /** Rows that turn an unpaid or failed payment into a paid one. */
  updated: number;
  errors: BulkRowError[];
}

// A few hundred rows of two writes each; the owner can raise bulk.maxRows, so leave room.
const APPLY_TIMEOUT_MS = 120_000;

const conflict = (row: number): AppError =>
  new AppError('BULK_UPLOAD_CONFLICT', 409, `Row ${row} changed while the file was being applied. Nothing was saved. Run the preview again.`);

const writePayment = async (tx: Prisma.TransactionClient, action: BulkAction, collectedById: string): Promise<{ id: string }> => {
  const fields = { status: PaymentStatus.SUCCESS, method: PaymentMethod.BULK, amount: action.amount, collectedById, note: action.note };
  try {
    // Both writes are conditional, so a payment that turned up after the preview makes the whole file fail rather than be overwritten.
    return action.kind === 'create'
      ? await tx.payment.create({ data: { enrollmentId: action.enrollmentId, paymentMonth: action.paymentMonth, ...fields }, select: { id: true } })
      : await tx.payment.update({ where: { id: action.existingId!, status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } }, data: fields, select: { id: true } });
  } catch (error) {
    if (hasPrismaCode(error, 'P2002') || hasPrismaCode(error, 'P2025')) throw conflict(action.row);
    throw error;
  }
};

/**
 * Records fees that were paid outside the system (migration and recovery, D-OPS-1). Owner only. Every row must name an active
 * enrollment, a month up to `fees.advanceMonthsAllowed` ahead and the course fee exactly; a month that is already paid is never
 * overwritten. The file is all or nothing: one refused row, or a failure part way, saves nothing. `dryRun` reports the same
 * result without writing.
 */
export const bulkUploadPayments = async (
  actor: AuthenticatedUser,
  file: Express.Multer.File,
  options: { dryRun: boolean },
  context: AuditContext,
): Promise<BulkUploadOutcome> => {
  if (actor.role !== Role.SUPER_ADMIN) throw new AppError('FORBIDDEN', 403, 'Only the owner can upload payments in bulk.');
  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const setting = createSettingsReader(organizationId);
  const [maxRows, advanceMonths] = await Promise.all([setting('bulk.maxRows'), setting('fees.advanceMonthsAllowed')]);

  const rows = await parseBulkWorkbook(file, maxRows);
  const { enrollments, payments } = await loadBulkContext(organizationId, rows);
  const plan = planBulkRows({ rows, enrollments, payments, lastAllowedMonth: shiftMonth(billingMonthOf(new Date(), timezone), advanceMonths) });

  const created = plan.actions.filter((action) => action.kind === 'create').length;
  const outcome = { dryRun: options.dryRun, total: rows.length, created, updated: plan.actions.length - created, errors: plan.errors };
  if (options.dryRun || plan.errors.length) return { ...outcome, applied: false };

  await prisma.$transaction(async (tx) => {
    await withAdvisoryLock(tx, 'payment-bulk', organizationId, 'upload');
    for (const action of plan.actions) {
      const payment = await writePayment(tx, action, actor.userId);
      await logInTransaction(tx, {
        action: AUDIT_ACTION.PAYMENT_BULK_ROW_APPLIED, description: `Bulk upload row ${action.row} recorded`, targetType: 'Payment', targetId: payment.id, organizationId, context,
        metadata: { row: action.row, kind: action.kind, enrollmentId: action.enrollmentId, paymentMonth: action.paymentMonth, amount: action.amount.toFixed(2) },
      });
    }
    await logInTransaction(tx, {
      action: AUDIT_ACTION.PAYMENT_BULK_UPLOAD, description: `Bulk upload: ${outcome.created} created, ${outcome.updated} updated`, targetType: 'Payment', organizationId, context,
      metadata: { total: outcome.total, created: outcome.created, updated: outcome.updated, fileName: file.originalname.slice(0, 100) },
    });
  }, { timeout: APPLY_TIMEOUT_MS });

  logger.info({ total: outcome.total, created: outcome.created, updated: outcome.updated }, 'Payment bulk upload applied');
  return { ...outcome, applied: true };
};
