import { describe, expect, it } from 'vitest';
import { ClassType, PaymentStatus, Prisma } from '@prisma/client';
import { planBulkRows, type BulkEnrollment, type BulkExistingPayment } from './bulk-payment-plan';
import type { BulkSheetRow } from './bulk-payment-rows';

const ENROLLMENT = '00000000-0000-4000-8000-000000000001';
const COURSE = '10000000-0000-4000-8000-000000000001';

const enrollment = (over: Partial<BulkEnrollment> = {}): BulkEnrollment => ({
  id: ENROLLMENT, isActive: true, classType: ClassType.PHYSICAL, courseId: COURSE, courseActive: true,
  monthlyFee: new Prisma.Decimal('2500.00'), studentIndexNumber: 4021, studentActive: true, ...over,
});
const sheetRow = (row: number, over: Record<string, unknown> | null = {}): BulkSheetRow => ({
  row, value: over === null ? null : { enrollmentId: ENROLLMENT, paymentMonth: '2026-11', ...over },
});
const existing = (status: PaymentStatus, over: Partial<BulkExistingPayment> = {}): BulkExistingPayment => ({
  id: 'pay-1', enrollmentId: ENROLLMENT, paymentMonth: '2026-11', status, ...over,
});
const plan = (rows: BulkSheetRow[], over: { enrollments?: BulkEnrollment[]; payments?: BulkExistingPayment[]; lastAllowedMonth?: string } = {}) =>
  planBulkRows({ rows, enrollments: over.enrollments ?? [enrollment()], payments: over.payments ?? [], lastAllowedMonth: over.lastAllowedMonth ?? '2026-12' });

describe('planBulkRows — what a row becomes', () => {
  it('plans a new payment at the course fee when the sheet has no amount', () => {
    const result = plan([sheetRow(2)]);
    expect(result.errors).toEqual([]);
    expect(result.actions).toEqual([{ row: 2, kind: 'create', enrollmentId: ENROLLMENT, paymentMonth: '2026-11', amount: new Prisma.Decimal('2500.00'), note: 'Bulk upload' }]);
  });

  it('accepts an amount equal to the fee however it is written', () => {
    expect(plan([sheetRow(2, { amount: 2500 })]).errors).toEqual([]);
    expect(plan([sheetRow(2, { amount: 2500.0 })], { enrollments: [enrollment({ monthlyFee: new Prisma.Decimal('2500.50') })] }).errors).toHaveLength(1);
    expect(plan([sheetRow(2, { amount: 2500.5 })], { enrollments: [enrollment({ monthlyFee: new Prisma.Decimal('2500.50') })] }).errors).toEqual([]);
  });

  it('keeps the note from the sheet', () => {
    expect(plan([sheetRow(2, { note: 'Migrated from ledger' })]).actions[0]?.note).toBe('Migrated from ledger');
  });

  it('finds the enrollment by index number, course and class type', () => {
    const result = plan([sheetRow(2, { enrollmentId: undefined, indexNumber: 4021, courseId: COURSE, classType: ClassType.PHYSICAL })]);
    expect(result.errors).toEqual([]);
    expect(result.actions[0]?.enrollmentId).toBe(ENROLLMENT);
  });

  it('does not match an index number whose course or class type differs', () => {
    const base = { enrollmentId: undefined, indexNumber: 4021, courseId: COURSE, classType: ClassType.PHYSICAL };
    expect(plan([sheetRow(2, { ...base, indexNumber: 9999 })]).errors).toEqual([{ row: 2, message: 'Enrollment not found.' }]);
    expect(plan([sheetRow(2, { ...base, classType: ClassType.ONLINE })]).errors).toEqual([{ row: 2, message: 'Enrollment not found.' }]);
    expect(plan([sheetRow(2, { ...base, courseId: '10000000-0000-4000-8000-000000000002' })]).errors).toEqual([{ row: 2, message: 'Enrollment not found.' }]);
  });

  it('turns an unpaid or failed row into a conversion and keeps the row id', () => {
    for (const status of [PaymentStatus.PENDING, PaymentStatus.FAILED]) {
      const result = plan([sheetRow(2)], { payments: [existing(status)] });
      expect(result.errors).toEqual([]);
      expect(result.actions[0]).toMatchObject({ kind: 'convert', existingId: 'pay-1' });
    }
  });

  it('keeps the sheet row numbers on every action and error', () => {
    const result = plan([sheetRow(2), sheetRow(5, null), sheetRow(9, { paymentMonth: '2027-05' })]);
    expect(result.actions.map((a) => a.row)).toEqual([2]);
    expect(result.errors.map((e) => e.row)).toEqual([5, 9]);
  });
});

