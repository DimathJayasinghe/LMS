import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentStatus, Prisma, Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  enrollmentFindMany: vi.fn(), enrollmentCount: vi.fn(), enrollmentGroupBy: vi.fn(), paymentFindMany: vi.fn(), courseFindMany: vi.fn(),
  clock: vi.fn(), settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => ({
  prisma: {
    enrollment: { findMany: m.enrollmentFindMany, count: m.enrollmentCount, groupBy: m.enrollmentGroupBy },
    payment: { findMany: m.paymentFindMany },
    course: { findMany: m.courseFindMany },
  },
}));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));

import { countOutstanding, listOutstanding, outstandingWhere } from './outstanding.service';

const desk = { userId: 'desk', role: Role.ADMIN };
const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const scope = { organizationId: 'org', timezone: 'Asia/Colombo', month: '2026-11' };
const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1', classType: 'PHYSICAL', createdAt: new Date('2026-01-10T05:00:00Z'),
  user: { id: 'u1', name: 'Nimal Perera', indexNumber: 1001, phone: '0771234567' },
  course: { id: 'c1', name: 'Physics', monthlyFee: new Prisma.Decimal('1500.00') }, ...over,
});
const pay = (enrollmentId: string, paymentMonth: string, status: PaymentStatus = PaymentStatus.SUCCESS) => ({ enrollmentId, paymentMonth, status });
const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers();
  at('2026-11-20T06:00:00Z'); // 20 November, 11:30 in Colombo: past grace
  vi.resetAllMocks();
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.settings = { 'fees.arrearsReportMonths': 3, 'fees.graceDays': 10, 'fees.graceRequiresPreviousMonthPaid': true };
  m.enrollmentFindMany.mockResolvedValue([row()]);
  m.enrollmentCount.mockResolvedValue(1);
  m.paymentFindMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('who may read the list', () => {
  it.each([Role.ADMIN, Role.SUPER_ADMIN])('lets %s read', async (role) => {
    await expect(listOutstanding({ userId: 'a', role }, {})).resolves.toMatchObject({ count: 1 });
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before any lookup', async (role) => {
    await expect(listOutstanding({ userId: 'a', role }, {})).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.enrollmentFindMany).not.toHaveBeenCalled();
  });
});

describe('which enrollments count as owing', () => {
  it('takes active enrollments of active courses for students who are not deactivated, with no paid row for the month', () => {
    const where = outstandingWhere(scope);
    expect(where).toMatchObject({
      organizationId: 'org', isActive: true,
      user: { deletedAt: null }, course: { isActive: true },
      payments: { none: { paymentMonth: '2026-11', status: PaymentStatus.SUCCESS } },
    });
  });

  it('ignores enrollments created after the requested month, using the Colombo month boundary', () => {
    // 1 December 00:00 in Colombo is 30 November 18:30 UTC.
    expect(outstandingWhere(scope).createdAt).toEqual({ lt: new Date('2026-11-30T18:30:00.000Z') });
  });

  it('narrows to a course or a teacher without dropping the active-course rule', () => {
    expect(outstandingWhere({ ...scope, courseWhere: { teacherId: 't1', id: 'c9' } }).course).toEqual({ teacherId: 't1', id: 'c9', isActive: true });
  });

  it('never lets a caller-supplied course filter switch the active-course rule off', () => {
    expect(outstandingWhere({ ...scope, courseWhere: { isActive: false } }).course).toEqual({ isActive: true });
  });

  it('reads the list through the same filter the report count uses', async () => {
    await listOutstanding(desk, { courseId: 'c1' });
    const listWhere = m.enrollmentFindMany.mock.calls[0]![0].where;
    expect(listWhere).toEqual(outstandingWhere({ ...scope, courseWhere: { id: 'c1' } }));
    expect(m.enrollmentCount).toHaveBeenCalledWith({ where: listWhere });
  });
});

