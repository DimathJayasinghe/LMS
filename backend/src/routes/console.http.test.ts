import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ cash: vi.fn(), owing: vi.fn(), marking: vi.fn(), attendance: vi.fn(), setup: vi.fn(), sms: vi.fn() }));
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));

vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/config/env', () => ({ env: { JWT_ACCESS_SECRET: 'http-test-secret', NODE_ENV: 'test' } }));
vi.mock('@/config/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/services/console.service', () => ({ getCashPanel: m.cash, getOwingPanel: m.owing }));
vi.mock('@/services/console-marking.service', () => ({ getMarkingPanel: m.marking }));
vi.mock('@/services/console-attendance.service', () => ({ getAttendancePanel: m.attendance }));
vi.mock('@/services/console-setup.service', () => ({ getSetupPanel: m.setup }));
vi.mock('@/services/console-sms.service', () => ({ getSmsPanel: m.sms }));

import { consoleRoutes } from './console.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

let server: Server;
let base: string;

beforeEach(async () => {
  vi.clearAllMocks();
  m.cash.mockResolvedValue({ date: '2026-11-20', rows: [] });
  m.owing.mockResolvedValue({ month: '2026-11', students: 0 });
  for (const panel of [m.marking, m.attendance, m.setup, m.sms]) panel.mockResolvedValue({ ok: true });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/console', consoleRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const call = async (role: Role | null, method: string, path: string) => {
  // The role the route sees comes from the account row, not from the token.
  db.user.findUnique.mockResolvedValue({ role: role ?? Role.ADMIN, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
  const token = role ? jwt.sign({ userId: 'u1', role }, 'http-test-secret') : null;
  const response = await fetch(`${base}/api/console${path}`, { method, headers: token ? { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}` } : {} });
  const json = response.headers.get('content-type')?.includes('json') ? (await response.json()) as Record<string, unknown> : null;
  return { status: response.status, headers: response.headers, json };
};

describe('the console is read-only', () => {
  it('registers GET routes and nothing else', () => {
    const layers = consoleRoutes.stack.filter((layer) => layer.route);
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) expect(Object.keys((layer.route as unknown as { methods: Record<string, boolean> }).methods)).toEqual(['get']);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('answers %s with 404 and runs nothing', async (method) => {
    expect((await call(Role.SUPER_ADMIN, method, '/cash')).status).toBe(404);
    expect(m.cash).not.toHaveBeenCalled();
  });
});

describe.each([['/cash', () => m.cash, 'date=2026-11-20', { date: '2026-11-20' }], ['/owing', () => m.owing, 'month=2026-10', { month: '2026-10' }]])('GET /console%s', (path, service, query, parsed) => {
  it('needs a signed-in user', async () => {
    expect((await call(null, 'GET', path)).status).toBe(401);
  });

  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await call(role, 'GET', path)).status).toBe(403);
    expect(service()).not.toHaveBeenCalled();
  });

  it('lets the owner read, no-store, in the envelope, with the parsed query', async () => {
    const response = await call(Role.SUPER_ADMIN, 'GET', `${path}?${query}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json).toMatchObject({ status: 'success', data: expect.any(Object) });
    expect(service()).toHaveBeenCalledWith(expect.objectContaining({ role: Role.SUPER_ADMIN }), parsed);
  });

  it('answers an empty query too', async () => {
    expect((await call(Role.SUPER_ADMIN, 'GET', path)).status).toBe(200);
    expect(service()).toHaveBeenCalledWith(expect.anything(), {});
  });
});

describe.each([['/marking', () => m.marking], ['/attendance-today', () => m.attendance], ['/setup', () => m.setup], ['/sms', () => m.sms]])('GET /console%s', (path, service) => {
  it('needs a signed-in user', async () => {
    expect((await call(null, 'GET', path)).status).toBe(401);
    expect(service()).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await call(role, 'GET', path)).status).toBe(403);
    expect(service()).not.toHaveBeenCalled();
  });

  it('lets the owner read, no-store, in the envelope, passing only the caller', async () => {
    const response = await call(Role.SUPER_ADMIN, 'GET', path);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json).toEqual({ status: 'success', data: { ok: true } });
    expect(service()).toHaveBeenCalledTimes(1);
    expect(service()).toHaveBeenCalledWith(expect.objectContaining({ role: Role.SUPER_ADMIN }));
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('answers %s with 404 and runs nothing', async (method) => {
    expect((await call(Role.SUPER_ADMIN, method, path)).status).toBe(404);
    expect(service()).not.toHaveBeenCalled();
  });
});

describe('bad queries are refused before any read', () => {
  it.each(['/cash?date=2026-02-30', '/cash?date=today', '/owing?month=2026-13', '/owing?month=November'])('%s', async (path) => {
    expect((await call(Role.SUPER_ADMIN, 'GET', path)).status).toBe(400);
    expect(m.cash).not.toHaveBeenCalled();
    expect(m.owing).not.toHaveBeenCalled();
  });
});
