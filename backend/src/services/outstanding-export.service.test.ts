import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ list: vi.fn(), audit: vi.fn(), order: [] as string[] }));

vi.mock('@/config/database', () => ({ prisma: { $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({}) } }));
vi.mock('@/services/outstanding.service', () => ({ listOutstanding: m.list }));
vi.mock('@/services/audit.service', () => ({ logInTransaction: m.audit }));

import { exportOutstandingCsv, OUTSTANDING_EXPORT_MAX_ROWS } from './outstanding-export.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const ctx = { actorId: 'owner', actorRole: 'SUPER_ADMIN', ip: '10.0.0.1', userAgent: 'test' };
const row = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e1', studentId: 'u1', studentName: 'Nimal Perera', indexNumber: 1001, phone: '0771234567', courseId: 'c1', courseName: 'Physics',
  classType: 'PHYSICAL', monthsOwed: 2, amount: '1500.00', totalOwed: '3000.00', inGrace: false, graceUntil: '2026-11-10', ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.order.length = 0;
  m.list.mockResolvedValue({ month: '2026-11', data: [row()], count: 1 });
  m.audit.mockImplementation(async () => { m.order.push('audit'); });
});

describe('who may export', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before reading anything', async (role) => {
    await expect(exportOutstandingCsv({ userId: 'a', role }, {}, ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('lets the owner export', async () => {
    await expect(exportOutstandingCsv(owner, {}, ctx)).resolves.toMatchObject({ filename: 'outstanding-2026-11.csv' });
  });
});

describe('the file', () => {
  it('has a header and one line per owing enrollment', async () => {
    const { csv } = await exportOutstandingCsv(owner, {}, ctx);
    expect(csv).toBe(
      'Index number,Student,Mobile,Course,Mode,Months owed,Fee per month,Total owed,In grace\r\n'
      + '1001,Nimal Perera,0771234567,Physics,PHYSICAL,2,1500.00,3000.00,no\r\n',
    );
  });

  it('writes yes for a student in grace and keeps an empty mobile empty', async () => {
    m.list.mockResolvedValue({ month: '2026-11', data: [row({ inGrace: true, phone: null })], count: 1 });
    const { csv } = await exportOutstandingCsv(owner, {}, ctx);
    expect(csv.split('\r\n')[1]).toBe('1001,Nimal Perera,,Physics,PHYSICAL,2,1500.00,3000.00,yes');
  });

  it('neutralises a name or course that a spreadsheet would run as a formula', async () => {
    m.list.mockResolvedValue({ month: '2026-11', data: [row({ studentName: '=HYPERLINK("http://x")', courseName: '@SUM(1)' })], count: 1 });
    const { csv } = await exportOutstandingCsv(owner, {}, ctx);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(",'@SUM(1),");
  });

  it('reads everything in one consistent query, within the row cap', async () => {
    await exportOutstandingCsv(owner, { month: '2026-10', courseId: 'c1' }, ctx);
    expect(m.list).toHaveBeenCalledTimes(1);
    expect(m.list).toHaveBeenCalledWith(owner, { month: '2026-10', courseId: 'c1', page: 1, limit: OUTSTANDING_EXPORT_MAX_ROWS + 1 });
  });

  it('refuses a file larger than the cap and writes nothing to the audit log', async () => {
    m.list.mockResolvedValue({ month: '2026-11', data: new Array(OUTSTANDING_EXPORT_MAX_ROWS + 1).fill(row()), count: OUTSTANDING_EXPORT_MAX_ROWS + 1 });
    await expect(exportOutstandingCsv(owner, {}, ctx)).rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE', statusCode: 409 });
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe('audit', () => {
  it('records who exported which month and how many rows, with no student data', async () => {
    await exportOutstandingCsv(owner, { courseId: 'c1' }, ctx);
    const [, input] = m.audit.mock.calls[0]!;
    expect(input).toMatchObject({ action: 'OUTSTANDING_EXPORTED', context: ctx, metadata: { month: '2026-11', courseId: 'c1', rows: 1 } });
    expect(JSON.stringify(input)).not.toContain('Nimal');
    expect(JSON.stringify(input)).not.toContain('0771234567');
  });

  it('hands over no file when the audit row cannot be written', async () => {
    m.audit.mockRejectedValue(new Error('audit down'));
    await expect(exportOutstandingCsv(owner, {}, ctx)).rejects.toThrow('audit down');
  });
});
