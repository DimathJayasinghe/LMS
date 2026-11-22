import { PaymentStatus, Prisma, type ClassType } from '@prisma/client';
import type { BulkSheetRow } from '@/utils/bulk-payment-rows';

/** An enrollment a sheet row may point at, already limited to the caller's organization. */
export interface BulkEnrollment {
  id: string;
  isActive: boolean;
  classType: ClassType;
  courseId: string;
  courseActive: boolean;
  monthlyFee: Prisma.Decimal;
  studentIndexNumber: number;
  studentActive: boolean;
}

export interface BulkExistingPayment {
  id: string;
  enrollmentId: string;
  paymentMonth: string;
  status: PaymentStatus;
}

export interface BulkAction {
  row: number;
  kind: 'create' | 'convert';
  enrollmentId: string;
  paymentMonth: string;
  amount: Prisma.Decimal;
  note: string;
  /** The unpaid or failed payment a `convert` turns into a paid one. */
  existingId?: string;
}

export interface BulkRowError {
  row: number;
  message: string;
}

export interface BulkPlan {
  actions: BulkAction[];
  errors: BulkRowError[];
}

interface PlanInput {
  rows: BulkSheetRow[];
  enrollments: BulkEnrollment[];
  payments: BulkExistingPayment[];
  /** The latest billing month a row may name: this month plus `fees.advanceMonthsAllowed`. */
  lastAllowedMonth: string;
}

const compositeKey = (indexNumber: number, courseId: string, classType: string): string => `${indexNumber}:${courseId}:${classType}`;
const paymentKey = (enrollmentId: string, month: string): string => `${enrollmentId}:${month}`;

/**
 * Decides, without touching the database, what each sheet row would do. A row breaks at most one rule and the first one it
 * breaks is reported: enrollment, student, enrollment state, course state, month, amount, then the month's existing payment.
 * The amount is never an override: the course fee is the only amount a bulk row can record.
 */
export const planBulkRows = ({ rows, enrollments, payments, lastAllowedMonth }: PlanInput): BulkPlan => {
  const byId = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
  const byComposite = new Map(enrollments.map((enrollment) => [compositeKey(enrollment.studentIndexNumber, enrollment.courseId, enrollment.classType), enrollment]));
  const paymentByMonth = new Map(payments.map((payment) => [paymentKey(payment.enrollmentId, payment.paymentMonth), payment]));
  const coveredBy = new Map<string, number>();
  const plan: BulkPlan = { actions: [], errors: [] };

  for (const { row, value } of rows) {
    const refuse = (message: string): void => { plan.errors.push({ row, message }); };
    if (!value) { refuse('Invalid row format.'); continue; }

    const enrollment = value.enrollmentId
      ? byId.get(value.enrollmentId)
      : byComposite.get(compositeKey(value.indexNumber!, value.courseId!, value.classType!));
    if (!enrollment) { refuse('Enrollment not found.'); continue; }
    if (!enrollment.studentActive) { refuse('The student account is deactivated.'); continue; }
    if (!enrollment.isActive) { refuse('The enrollment is not active.'); continue; }
    if (!enrollment.courseActive) { refuse('The course is not active.'); continue; }
    if (value.paymentMonth > lastAllowedMonth) {
      refuse(`Month ${value.paymentMonth} is later than the latest month allowed (${lastAllowedMonth}).`);
      continue;
    }
    if (value.amount !== undefined && !new Prisma.Decimal(value.amount).equals(enrollment.monthlyFee)) {
      refuse(`Amount must equal the course fee of ${enrollment.monthlyFee.toFixed(2)}.`);
      continue;
    }

    const key = paymentKey(enrollment.id, value.paymentMonth);
    const existing = paymentByMonth.get(key);
    if (existing?.status === PaymentStatus.REFUNDED) { refuse('This payment was refunded and cannot be changed.'); continue; }
    if (existing?.status === PaymentStatus.SUCCESS) { refuse('This month is already paid.'); continue; }
    const first = coveredBy.get(key);
    if (first !== undefined) { refuse(`Row ${first} already covers this enrollment and month.`); continue; }

    coveredBy.set(key, row);
    plan.actions.push({
      row,
      kind: existing ? 'convert' : 'create',
      enrollmentId: enrollment.id,
      paymentMonth: value.paymentMonth,
      amount: enrollment.monthlyFee,
      note: value.note ?? 'Bulk upload',
      ...(existing ? { existingId: existing.id } : {}),
    });
  }

  return plan;
};
