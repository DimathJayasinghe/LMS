import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: vi.fn(), payment: vi.fn(), setting: vi.fn(), enrollment: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: { user: { findUnique: m.user }, payment: { findFirst: m.payment }, enrollment: { findFirst: m.enrollment }, organizationSetting: { findUnique: m.setting } } }));
import { isStudentCovered } from './access.service';

beforeEach(() => { vi.resetAllMocks(); m.user.mockResolvedValue({ organizationId: 'org', organization: { timezone: 'Asia/Colombo' } }); m.setting.mockResolvedValue(null); m.enrollment.mockResolvedValue({ id: 'e' }); });
const payments = (rows: { status: 'SUCCESS' | 'REFUNDED'; month: string }[]) =>
  m.payment.mockImplementation(async ({ where }) => rows.some((row) => row.status === where.status && row.month === where.paymentMonth) ? { id: 'p' } : null);
const input = { userId: 'student', courseId: 'course', now: new Date('2026-02-10T06:00:00Z') };

describe('student coverage', () => {
  it('allows a current month payment', async () => {
    payments([{ status: 'SUCCESS', month: '2026-02' }]);
    expect(await isStudentCovered(input)).toMatchObject({ covered: true, reason: 'PAID', month: '2026-02' });
  });
  it('finds a course payment that belongs to a cancelled enrollment', async () => {
    payments([{ status: 'SUCCESS', month: '2026-02' }]);
    await isStudentCovered(input);
    expect(m.enrollment.mock.calls[0]?.[0].where).toEqual({ userId: 'student', courseId: 'course', isActive: true });
    expect(m.payment.mock.calls[0]?.[0].where.enrollment).toEqual({ userId: 'student', courseId: 'course' });
  });
  it('does not grant grace after the current month payment was refunded', async () => {
    payments([{ status: 'REFUNDED', month: '2026-02' }, { status: 'SUCCESS', month: '2026-01' }]);
    expect(await isStudentCovered(input)).toMatchObject({ covered: false, reason: 'UNPAID' });
  });
  it('allows a previous payment on day 10 and denies on day 11', async () => {
    payments([{ status: 'SUCCESS', month: '2026-01' }]);
    expect(await isStudentCovered(input)).toMatchObject({ covered: true, reason: 'GRACE' });
    expect(await isStudentCovered({ ...input, now: new Date('2026-02-11T06:00:00Z') })).toMatchObject({ covered: false, reason: 'UNPAID' });
  });
  it('denies grace when the previous month was unpaid or grace is disabled', async () => {
    m.payment.mockResolvedValue(null);
    expect(await isStudentCovered(input)).toMatchObject({ covered: false, reason: 'UNPAID' });
    m.setting.mockImplementation(async ({ where }) => where.organizationId_key.key === 'fees.graceDays' ? { value: 0 } : null);
    m.payment.mockClear();
    expect(await isStudentCovered(input)).toMatchObject({ covered: false, reason: 'UNPAID' });
    expect(m.payment).toHaveBeenCalledTimes(1);
  });
  it('restricts the check to a specified enrollment', async () => {
    payments([{ status: 'SUCCESS', month: '2026-02' }]);
    await isStudentCovered({ ...input, enrollmentId: 'e' });
    expect(m.enrollment.mock.calls[0]?.[0].where).toMatchObject({ id: 'e', userId: 'student', courseId: 'course', isActive: true });
    expect(m.payment.mock.calls[0]?.[0].where.enrollment).toEqual({ id: 'e', userId: 'student', courseId: 'course' });
  });
});

it('denies a new joiner with no previous successful payment', async () => {
  m.payment.mockResolvedValue(null);
  expect(await isStudentCovered(input)).toMatchObject({ covered: false, reason: 'UNPAID' });
});

it('does not grant grace without an active enrollment even when previous payment is optional', async () => {
  m.enrollment.mockResolvedValue(null);
  m.setting.mockImplementation(async ({ where }) => where.organizationId_key.key === 'fees.graceRequiresPreviousMonthPaid' ? { value: false } : null);
  expect(await isStudentCovered(input)).toMatchObject({ covered: false, reason: 'UNPAID' });
  expect(m.payment).not.toHaveBeenCalled();
});

it('can use the configured grace rule without a previous payment', async () => {
  m.payment.mockResolvedValue(null);
  m.setting.mockImplementation(async ({ where }) => where.organizationId_key.key === 'fees.graceRequiresPreviousMonthPaid' ? { value: false } : null);
  expect(await isStudentCovered(input)).toMatchObject({ covered: true, reason: 'GRACE' });
});

it('uses the preceding year for January grace', async () => {
  payments([{ status: 'SUCCESS', month: '2025-12' }]);
  expect(await isStudentCovered({ ...input, now: new Date('2026-01-05T00:00:00Z') })).toMatchObject({ reason: 'GRACE' });
});