describe('month handling', () => {
  it('defaults to the current Colombo month, even when UTC is still in the old month', async () => {
    at('2026-11-30T19:00:00Z'); // 1 December in Colombo
    const result = await listOutstanding(desk, {});
    expect(result.month).toBe('2026-12');
  });

  it('refuses a month that has not started yet, before reading enrollments', async () => {
    await expect(listOutstanding(desk, { month: '2026-12' })).rejects.toMatchObject({ code: 'MONTH_IN_FUTURE', statusCode: 400 });
    expect(m.enrollmentFindMany).not.toHaveBeenCalled();
  });

  it('accepts a past month', async () => {
    await expect(listOutstanding(desk, { month: '2026-08' })).resolves.toMatchObject({ month: '2026-08' });
  });
});

describe('rows', () => {
  it('returns the fields staff need and nothing sensitive', async () => {
    const { data } = await listOutstanding(desk, {});
    expect(data).toEqual([{
      enrollmentId: 'e1', studentId: 'u1', studentName: 'Nimal Perera', indexNumber: 1001, phone: '0771234567',
      courseId: 'c1', courseName: 'Physics', classType: 'PHYSICAL',
      monthsOwed: 3, amount: '1500.00', totalOwed: '4500.00', inGrace: false, graceUntil: '2026-11-10',
    }]);
    const select = m.enrollmentFindMany.mock.calls[0]![0].select;
    expect(select.user.select).toEqual({ id: true, name: true, indexNumber: true, phone: true });
  });

  it('pages and orders by course then index number', async () => {
    await listOutstanding(desk, { page: 3, limit: 25 });
    expect(m.enrollmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 50, take: 25, orderBy: [{ course: { name: 'asc' } }, { user: { indexNumber: 'asc' } }],
    }));
  });

  it('reads payments for the whole page in one query', async () => {
    m.enrollmentFindMany.mockResolvedValue([row(), row({ id: 'e2' }), row({ id: 'e3' })]);
    await listOutstanding(desk, {});
    expect(m.paymentFindMany).toHaveBeenCalledTimes(1);
    expect(m.paymentFindMany.mock.calls[0]![0].where.enrollmentId).toEqual({ in: ['e1', 'e2', 'e3'] });
  });

  it('skips the payment query for an empty page', async () => {
    m.enrollmentFindMany.mockResolvedValue([]);
    m.enrollmentCount.mockResolvedValue(0);
    await expect(listOutstanding(desk, {})).resolves.toMatchObject({ data: [], count: 0 });
    expect(m.paymentFindMany).not.toHaveBeenCalled();
  });
});

describe('months owed', () => {
  it('counts unpaid months inside the arrears window', async () => {
    m.paymentFindMany.mockResolvedValue([pay('e1', '2026-09')]);
    const { data } = await listOutstanding(desk, {});
    expect(data[0]).toMatchObject({ monthsOwed: 2, totalOwed: '3000.00', amount: '1500.00' });
  });

  it('does not count months before the student enrolled', async () => {
    m.enrollmentFindMany.mockResolvedValue([row({ createdAt: new Date('2026-10-05T05:00:00Z') })]);
    expect((await listOutstanding(desk, {})).data[0]).toMatchObject({ monthsOwed: 2 });
  });

  it('puts an enrollment made on the last evening of a month into the next Colombo month', async () => {
    // 31 October 19:00 UTC is 1 November 00:30 in Colombo, so October is not owed.
    m.enrollmentFindMany.mockResolvedValue([row({ createdAt: new Date('2026-10-31T19:00:00Z') })]);
    expect((await listOutstanding(desk, {})).data[0]).toMatchObject({ monthsOwed: 1 });
  });

  it('follows the owner window setting and always counts the requested month', async () => {
    m.settings['fees.arrearsReportMonths'] = 1;
    expect((await listOutstanding(desk, {})).data[0]).toMatchObject({ monthsOwed: 1 });
    m.settings['fees.arrearsReportMonths'] = 0;
    expect((await listOutstanding(desk, {})).data[0]).toMatchObject({ monthsOwed: 1 });
  });

  it('ignores a refunded or pending row as a payment', async () => {
    m.paymentFindMany.mockResolvedValue([pay('e1', '2026-10', PaymentStatus.REFUNDED), pay('e1', '2026-09', PaymentStatus.PENDING)]);
    expect((await listOutstanding(desk, {})).data[0]).toMatchObject({ monthsOwed: 3 });
  });

  it('prices every owed month through the single fee function', async () => {
    m.enrollmentFindMany.mockResolvedValue([row({ course: { id: 'c1', name: 'Physics', monthlyFee: new Prisma.Decimal('1234.50') } })]);
    expect((await listOutstanding(desk, {})).data[0]).toMatchObject({ amount: '1234.50', totalOwed: '3703.50' });
  });
});

