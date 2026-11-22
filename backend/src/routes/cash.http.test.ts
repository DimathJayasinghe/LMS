import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ list: vi.fn(), tallies: vi.fn(), close: vi.fn(), reconcile: vi.fn(), byId: vi.fn() }));
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));

vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/config/env', () => ({ env: { JWT_ACCESS_SECRET: 'http-test-secret', NODE_ENV: 'test' } }));
vi.mock('@/config/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/controllers/payment.controller', () => ({
  initiatePayherePayment: vi.fn(), collectEntrancePayment: vi.fn(), handlePayhereNotify: vi.fn(), getPayhereStatus: vi.fn(),
  listPayments: vi.fn(), listMyPayments: vi.fn(), getPaymentsSummary: vi.fn(), getFinancialReport: vi.fn(), getPaymentById: m.byId,
  overridePayment: vi.fn(), listPaymentAdjustments: vi.fn(), refundPayment: vi.fn(),
}));
vi.mock('@/controllers/payment-bulk.controller', () => ({ bulkUploadPayments: vi.fn() }));
vi.mock('@/controllers/outstanding.controller', () => ({ listOutstanding: vi.fn(), exportOutstanding: vi.fn(), sendFeeReminders: vi.fn() }));
vi.mock('@/services/cash-list.service', () => ({ listCashDays: m.list, listCashTallies: m.tallies }));
vi.mock('@/services/cash-tally.service', () => ({ closeCashDay: m.close, reconcileCashTally: m.reconcile }));

import { paymentRoutes } from './payment.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

const tallyId = '30000000-0000-4000-8000-000000000001';
const instituteId = '20000000-0000-4000-8000-000000000001';
let server: Server;
let base: string;

