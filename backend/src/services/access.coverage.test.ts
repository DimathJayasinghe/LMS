import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: vi.fn(), payment: vi.fn(), setting: vi.fn(), enrollment: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: { user: { findUnique: m.user }, payment: { findFirst: m.payment }, enrollment: { findFirst: m.enrollment }, organizationSetting: { findUnique: m.setting } } }));
import { isStudentCovered } from './access.service';

beforeEach(() => { vi.resetAllMocks(); m.user.mockResolvedValue({ organizationId: 'org', organization: { timezone: 'Asia/Colombo' } }); m.setting.mockResolvedValue(null); m.enrollment.mockResolvedValue({ id: 'e' }); });
const input = { userId: 'student', courseId: 'course', now: new Date('2026-02-10T06:00:00Z') };

describe('student coverage', () => {
  it('allows a current month payment', async () => {
    m.payment.mockResolvedValueOnce({ id: 'p' });
    expect(await isStudentCovered(input)).toMatchObject({ covered: true, reason: 'PAID', month: '2026-02' });
    expect(m.payment.mock.calls[0]?.[0].where.enrollment).toEqual({ userId: 'student', courseId: 'course', isActive: true });
  });
  it('allows a previous payment on day 10 and denies on day 11', async () => {
    m.payment.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p' });
    expect(await isStudentCovered(input)).toMatchObject({ covered: true, reason: 'GRACE' });
    m.payment.mockResolvedValue(null);
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
  it('restricts lookup to a specified enrollment and active course enrollments', async () => {
    m.payment.mockResolvedValueOnce({ id: 'p' });
    await isStudentCovered({ ...input, enrollmentId: 'e' });
    expect(m.payment.mock.calls[0]?.[0].where.enrollment).toMatchObject({ id: 'e', userId: 'student', courseId: 'course', isActive: true });
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
  m.payment.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'previous' });
  expect(await isStudentCovered({ ...input, now: new Date('2026-01-05T00:00:00Z') })).toMatchObject({ reason: 'GRACE' });
  expect(m.payment.mock.calls[1]?.[0].where.paymentMonth).toBe('2025-12');
});