describe('grace', () => {
  const inGraceFor = async (over: Record<string, unknown> = {}) => (await listOutstanding(desk, { month: undefined, ...over })).data[0]!;

  it('flags a student whose previous month is paid while the grace days last, with the last day', async () => {
    at('2026-11-05T06:00:00Z');
    m.paymentFindMany.mockResolvedValue([pay('e1', '2026-10')]);
    expect(await inGraceFor()).toMatchObject({ inGrace: true, graceUntil: '2026-11-10' });
  });

  it('does not flag after the grace days', async () => {
    at('2026-11-11T06:00:00Z');
    m.paymentFindMany.mockResolvedValue([pay('e1', '2026-10')]);
    expect(await inGraceFor()).toMatchObject({ inGrace: false });
  });

  it('does not flag when the previous month is unpaid and the owner requires it', async () => {
    at('2026-11-05T06:00:00Z');
    expect(await inGraceFor()).toMatchObject({ inGrace: false });
  });

  it('flags without the previous month when the owner dropped that rule', async () => {
    at('2026-11-05T06:00:00Z');
    m.settings['fees.graceRequiresPreviousMonthPaid'] = false;
    expect(await inGraceFor()).toMatchObject({ inGrace: true });
  });

  it('never gives grace back to a refunded current month', async () => {
    at('2026-11-05T06:00:00Z');
    m.paymentFindMany.mockResolvedValue([pay('e1', '2026-10'), pay('e1', '2026-11', PaymentStatus.REFUNDED)]);
    expect(await inGraceFor()).toMatchObject({ inGrace: false });
  });

  it('has no grace for a past month or when grace days are zero', async () => {
    at('2026-11-05T06:00:00Z');
    m.paymentFindMany.mockResolvedValue([pay('e1', '2026-09')]);
    expect((await listOutstanding(desk, { month: '2026-10' })).data[0]).toMatchObject({ inGrace: false, graceUntil: null });
    m.settings['fees.graceDays'] = 0;
    expect(await inGraceFor()).toMatchObject({ inGrace: false, graceUntil: null });
  });

  it('clamps the grace end to the last day of a short month', async () => {
    at('2026-02-02T06:00:00Z');
    m.settings['fees.graceDays'] = 31;
    m.paymentFindMany.mockResolvedValue([pay('e1', '2026-01')]);
    expect(await inGraceFor()).toMatchObject({ inGrace: true, graceUntil: '2026-02-28' });
  });
});

describe('countOutstanding (the figure on the financial report)', () => {
  it('counts the same enrollments and prices them through the fee function', async () => {
    m.enrollmentGroupBy.mockResolvedValue([{ courseId: 'c1', _count: { _all: 3 } }, { courseId: 'c2', _count: { _all: 2 } }]);
    m.courseFindMany.mockResolvedValue([{ id: 'c1', monthlyFee: new Prisma.Decimal('1500.00') }, { id: 'c2', monthlyFee: new Prisma.Decimal('2000.50') }]);
    await expect(countOutstanding(scope)).resolves.toEqual({ count: 5, expected: '8501.00' });
    expect(m.enrollmentGroupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['courseId'], where: outstandingWhere(scope) }));
  });

  it('answers zero without reading courses when nothing is owing', async () => {
    m.enrollmentGroupBy.mockResolvedValue([]);
    await expect(countOutstanding(scope)).resolves.toEqual({ count: 0, expected: '0.00' });
    expect(m.courseFindMany).not.toHaveBeenCalled();
  });

  it('matches the list: the filter is the one function', async () => {
    m.enrollmentGroupBy.mockResolvedValue([]);
    await countOutstanding({ ...scope, courseWhere: { teacherId: 't1' } });
    await listOutstanding(owner, {});
    expect(m.enrollmentGroupBy.mock.calls[0]![0].where.course).toEqual({ teacherId: 't1', isActive: true });
    expect(m.enrollmentFindMany.mock.calls[0]![0].where.course).toEqual({ isActive: true });
  });
});