describe('planBulkRows — rows that are refused', () => {
  it('rejects a row that did not parse', () => {
    expect(plan([sheetRow(3, null)]).errors).toEqual([{ row: 3, message: 'Invalid row format.' }]);
  });

  it('rejects an unknown enrollment with the same words as one in another organization', () => {
    expect(plan([sheetRow(2, { enrollmentId: '00000000-0000-4000-8000-0000000000ff' })]).errors).toEqual([{ row: 2, message: 'Enrollment not found.' }]);
  });

  it.each([
    ['a deactivated student', { studentActive: false }, 'The student account is deactivated.'],
    ['an inactive enrollment', { isActive: false }, 'The enrollment is not active.'],
    ['an inactive course', { courseActive: false }, 'The course is not active.'],
  ])('rejects %s', (_label, over, message) => {
    expect(plan([sheetRow(2)], { enrollments: [enrollment(over)] }).errors).toEqual([{ row: 2, message }]);
  });

  it('accepts the last allowed month and rejects the month after it', () => {
    expect(plan([sheetRow(2, { paymentMonth: '2026-12' })]).errors).toEqual([]);
    expect(plan([sheetRow(2, { paymentMonth: '2027-01' })]).errors).toEqual([{ row: 2, message: 'Month 2027-01 is later than the latest month allowed (2026-12).' }]);
  });

  it('accepts any earlier month, so past fees can be recovered', () => {
    expect(plan([sheetRow(2, { paymentMonth: '2019-01' })]).errors).toEqual([]);
  });

  it('rejects an amount that differs from the course fee and never overrides it', () => {
    const result = plan([sheetRow(2, { amount: 1000 })]);
    expect(result.errors).toEqual([{ row: 2, message: 'Amount must equal the course fee of 2500.00.' }]);
    expect(result.actions).toEqual([]);
  });

  it.each([PaymentStatus.SUCCESS])('never overwrites a month that is already paid (%s)', (status) => {
    expect(plan([sheetRow(2)], { payments: [existing(status)] }).errors).toEqual([{ row: 2, message: 'This month is already paid.' }]);
  });

  it('keeps a refunded payment immutable', () => {
    expect(plan([sheetRow(2)], { payments: [existing(PaymentStatus.REFUNDED)] }).errors).toEqual([{ row: 2, message: 'This payment was refunded and cannot be changed.' }]);
  });

  it('refuses a second row for the same enrollment and month and keeps the first', () => {
    const result = plan([sheetRow(2), sheetRow(3)]);
    expect(result.actions.map((a) => a.row)).toEqual([2]);
    expect(result.errors).toEqual([{ row: 3, message: 'Row 2 already covers this enrollment and month.' }]);
  });

  it('allows the same enrollment in different months', () => {
    expect(plan([sheetRow(2), sheetRow(3, { paymentMonth: '2026-10' })]).errors).toEqual([]);
  });

  it('reports the first rule a row breaks, in a fixed order', () => {
    const broken = enrollment({ isActive: false });
    const result = plan([sheetRow(2, { paymentMonth: '2030-01', amount: 1 })], { enrollments: [broken], payments: [existing(PaymentStatus.SUCCESS, { paymentMonth: '2030-01' })] });
    expect(result.errors).toEqual([{ row: 2, message: 'The enrollment is not active.' }]);
    const monthFirst = plan([sheetRow(2, { paymentMonth: '2030-01', amount: 1 })]);
    expect(monthFirst.errors[0]?.message).toContain('later than the latest month');
    const amountFirst = plan([sheetRow(2, { amount: 1 })], { payments: [existing(PaymentStatus.SUCCESS)] });
    expect(amountFirst.errors[0]?.message).toContain('Amount must equal');
  });

  it('does not count a refused row as covering its month', () => {
    const result = plan([sheetRow(2, { amount: 1 }), sheetRow(3)]);
    expect(result.errors.map((e) => e.row)).toEqual([2]);
    expect(result.actions.map((a) => a.row)).toEqual([3]);
  });
});
