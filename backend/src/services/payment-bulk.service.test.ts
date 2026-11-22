import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassType, PaymentStatus, Prisma, Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  clock: vi.fn(), parse: vi.fn(), load: vi.fn(), audit: vi.fn(), lock: vi.fn(), create: vi.fn(), update: vi.fn(),
  tx: vi.fn(), calls: [] as string[], committed: [] as unknown[], settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => ({
  prisma: {
    $transaction: async (run: (tx: unknown) => Promise<unknown>, options: unknown) => {
      m.tx(options);
      const staged: unknown[] = [];
      const tx = {
        payment: {
          create: (a: unknown) => { m.calls.push('create'); staged.push(a); return m.create(a); },
          update: (a: unknown) => { m.calls.push('update'); staged.push(a); return m.update(a); },
        },
        staged,
      };
      const result = await run(tx);
      m.committed.push(...staged);
      return result;
    },
  },
}));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/payment-bulk-lookup.service', () => ({ loadBulkContext: m.load }));
vi.mock('@/utils/bulk-payment-rows', () => ({ parseBulkWorkbook: m.parse }));
vi.mock('@/services/audit.service', () => ({
  // Audit rows are staged on the transaction, so a rollback drops them with the payments.
  logInTransaction: (tx: { staged: unknown[] }, input: unknown) => { m.calls.push('audit'); tx.staged.push({ audit: input }); return m.audit(input); },
}));
vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: (...args: unknown[]) => { m.calls.push('lock'); return m.lock(...args); } }));

import { bulkUploadPayments } from './payment-bulk.service';

const E1 = '00000000-0000-4000-8000-000000000001';
const E2 = '00000000-0000-4000-8000-000000000002';
const COURSE = '10000000-0000-4000-8000-000000000001';
const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const ctx = { actorId: 'owner', actorRole: 'SUPER_ADMIN', ip: '10.0.0.1', userAgent: 'test' };
const file = { originalname: 'payments.xlsx', buffer: Buffer.from([0x50, 0x4b]) } as Express.Multer.File;
const enrollment = (id: string, over: Record<string, unknown> = {}) => ({
  id, isActive: true, classType: ClassType.PHYSICAL, courseId: COURSE, courseActive: true,
  monthlyFee: new Prisma.Decimal('2500.00'), studentIndexNumber: 4021, studentActive: true, ...over,
});
const sheet = (row: number, id: string, month = '2026-11', extra: Record<string, unknown> = {}) => ({ row, value: { enrollmentId: id, paymentMonth: month, ...extra } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T08:00:00Z'));
  m.calls.length = 0;
  m.committed.length = 0;
  m.settings = { 'bulk.maxRows': 300, 'fees.advanceMonthsAllowed': 1 };
  m.clock.mockResolvedValue({ organizationId: 'org-1', timezone: 'Asia/Colombo' });
  m.parse.mockResolvedValue([sheet(2, E1), sheet(3, E2)]);
  m.load.mockResolvedValue({ enrollments: [enrollment(E1), enrollment(E2)], payments: [] });
  m.create.mockImplementation(async ({ data }: { data: { enrollmentId: string } }) => ({ id: `pay-${data.enrollmentId.slice(-1)}` }));
  m.update.mockResolvedValue({ id: 'pay-old' });
});
afterEach(() => vi.useRealTimers());

const audits = () => m.committed.flatMap((entry) => (entry as { audit?: Record<string, unknown> }).audit ?? []);
const writes = () => m.committed.filter((entry) => !(entry as { audit?: unknown }).audit);

describe('bulkUploadPayments — who may upload', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s before the file is read', async (role) => {
    await expect(bulkUploadPayments({ userId: 'u', role }, file, { dryRun: false }, ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.parse).not.toHaveBeenCalled();
    expect(m.committed).toEqual([]);
  });

  it('lets the owner run a preview and an apply', async () => {
    await expect(bulkUploadPayments(owner, file, { dryRun: true }, ctx)).resolves.toMatchObject({ applied: false });
    await expect(bulkUploadPayments(owner, file, { dryRun: false }, ctx)).resolves.toMatchObject({ applied: true });
  });
});

