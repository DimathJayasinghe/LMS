import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const m = vi.hoisted(() => ({ upload: vi.fn(), cache: new Map<string, unknown>(), idempotencyCreate: vi.fn() }));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  idempotencyRecord: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/config/env', () => ({ env: { JWT_ACCESS_SECRET: 'http-test-secret', NODE_ENV: 'test' } }));
vi.mock('@/config/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/controllers/payment.controller', () => ({
  initiatePayherePayment: vi.fn(), collectEntrancePayment: vi.fn(), handlePayhereNotify: vi.fn(), getPayhereStatus: vi.fn(),
  listPayments: vi.fn(), listMyPayments: vi.fn(), getPaymentsSummary: vi.fn(), getFinancialReport: vi.fn(), getPaymentById: vi.fn(),
  overridePayment: vi.fn(), listPaymentAdjustments: vi.fn(), refundPayment: vi.fn(),
}));
vi.mock('@/controllers/outstanding.controller', () => ({ listOutstanding: vi.fn(), exportOutstanding: vi.fn(), sendFeeReminders: vi.fn() }));
vi.mock('@/controllers/cash.controller', () => ({ listCash: vi.fn(), listCashTallies: vi.fn(), closeCashDay: vi.fn(), reconcileCashTally: vi.fn() }));
vi.mock('@/services/payment-bulk.service', () => ({ bulkUploadPayments: m.upload }));

import { paymentRoutes } from './payment.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

const key = (n: number) => `50000000-0000-4000-8000-00000000000${n}`;
const outcome = { dryRun: false, applied: true, total: 2, created: 2, updated: 0, errors: [] };
let server: Server;
let base: string;

beforeEach(async () => {
  vi.clearAllMocks();
  m.cache.clear();
  m.upload.mockResolvedValue(outcome);
  db.idempotencyRecord.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => m.cache.get(where.key) ?? null);
  db.idempotencyRecord.create.mockImplementation(async ({ data }: { data: { key: string } }) => { m.cache.set(data.key, data); return data; });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/payments', paymentRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const sheet = () => {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04])]), 'payments.xlsx');
  return form;
};

const upload = async (role: Role | null, opts: { query?: string; key?: string | null; body?: FormData } = {}) => {
  // The role the route sees comes from the account row, not from the token.
  db.user.findUnique.mockResolvedValue({ role: role ?? Role.ADMIN, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
  const token = role ? jwt.sign({ userId: 'u1', role }, 'http-test-secret') : null;
  const idempotencyKey = opts.key === undefined ? key(1) : opts.key;
  const response = await fetch(`${base}/api/payments/bulk-upload${opts.query ?? ''}`, {
    method: 'POST',
    headers: { ...(token ? { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}` } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: opts.body ?? sheet(),
  });
  return { status: response.status, headers: response.headers, json: await response.json() as Record<string, unknown> };
};

describe('POST /payments/bulk-upload — who may call it', () => {
  it('needs a signed-in user', async () => {
    expect((await upload(null)).status).toBe(401);
    expect(m.upload).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route, before any file is read', async (role) => {
    expect((await upload(role)).status).toBe(403);
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('lets the owner upload and answers with the outcome, never cached', async () => {
    const response = await upload(Role.SUPER_ADMIN);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json).toEqual({ status: 'success', data: outcome, message: 'Bulk upload applied.' });
    expect(m.upload).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.SUPER_ADMIN }),
      expect.objectContaining({ originalname: 'payments.xlsx' }),
      { dryRun: false },
      expect.objectContaining({ actorId: 'u1', actorRole: Role.SUPER_ADMIN }),
    );
  });
});

describe('POST /payments/bulk-upload — preview and refusal', () => {
  it('passes dryRun through and says nothing was saved', async () => {
    m.upload.mockResolvedValue({ ...outcome, dryRun: true, applied: false });
    const response = await upload(Role.SUPER_ADMIN, { query: '?dryRun=true' });
    expect(response.json).toMatchObject({ message: 'Preview only. Nothing was saved.' });
    expect(m.upload).toHaveBeenCalledWith(expect.anything(), expect.anything(), { dryRun: true }, expect.anything());
  });

  it('says what to do when a real run was refused', async () => {
    m.upload.mockResolvedValue({ ...outcome, applied: false, errors: [{ row: 3, message: 'This month is already paid.' }] });
    const response = await upload(Role.SUPER_ADMIN);
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ message: 'Nothing was saved. Fix the rows listed and upload the file again.', data: { applied: false } });
  });

  it('refuses an unknown dryRun value before spending the idempotency key', async () => {
    expect((await upload(Role.SUPER_ADMIN, { query: '?dryRun=maybe' })).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
    expect(db.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('needs an idempotency key', async () => {
    expect((await upload(Role.SUPER_ADMIN, { key: null })).status).toBe(400);
    expect((await upload(Role.SUPER_ADMIN, { key: 'not-a-uuid' })).status).toBe(400);
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('needs a file', async () => {
    const response = await upload(Role.SUPER_ADMIN, { body: new FormData() });
    expect(response.status).toBe(400);
    expect(response.json).toMatchObject({ status: 'error', message: 'Bulk upload file is required.' });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('turns a service refusal into the error envelope with its code', async () => {
    m.upload.mockRejectedValue(new AppError('BULK_UPLOAD_TOO_MANY_ROWS', 400, 'A bulk upload may contain at most 300 rows.'));
    const response = await upload(Role.SUPER_ADMIN);
    expect(response.status).toBe(400);
    expect(response.json).toMatchObject({ status: 'error', code: 'BULK_UPLOAD_TOO_MANY_ROWS' });
  });

  it('replays the first answer for the same key instead of applying twice', async () => {
    await upload(Role.SUPER_ADMIN, { key: key(2) });
    const second = await upload(Role.SUPER_ADMIN, { key: key(2) });
    expect(second.status).toBe(200);
    expect(m.upload).toHaveBeenCalledTimes(1);
  });
});
