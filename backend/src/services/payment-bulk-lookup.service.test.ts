import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassType, PaymentStatus, Prisma } from '@prisma/client';

const m = vi.hoisted(() => ({ enrollments: vi.fn(), payments: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: { enrollment: { findMany: m.enrollments }, payment: { findMany: m.payments } } }));

import { loadBulkContext } from './payment-bulk-lookup.service';

const ORG = 'org-1';
const E1 = '00000000-0000-4000-8000-000000000001';
const COURSE = '10000000-0000-4000-8000-000000000001';
const row = (n: number, value: Record<string, unknown> | null) => ({ row: n, value: value as never });

const found = (over: Record<string, unknown> = {}) => ({
  id: E1, isActive: true, classType: ClassType.PHYSICAL, courseId: COURSE,
  course: { isActive: true, monthlyFee: new Prisma.Decimal('2500.00') },
  user: { indexNumber: 4021, deletedAt: null }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.enrollments.mockResolvedValue([found()]);
  m.payments.mockResolvedValue([]);
});

describe('loadBulkContext', () => {
  it('reads nothing when no row parsed', async () => {
    expect(await loadBulkContext(ORG, [row(2, null)])).toEqual({ enrollments: [], payments: [] });
    expect(m.enrollments).not.toHaveBeenCalled();
    expect(m.payments).not.toHaveBeenCalled();
  });

  it('limits the enrollment search to the caller organization', async () => {
    await loadBulkContext(ORG, [row(2, { enrollmentId: E1, paymentMonth: '2026-11' })]);
    expect(m.enrollments).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG, OR: [{ id: { in: [E1] } }] } }));
  });

  it('asks for composite rows by index number, course and class type, once each', async () => {
    const value = { indexNumber: 4021, courseId: COURSE, classType: ClassType.PHYSICAL, paymentMonth: '2026-11' };
    await loadBulkContext(ORG, [row(2, value), row(3, { ...value, paymentMonth: '2026-10' })]);
    const where = m.enrollments.mock.calls[0]![0].where as { OR: unknown[] };
    expect(where.OR).toEqual([{ user: { indexNumber: 4021 }, courseId: COURSE, classType: ClassType.PHYSICAL }]);
  });

  it('prefers the enrollment id when a row also carries a composite key', async () => {
    await loadBulkContext(ORG, [row(2, { enrollmentId: E1, indexNumber: 4021, courseId: COURSE, classType: ClassType.PHYSICAL, paymentMonth: '2026-11' })]);
    expect((m.enrollments.mock.calls[0]![0].where as { OR: unknown[] }).OR).toEqual([{ id: { in: [E1] } }]);
  });

  it('maps an enrollment and reads its payments for the months named', async () => {
    m.payments.mockResolvedValue([{ id: 'p1', enrollmentId: E1, paymentMonth: '2026-11', status: PaymentStatus.PENDING }]);
    const result = await loadBulkContext(ORG, [row(2, { enrollmentId: E1, paymentMonth: '2026-11' }), row(3, { enrollmentId: E1, paymentMonth: '2026-10' })]);
    expect(result.enrollments).toEqual([{
      id: E1, isActive: true, classType: ClassType.PHYSICAL, courseId: COURSE, courseActive: true,
      monthlyFee: new Prisma.Decimal('2500.00'), studentIndexNumber: 4021, studentActive: true,
    }]);
    expect(m.payments).toHaveBeenCalledWith(expect.objectContaining({ where: { enrollmentId: { in: [E1] }, paymentMonth: { in: ['2026-11', '2026-10'] } } }));
    expect(result.payments).toEqual([{ id: 'p1', enrollmentId: E1, paymentMonth: '2026-11', status: PaymentStatus.PENDING }]);
  });

  it('marks a soft-deleted student as not active', async () => {
    m.enrollments.mockResolvedValue([found({ user: { indexNumber: 4021, deletedAt: new Date('2026-01-01') } })]);
    expect((await loadBulkContext(ORG, [row(2, { enrollmentId: E1, paymentMonth: '2026-11' })])).enrollments[0]?.studentActive).toBe(false);
  });

  it('skips the payment read when no enrollment matched', async () => {
    m.enrollments.mockResolvedValue([]);
    expect(await loadBulkContext(ORG, [row(2, { enrollmentId: E1, paymentMonth: '2026-11' })])).toEqual({ enrollments: [], payments: [] });
    expect(m.payments).not.toHaveBeenCalled();
  });
});