describe('bulkUploadPayments — preview', () => {
  it('reports what would happen and writes nothing', async () => {
    const result = await bulkUploadPayments(owner, file, { dryRun: true }, ctx);
    expect(result).toEqual({ dryRun: true, applied: false, total: 2, created: 2, updated: 0, errors: [] });
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.committed).toEqual([]);
  });

  it('counts unpaid rows as updates, not creations', async () => {
    m.load.mockResolvedValue({ enrollments: [enrollment(E1), enrollment(E2)], payments: [{ id: 'pay-old', enrollmentId: E2, paymentMonth: '2026-11', status: PaymentStatus.FAILED }] });
    const result = await bulkUploadPayments(owner, file, { dryRun: true }, ctx);
    expect(result).toMatchObject({ created: 1, updated: 1 });
  });
});

describe('bulkUploadPayments — apply', () => {
  it('writes every row in one transaction, stamped with the owner and the course fee', async () => {
    const result = await bulkUploadPayments(owner, file, { dryRun: false }, ctx);
    expect(result).toEqual({ dryRun: false, applied: true, total: 2, created: 2, updated: 0, errors: [] });
    expect(m.tx).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual([
      { data: { enrollmentId: E1, paymentMonth: '2026-11', amount: new Prisma.Decimal('2500.00'), status: 'SUCCESS', method: 'BULK', collectedById: 'owner', note: 'Bulk upload' }, select: { id: true } },
      { data: { enrollmentId: E2, paymentMonth: '2026-11', amount: new Prisma.Decimal('2500.00'), status: 'SUCCESS', method: 'BULK', collectedById: 'owner', note: 'Bulk upload' }, select: { id: true } },
    ]);
  });

  it('takes the organization lock before the first write', async () => {
    await bulkUploadPayments(owner, file, { dryRun: false }, ctx);
    expect(m.calls[0]).toBe('lock');
    expect(m.lock).toHaveBeenCalledWith(expect.anything(), 'payment-bulk', 'org-1', 'upload');
  });

  it('writes an audit row per applied row and one for the upload, in the same transaction', async () => {
    await bulkUploadPayments(owner, file, { dryRun: false }, ctx);
    expect(audits()).toHaveLength(3);
    expect(audits()[0]).toMatchObject({
      action: 'PAYMENT_BULK_ROW_APPLIED', targetType: 'Payment', targetId: 'pay-1', organizationId: 'org-1', context: ctx,
      metadata: { row: 2, kind: 'create', enrollmentId: E1, paymentMonth: '2026-11', amount: '2500.00' },
    });
    expect(audits()[2]).toMatchObject({ action: 'PAYMENT_BULK_UPLOAD', organizationId: 'org-1', metadata: { total: 2, created: 2, updated: 0, fileName: 'payments.xlsx' } });
  });

  it('turns an unpaid payment into a paid one only while it is still unpaid', async () => {
    m.load.mockResolvedValue({ enrollments: [enrollment(E1)], payments: [{ id: 'pay-old', enrollmentId: E1, paymentMonth: '2026-11', status: PaymentStatus.PENDING }] });
    m.parse.mockResolvedValue([sheet(2, E1)]);
    await bulkUploadPayments(owner, file, { dryRun: false }, ctx);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pay-old', status: { in: ['PENDING', 'FAILED'] } }, data: expect.objectContaining({ method: 'BULK', status: 'SUCCESS', collectedById: 'owner' }) }));
    expect(audits()[0]).toMatchObject({ targetId: 'pay-old', metadata: expect.objectContaining({ kind: 'convert' }) });
  });

  it('keeps a note from the sheet', async () => {
    m.parse.mockResolvedValue([sheet(2, E1, '2026-11', { note: 'Ledger page 4' })]);
    await bulkUploadPayments(owner, file, { dryRun: false }, ctx);
    expect(writes()[0]).toMatchObject({ data: { note: 'Ledger page 4' } });
  });
});

