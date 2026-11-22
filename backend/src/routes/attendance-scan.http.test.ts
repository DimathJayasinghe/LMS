import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ scan: vi.fn(), audit: vi.fn() }));
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));

vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/config/env', () => ({ env: { JWT_ACCESS_SECRET: 'http-test-secret', NODE_ENV: 'test', ZOOM_WEBHOOK_SECRET: 'z', ZOOM_WEBHOOK_RATE_LIMIT_MAX: 5 } }));
vi.mock('@/config/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/services/attendance.service', () => ({ scanBarcode: m.scan }));
vi.mock('@/services/attendance-reconciliation.service', () => ({}));
vi.mock('@/services/audit.service', () => ({ log: m.audit }));

import { attendanceRoutes } from './attendance.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { AppError } from '@/utils/app-error';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

let server: Server;
let base: string;
const body = {
  barcode: 'LMS-000042',
  classSessionId: '11111111-1111-4111-8111-111111111111',
  instituteId: '22222222-2222-4222-8222-222222222222',
};
const attendance = { id: 'a1', source: 'QR', userId: 's1', classSessionId: body.classSessionId };
const context = {
  enrollmentState: 'NOT_ENROLLED',
  paidThisMonth: false,
  covered: 'UNPAID',
  month: '2026-11',
  graceUntil: '2026-11-10',
  warnings: ['NOT_ENROLLED'],
  student: { name: 'Nimal Perera', indexNumber: 42, profileImage: null },
};

beforeEach(async () => {
  vi.clearAllMocks();
  m.scan.mockResolvedValue({ attendance, context });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/attendance', attendanceRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const scan = async (role: Role | null) => {
  db.user.findUnique.mockResolvedValue({ role: role ?? Role.ADMIN, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
  const token = role ? jwt.sign({ userId: 'u1', role }, 'http-test-secret') : null;
  const response = await fetch(`${base}/api/attendance/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
};

describe('POST /attendance/scan', () => {
  it('returns the attendance record with the enrollment and fee context beside it', async () => {
    const response = await scan(Role.ADMIN);
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ status: 'success', data: { ...attendance, context } });
  });

  it('records the state in the audit metadata', async () => {
    await scan(Role.ADMIN);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'a1',
      metadata: expect.objectContaining({ enrollmentState: 'NOT_ENROLLED', warnings: ['NOT_ENROLLED'] }),
    }));
  });

  it.each([
    ['SCAN_BLOCKED_NOT_ENROLLED', 403],
    ['SCAN_BLOCKED_UNPAID', 402],
  ])('turns %s into its status with the error envelope and logs no audit row', async (code, status) => {
    m.scan.mockRejectedValue(new AppError(code, status, 'Refused at the door.'));
    const response = await scan(Role.ADMIN);
    expect(response.status).toBe(status);
    expect(response.json).toEqual({ status: 'error', message: 'Refused at the door.', code });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await scan(role)).status).toBe(403);
    expect(m.scan).not.toHaveBeenCalled();
  });

  it('needs a signed-in user', async () => {
    expect((await scan(null)).status).toBe(401);
  });
});
