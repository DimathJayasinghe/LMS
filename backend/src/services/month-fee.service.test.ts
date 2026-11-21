import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { getMonthFeeForEnrollment } from './month-fee.service';

describe('getMonthFeeForEnrollment', () => {
  it('is the course monthly fee for any month today', () => {
    const enrollment = { course: { monthlyFee: new Prisma.Decimal('1500.00') } };
    expect(getMonthFeeForEnrollment(enrollment, '2026-11').toFixed(2)).toBe('1500.00');
    expect(getMonthFeeForEnrollment(enrollment, '2025-01').toFixed(2)).toBe('1500.00');
  });

  it('accepts a number or string fee and returns a Decimal', () => {
    expect(getMonthFeeForEnrollment({ course: { monthlyFee: '99.5' } }, '2026-11')).toBeInstanceOf(Prisma.Decimal);
    expect(getMonthFeeForEnrollment({ course: { monthlyFee: 99.5 } }, '2026-11').toFixed(2)).toBe('99.50');
  });
});