describe('bulkUploadPayments — rows that are refused', () => {
  beforeEach(() => {
    m.parse.mockResolvedValue([sheet(2, E1), sheet(3, E2, '2026-11', { amount: 1 })]);
  });

  it('applies nothing when any row is refused, and says which', async () => {
    const result = await bulkUploadPayments(owner, file, { dryRun: false }, ctx);
    expect(result).toMatchObject({ applied: false, created: 1, errors: [{ row: 3, message: 'Amount must equal the course fee of 2500.00.' }] });
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.committed).toEqual([]);
  });

  it('shows the same errors in a preview', async () => {
    const result = await bulkUploadPayments(owner, file, { dryRun: true }, ctx);
    expect(result.errors).toHaveLength(1);
  });
});

describe('bulkUploadPayments — failing in the middle', () => {
  it('keeps nothing when a payment appears for a month between the check and the write', async () => {
    m.create.mockResolvedValueOnce({ id: 'pay-1' }).mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(bulkUploadPayments(owner, file, { dryRun: false }, ctx)).rejects.toMatchObject({ code: 'BULK_UPLOAD_CONFLICT', statusCode: 409, message: expect.stringContaining('Row 3') });
    expect(m.committed).toEqual([]);
  });

  it('keeps nothing when an unpaid row was paid meanwhile', async () => {
    m.load.mockResolvedValue({ enrollments: [enrollment(E1)], payments: [{ id: 'pay-old', enrollmentId: E1, paymentMonth: '2026-11', status: PaymentStatus.PENDING }] });
    m.parse.mockResolvedValue([sheet(2, E1)]);
    m.update.mockRejectedValue(Object.assign(new Error('no row'), { code: 'P2025' }));
    await expect(bulkUploadPayments(owner, file, { dryRun: false }, ctx)).rejects.toMatchObject({ code: 'BULK_UPLOAD_CONFLICT', statusCode: 409 });
    expect(m.committed).toEqual([]);
  });

  it('keeps nothing when an audit row cannot be written', async () => {
    m.audit.mockRejectedValueOnce(new Error('audit down'));
    await expect(bulkUploadPayments(owner, file, { dryRun: false }, ctx)).rejects.toThrow('audit down');
    expect(m.committed).toEqual([]);
  });

  it('lets an unexpected database error through unchanged', async () => {
    m.create.mockRejectedValueOnce(new Error('connection lost'));
    await expect(bulkUploadPayments(owner, file, { dryRun: false }, ctx)).rejects.toThrow('connection lost');
  });
});

describe('bulkUploadPayments — organization settings', () => {
  it('passes bulk.maxRows to the reader', async () => {
    m.settings['bulk.maxRows'] = 2;
    await bulkUploadPayments(owner, file, { dryRun: true }, ctx);
    expect(m.parse).toHaveBeenCalledWith(file, 2);
  });

  it('allows one month ahead by default and not two', async () => {
    m.parse.mockResolvedValue([sheet(2, E1, '2026-12'), sheet(3, E2, '2027-01')]);
    const result = await bulkUploadPayments(owner, file, { dryRun: true }, ctx);
    expect(result.errors).toEqual([{ row: 3, message: 'Month 2027-01 is later than the latest month allowed (2026-12).' }]);
  });

  it('allows no future month when the allowance is zero', async () => {
    m.settings['fees.advanceMonthsAllowed'] = 0;
    m.parse.mockResolvedValue([sheet(2, E1, '2026-11'), sheet(3, E2, '2026-12')]);
    expect((await bulkUploadPayments(owner, file, { dryRun: true }, ctx)).errors.map((e) => e.row)).toEqual([3]);
  });

  it('counts the current month on the Colombo clock, not UTC', async () => {
    vi.setSystemTime(new Date('2026-11-30T19:00:00Z'));
    m.settings['fees.advanceMonthsAllowed'] = 0;
    m.parse.mockResolvedValue([sheet(2, E1, '2026-12')]);
    expect((await bulkUploadPayments(owner, file, { dryRun: true }, ctx)).errors).toEqual([]);
  });
});
