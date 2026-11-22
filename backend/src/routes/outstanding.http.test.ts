import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ list: vi.fn(), exportCsv: vi.fn(), remind: vi.fn(), cache: new Map<string, unknown>() }));
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
vi.mock('@/controllers/payment-bulk.controller', () => ({ bulkUploadPayments: vi.fn() }));
vi.mock('@/services/outstanding.service', () => ({ listOutstanding: m.list }));
vi.mock('@/services/outstanding-export.service', () => ({ exportOutstandingCsv: m.exportCsv }));
vi.mock('@/services/fee-reminder.service', () => ({ sendFeeReminders: m.remind }));

import { paymentRoutes } from './payment.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

const courseId = '10000000-0000-4000-8000-000000000001';
const key = (n: number) => `40000000-0000-4000-8000-00000000000${n}`;
let server: Server;
let base: string;

beforeEach(async () => {
  vi.clearAllMocks();
  m.cache.clear();
  m.list.mockResolvedValue({ month: '2026-11', data: [], count: 0 });
  m.exportCsv.mockResolvedValue({ filename: 'outstanding-2026-11.csv', csv: 'a,b\r\n' });
  m.remind.mockResolvedValue({ sent: 2, skipped: [] });
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

const call = async (role: Role | null, method: string, path: string, opts: { body?: unknown; key?: string } = {}) => {
  // The role the route sees comes from the account row, not from the token.
  db.user.findUnique.mockResolvedValue({ role: role ?? Role.ADMIN, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
  const token = role ? jwt.sign({ userId: 'u1', role }, 'http-test-secret') : null;
  const response = await fetch(`${base}/api/payments${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}` } : {}), ...(opts.key ? { 'Idempotency-Key': opts.key } : {}) },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, json: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) as Record<string, unknown> : null };
};

describe('GET /payments/outstanding', () => {
  it('needs a signed-in user', async () => {
    expect((await call(null, 'GET', '/outstanding')).status).toBe(401);
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await call(role, 'GET', '/outstanding')).status).toBe(403);
    expect(m.list).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('lets %s read, no-store, with the envelope and the month', async (role) => {
    const response = await call(role, 'GET', '/outstanding?month=2026-11&page=2&limit=25');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json).toEqual({ status: 'success', data: [], count: 0, month: '2026-11' });
    expect(m.list).toHaveBeenCalledWith(expect.objectContaining({ role }), { month: '2026-11', page: 2, limit: 25 });
  });

  it('is not captured by the /:id route', async () => {
    await call(Role.ADMIN, 'GET', '/outstanding');
    expect(m.list).toHaveBeenCalledTimes(1);
  });

  it.each(['?month=2026-13x', '?courseId=nope', '?limit=500', '?page=0'])('rejects the bad query %s', async (query) => {
    expect((await call(Role.ADMIN, 'GET', `/outstanding${query}`)).status).toBe(400);
    expect(m.list).not.toHaveBeenCalled();
  });
});

describe('GET /payments/outstanding/export', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s', async (role) => {
    expect((await call(role, 'GET', '/outstanding/export')).status).toBe(403);
    expect(m.exportCsv).not.toHaveBeenCalled();
  });

  it('gives the owner a no-store CSV download', async () => {
    const response = await call(Role.SUPER_ADMIN, 'GET', `/outstanding/export?courseId=${courseId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="outstanding-2026-11.csv"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.text).toBe('a,b\r\n');
    expect(m.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ role: Role.SUPER_ADMIN }), { courseId }, expect.objectContaining({ actorId: 'u1' }));
  });
});

describe('POST /payments/outstanding/reminders', () => {
  const body = { month: '2026-11', courseId };

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await call(role, 'POST', '/outstanding/reminders', { body, key: key(1) })).status).toBe(403);
    expect(m.remind).not.toHaveBeenCalled();
  });

  it('needs an idempotency key', async () => {
    expect((await call(Role.ADMIN, 'POST', '/outstanding/reminders', { body })).status).toBe(400);
    expect((await call(Role.ADMIN, 'POST', '/outstanding/reminders', { body, key: 'not-a-uuid' })).status).toBe(400);
    expect(m.remind).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('lets %s send', async (role) => {
    const response = await call(role, 'POST', '/outstanding/reminders', { body, key: key(2) });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ status: 'success', data: { sent: 2, skipped: [] }, message: '2 reminders sent.' });
    expect(m.remind).toHaveBeenCalledWith(body, expect.objectContaining({ role }), expect.objectContaining({ actorId: 'u1' }));
  });

  it('replays the first answer for the same key instead of sending again', async () => {
    await call(Role.ADMIN, 'POST', '/outstanding/reminders', { body, key: key(3) });
    const second = await call(Role.ADMIN, 'POST', '/outstanding/reminders', { body, key: key(3) });
    expect(second.status).toBe(200);
    expect(m.remind).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no course and no ids', { month: '2026-11' }],
    ['an empty id list', { month: '2026-11', enrollmentIds: [] }],
    ['a bad id', { month: '2026-11', enrollmentIds: ['x'] }],
    ['a bad month', { month: 'November', courseId }],
    ['an unknown field', { month: '2026-11', courseId, message: 'pay now' }],
    ['more than 500 ids', { month: '2026-11', enrollmentIds: Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }],
  ])('rejects %s', async (_label, payload) => {
    expect((await call(Role.ADMIN, 'POST', '/outstanding/reminders', { body: payload, key: key(4) })).status).toBe(400);
    expect(m.remind).not.toHaveBeenCalled();
  });
});
