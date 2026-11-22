import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassType } from '@prisma/client';

const m = vi.hoisted(() => ({ findMany: vi.fn(), covered: vi.fn(), setting: vi.fn(), reader: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: { enrollment: { findMany: m.findMany } } }));
vi.mock('@/services/access.service', () => ({ isStudentCovered: m.covered }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: m.reader }));

import { assertScanAllowed, evaluateScan } from './scan-context.service';

const NOW = new Date('2026-11-12T04:00:00.000Z');
const input = { studentId: 'stu-1', courseId: 'course-1', organizationId: 'org-1', now: NOW };
const coverage = (reason: 'PAID' | 'GRACE' | 'UNPAID') => ({ covered: reason !== 'UNPAID', reason, month: '2026-11', graceUntil: '2026-11-10' });
const physical = { id: 'e-phys', classType: ClassType.PHYSICAL };
const online = { id: 'e-online', classType: ClassType.ONLINE };

beforeEach(() => {
  vi.clearAllMocks();
  m.findMany.mockResolvedValue([physical]);
  m.covered.mockResolvedValue(coverage('PAID'));
  m.setting.mockImplementation(async (key: string) => (key.endsWith('Policy') ? 'WARN' : undefined));
  m.reader.mockReturnValue(m.setting);
});

const policies = (unpaid: 'WARN' | 'BLOCK', notEnrolled: 'WARN' | 'BLOCK') =>
  m.setting.mockImplementation(async (key: string) => (key === 'attendance.scan.unpaidPolicy' ? unpaid : notEnrolled));

describe('evaluateScan — enrollment state', () => {
  it('is ENROLLED with a physical enrollment, checking fees on that enrollment', async () => {
    const { context } = await evaluateScan(input);
    expect(context.enrollmentState).toBe('ENROLLED');
    expect(m.covered).toHaveBeenCalledWith({ userId: 'stu-1', courseId: 'course-1', enrollmentId: 'e-phys', now: NOW });
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'stu-1', courseId: 'course-1', isActive: true } }));
  });

  it('is MODE_MISMATCH for an online-only enrollment, checking fees on that enrollment', async () => {
    m.findMany.mockResolvedValue([online]);
    const { context } = await evaluateScan(input);
    expect(context.enrollmentState).toBe('MODE_MISMATCH');
    expect(context.warnings).toContain('MODE_MISMATCH');
    expect(m.covered).toHaveBeenCalledWith(expect.objectContaining({ enrollmentId: 'e-online' }));
  });

  it('prefers the physical enrollment when the student holds both', async () => {
    m.findMany.mockResolvedValue([online, physical]);
    const { context } = await evaluateScan(input);
    expect(context.enrollmentState).toBe('ENROLLED');
    expect(m.covered).toHaveBeenCalledWith(expect.objectContaining({ enrollmentId: 'e-phys' }));
  });

  it('is NOT_ENROLLED with no active enrollment of this course (a payment elsewhere does not matter)', async () => {
    m.findMany.mockResolvedValue([]);
    m.covered.mockResolvedValue(coverage('UNPAID'));
    const { context } = await evaluateScan(input);
    expect(context.enrollmentState).toBe('NOT_ENROLLED');
    expect(context.warnings).toEqual(['NOT_ENROLLED']);
    expect(m.covered).toHaveBeenCalledWith({ userId: 'stu-1', courseId: 'course-1', now: NOW });
  });
});

describe('evaluateScan — fee state', () => {
  it('paid: no warning', async () => {
    const { context } = await evaluateScan(input);
    expect(context).toMatchObject({ paidThisMonth: true, covered: 'PAID', graceUntil: '2026-11-10', month: '2026-11', warnings: [] });
  });

  it('inside grace: covered but not paid, warns amber', async () => {
    m.covered.mockResolvedValue(coverage('GRACE'));
    const { context } = await evaluateScan(input);
    expect(context).toMatchObject({ paidThisMonth: false, covered: 'GRACE', warnings: ['FEE_IN_GRACE'] });
  });

  it('outside grace: unpaid, warns red', async () => {
    m.covered.mockResolvedValue(coverage('UNPAID'));
    const { context } = await evaluateScan(input);
    expect(context).toMatchObject({ paidThisMonth: false, covered: 'UNPAID', warnings: ['FEE_UNPAID'] });
  });

  it('an online-only student who has not paid gets both warnings', async () => {
    m.findMany.mockResolvedValue([online]);
    m.covered.mockResolvedValue(coverage('UNPAID'));
    const { context } = await evaluateScan(input);
    expect(context.warnings).toEqual(['MODE_MISMATCH', 'FEE_UNPAID']);
  });

  it('reads the settings of the organization it was given', async () => {
    await evaluateScan(input);
    expect(m.reader).toHaveBeenCalledWith('org-1');
  });
});

describe('evaluateScan — policy matrix', () => {
  const cases: [string, ClassType | null, 'PAID' | 'GRACE' | 'UNPAID', 'WARN' | 'BLOCK', 'WARN' | 'BLOCK', string | null][] = [
    ['enrolled, paid', ClassType.PHYSICAL, 'PAID', 'BLOCK', 'BLOCK', null],
    ['enrolled, in grace', ClassType.PHYSICAL, 'GRACE', 'BLOCK', 'BLOCK', null],
    ['enrolled, unpaid, unpaid policy WARN', ClassType.PHYSICAL, 'UNPAID', 'WARN', 'BLOCK', null],
    ['enrolled, unpaid, unpaid policy BLOCK', ClassType.PHYSICAL, 'UNPAID', 'BLOCK', 'WARN', 'SCAN_BLOCKED_UNPAID'],
    ['online only, paid', ClassType.ONLINE, 'PAID', 'BLOCK', 'BLOCK', null],
    ['online only, unpaid, BLOCK', ClassType.ONLINE, 'UNPAID', 'BLOCK', 'WARN', 'SCAN_BLOCKED_UNPAID'],
    ['online only, unpaid, WARN', ClassType.ONLINE, 'UNPAID', 'WARN', 'WARN', null],
    ['not enrolled, not-enrolled policy WARN', null, 'UNPAID', 'BLOCK', 'WARN', null],
    ['not enrolled, not-enrolled policy BLOCK', null, 'UNPAID', 'WARN', 'BLOCK', 'SCAN_BLOCKED_NOT_ENROLLED'],
  ];

  it.each(cases)('%s', async (_name, mode, reason, unpaid, notEnrolled, blockedWith) => {
    m.findMany.mockResolvedValue(mode ? [{ id: 'e1', classType: mode }] : []);
    m.covered.mockResolvedValue(coverage(reason));
    policies(unpaid, notEnrolled);

    const { block } = await evaluateScan(input);
    expect(block).toBe(blockedWith);
  });
});

describe('assertScanAllowed', () => {
  it('lets a scan through', () => {
    expect(() => assertScanAllowed(null)).not.toThrow();
  });

  it('refuses a not-enrolled student with 403', () => {
    expect(() => assertScanAllowed('SCAN_BLOCKED_NOT_ENROLLED')).toThrowError(expect.objectContaining({ code: 'SCAN_BLOCKED_NOT_ENROLLED', statusCode: 403 }));
  });

  it('refuses an unpaid student with 402', () => {
    expect(() => assertScanAllowed('SCAN_BLOCKED_UNPAID')).toThrowError(expect.objectContaining({ code: 'SCAN_BLOCKED_UNPAID', statusCode: 402 }));
  });
});
