import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ enter: vi.fn(), cache: new Map<string, unknown>() }));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  idempotencyRecord: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/config/env', () => ({ env: { JWT_ACCESS_SECRET: 'http-test-secret', NODE_ENV: 'test' } }));
vi.mock('@/config/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/services/hall-marks.service', () => ({ enterHallMarks: m.enter }));

import { examRoutes } from './exam.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

const examId = '10000000-0000-4000-8000-000000000001';
const key = (n: number) => `40000000-0000-4000-8000-00000000000${n}`;
const body = { rows: [{ indexNumber: 101, marks: 55 }], dryRun: true };
const result = (over: Record<string, unknown> = {}) => ({
  dryRun: true, applied: false, counts: { total: 1, changed: 1, unchanged: 0, rejected: 0 },
  rows: [{ line: 1, indexNumber: 101, marks: 55, status: 'WILL_CHANGE', before: null, after: 55 }], ...over,
});

let server: Server;
let base: string;

beforeEach(async () => {
  vi.clearAllMocks();
  m.cache.clear();
  m.enter.mockResolvedValue(result());
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    role: where.id.startsWith('marker') ? Role.MARKER : Role.TEACHER, deletedAt: null, tokenVersion: 0, mustChangePassword: false,
  }));
  db.idempotencyRecord.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => m.cache.get(where.key) ?? null);
  db.idempotencyRecord.create.mockImplementation(async ({ data }: { data: { key: string } }) => { m.cache.set(data.key, data); return data; });
  const app = express();
  app.use(express.json({ limit: '1mb' }), cookieParser());
  app.use('/api/exams', examRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const put = async (role: Role | null, payload: unknown, idempotencyKey?: string, userId = role === Role.MARKER ? 'marker-1' : 'teacher-1', path = `/api/exams/${examId}/hall-marks`) => {
  const token = role ? jwt.sign({ userId, role }, 'http-test-secret') : null;
  const response = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}` } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify(payload),
  });
  return { status: response.status, headers: response.headers, json: await response.json() as Record<string, unknown> & { data?: Record<string, unknown> } };
};

describe('PUT /exams/:id/hall-marks wiring', () => {
  it('needs a signed-in user', async () => {
    expect((await put(null, body, key(1))).status).toBe(401);
    expect(m.enter).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await put(role, body, key(1))).status).toBe(403);
    expect(m.enter).not.toHaveBeenCalled();
  });

  it.each([Role.SUPER_ADMIN, Role.TEACHER, Role.MARKER])('lets %s through to the service', async (role) => {
    db.user.findUnique.mockResolvedValue({ role, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
    const response = await put(role, body, key(1));
    expect(response.status).toBe(200);
    expect(m.enter).toHaveBeenCalledWith(examId, body, expect.objectContaining({ role }), expect.objectContaining({ actorRole: role }));
  });

  it('requires a UUID Idempotency-Key, including for a dry run', async () => {
    expect((await put(Role.TEACHER, body)).status).toBe(400);
    expect((await put(Role.TEACHER, body, 'not-a-uuid')).status).toBe(400);
    expect(m.enter).not.toHaveBeenCalled();
  });

  it.each([
    ['no dryRun flag (a client that forgets it must not write)', { rows: body.rows }],
    ['no rows', { rows: [], dryRun: true }],
    ['a fractional index number', { rows: [{ indexNumber: 1.5, marks: 5 }], dryRun: true }],
    ['a zero index number', { rows: [{ indexNumber: 0, marks: 5 }], dryRun: true }],
    ['marks sent as text', { rows: [{ indexNumber: 101, marks: '55' }], dryRun: true }],
    ['a dryRun that is not a boolean', { rows: body.rows, dryRun: 'false' }],
    ['more rows than the registry maximum', { rows: Array.from({ length: 10001 }, (_, i) => ({ indexNumber: i + 1, marks: 1 })), dryRun: true }],
  ])('rejects %s before the service', async (_label, payload) => {
    expect((await put(Role.TEACHER, payload, key(1))).status).toBe(400);
    expect(m.enter).not.toHaveBeenCalled();
  });

  it('rejects an exam id that is not a UUID', async () => {
    expect((await put(Role.TEACHER, body, key(1), undefined, '/api/exams/not-a-uuid/hall-marks')).status).toBe(400);
    expect(m.enter).not.toHaveBeenCalled();
  });

  it('answers a dry run with 200 and keeps the response out of shared caches', async () => {
    const response = await put(Role.TEACHER, body, key(1));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json.data).toMatchObject({ dryRun: true, applied: false });
  });

  it('answers a refused real run with 409 HALL_MARKS_REJECTED and the per-row list', async () => {
    m.enter.mockResolvedValue(result({ dryRun: false, applied: false, counts: { total: 1, changed: 0, unchanged: 0, rejected: 1 }, rows: [{ line: 1, indexNumber: 999, marks: 5, status: 'UNKNOWN_INDEX' }] }));
    const response = await put(Role.TEACHER, { ...body, dryRun: false }, key(2));
    expect(response.status).toBe(409);
    expect(response.json).toMatchObject({ status: 'error', code: 'HALL_MARKS_REJECTED' });
    expect(response.json.data).toMatchObject({ rows: [{ status: 'UNKNOWN_INDEX' }] });
  });

  it('answers a saved real run with 200', async () => {
    m.enter.mockResolvedValue(result({ dryRun: false, applied: true }));
    const response = await put(Role.TEACHER, { ...body, dryRun: false }, key(3));
    expect(response.status).toBe(200);
    expect(response.json.data).toMatchObject({ dryRun: false, applied: true });
  });

  it('replays a retried request for the same actor, but never across actors', async () => {
    await put(Role.TEACHER, body, key(4), 'teacher-1');
    await put(Role.TEACHER, body, key(4), 'teacher-1');
    expect(m.enter).toHaveBeenCalledTimes(1);
    await put(Role.TEACHER, body, key(4), 'teacher-2');
    expect(m.enter).toHaveBeenCalledTimes(2);
  });
});