beforeEach(async () => {
  vi.clearAllMocks();
  m.list.mockResolvedValue({ from: '2026-11-14', to: '2026-11-20', tallyEnabled: true, data: [], count: 0 });
  m.tallies.mockResolvedValue({ from: '2026-11-14', to: '2026-11-20', tallyEnabled: true, data: [], count: 0 });
  m.close.mockResolvedValue({ id: 't1', flagged: false });
  m.reconcile.mockResolvedValue({ id: 't1', reconciledAt: new Date('2026-11-20T10:00:00Z'), alreadyReconciled: false });
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

const call = async (role: Role | null, method: string, path: string, body?: unknown) => {
  // The role the route sees comes from the account row, not from the token.
  db.user.findUnique.mockResolvedValue({ role: role ?? Role.ADMIN, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
  const token = role ? jwt.sign({ userId: 'u1', role }, 'http-test-secret') : null;
  const response = await fetch(`${base}/api/payments${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = response.headers.get('content-type')?.includes('json') ? (await response.json()) as Record<string, unknown> : null;
  return { status: response.status, headers: response.headers, json };
};

describe.each([['/cash', () => m.list], ['/cash-tally', () => m.tallies]])('GET /payments%s', (path, service) => {
  it('needs a signed-in user', async () => {
    expect((await call(null, 'GET', path)).status).toBe(401);
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await call(role, 'GET', path)).status).toBe(403);
    expect(service()).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('lets %s read, no-store, with the envelope and the range', async (role) => {
    const response = await call(role, 'GET', `${path}?from=2026-11-14&to=2026-11-20`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json).toEqual({ status: 'success', data: [], count: 0, from: '2026-11-14', to: '2026-11-20', tallyEnabled: true });
    expect(service()).toHaveBeenCalledWith(expect.objectContaining({ role }), { from: '2026-11-14', to: '2026-11-20' });
  });

  it('is not captured by the /:id route', async () => {
    await call(Role.ADMIN, 'GET', path);
    expect(m.byId).not.toHaveBeenCalled();
    expect(service()).toHaveBeenCalledTimes(1);
  });

  it.each(['?from=2026-02-30', '?to=yesterday', '?collectorId=nope', '?instituteId=1'])('rejects the bad query %s', async (query) => {
    expect((await call(Role.SUPER_ADMIN, 'GET', `${path}${query}`)).status).toBe(400);
    expect(service()).not.toHaveBeenCalled();
  });
});

describe('GET /payments/cash-tally filters', () => {
  it('passes the unreconciled switch as a boolean', async () => {
    await call(Role.SUPER_ADMIN, 'GET', '/cash-tally?unreconciled=true');
    expect(m.tallies).toHaveBeenCalledWith(expect.anything(), { unreconciled: true });
    expect((await call(Role.SUPER_ADMIN, 'GET', '/cash-tally?unreconciled=maybe')).status).toBe(400);
  });
});

describe('POST /payments/cash-tally', () => {
  const body = { countedAmount: 7500 };

  it('needs a signed-in user', async () => {
    expect((await call(null, 'POST', '/cash-tally', body)).status).toBe(401);
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await call(role, 'POST', '/cash-tally', body)).status).toBe(403);
    expect(m.close).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('lets %s count the day', async (role) => {
    const response = await call(role, 'POST', '/cash-tally', { ...body, day: '2026-11-20', instituteId, note: ' short by one ' });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ status: 'success', data: { id: 't1' }, message: 'Cash counted.' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(m.close).toHaveBeenCalledWith(expect.objectContaining({ role }), { ...body, day: '2026-11-20', instituteId, note: 'short by one' }, expect.objectContaining({ actorId: 'u1' }));
  });

  it('accepts a nil count and the no-branch marker', async () => {
    expect((await call(Role.ADMIN, 'POST', '/cash-tally', { countedAmount: 0, instituteId: null })).status).toBe(200);
  });

  it.each([
    ['a negative count', { countedAmount: -1 }],
    ['a count with three decimals', { countedAmount: 10.005 }],
    ['an absurd count', { countedAmount: 1e12 }],
    ['no count', {}],
    ['a count that is not a number', { countedAmount: 'lots' }],
    ['a day that does not exist', { countedAmount: 1, day: '2026-02-30' }],
    ['a branch that is not an id', { countedAmount: 1, instituteId: 'kandy' }],
    ['a note that is too long', { countedAmount: 1, note: 'x'.repeat(501) }],
    ['a collector chosen by the client', { countedAmount: 1, collectorId: tallyId }],
  ])('rejects %s', async (_label, bad) => {
    expect((await call(Role.ADMIN, 'POST', '/cash-tally', bad)).status).toBe(400);
    expect(m.close).not.toHaveBeenCalled();
  });
});

describe('PATCH /payments/cash-tally/:id/reconcile', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('is the owner only: %s is refused at the route', async (role) => {
    expect((await call(role, 'PATCH', `/cash-tally/${tallyId}/reconcile`)).status).toBe(403);
    expect(m.reconcile).not.toHaveBeenCalled();
  });

  it('lets the owner reconcile', async () => {
    const response = await call(Role.SUPER_ADMIN, 'PATCH', `/cash-tally/${tallyId}/reconcile`);
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ status: 'success', data: { id: 't1', alreadyReconciled: false }, message: 'Day reconciled.' });
    expect(m.reconcile).toHaveBeenCalledWith(expect.objectContaining({ role: Role.SUPER_ADMIN }), tallyId, expect.objectContaining({ actorId: 'u1' }));
  });

  it('says so when it was already reconciled', async () => {
    m.reconcile.mockResolvedValue({ id: 't1', reconciledAt: new Date(), alreadyReconciled: true });
    expect((await call(Role.SUPER_ADMIN, 'PATCH', `/cash-tally/${tallyId}/reconcile`)).json).toMatchObject({ message: 'Already reconciled.' });
  });

  it('rejects an id that is not a uuid', async () => {
    expect((await call(Role.SUPER_ADMIN, 'PATCH', '/cash-tally/nope/reconcile')).status).toBe(400);
    expect(m.reconcile).not.toHaveBeenCalled();
  });
});
