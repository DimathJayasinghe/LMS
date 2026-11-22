import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ list: vi.fn() }));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  idempotencyRecord: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/config/env', () => ({ env: { JWT_ACCESS_SECRET: 'http-test-secret', NODE_ENV: 'test' } }));
vi.mock('@/config/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/controllers/class.controller', () => ({
  confirmCourseAsset: vi.fn(), createClass: vi.fn(), getClassById: vi.fn(), getCourseAssetUploadUrl: vi.fn(), listClasses: vi.fn(),
  listPublicClasses: vi.fn(), removeCourseAsset: vi.fn(), updateClass: vi.fn(), updateCourseAssetAlt: vi.fn(),
}));
vi.mock('@/routes/class-session.routes', async () => ({ classSessionRoutes: (await import('express')).Router() }));
vi.mock('@/routes/course-module.routes', async () => ({ courseModuleRoutes: (await import('express')).Router() }));
vi.mock('@/services/roster.service', () => ({ listRoster: m.list }));

import { classRoutes } from './class.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { AppError } from '@/utils/app-error';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

const courseId = '10000000-0000-4000-8000-000000000001';
let server: Server;
let base: string;

beforeEach(async () => {
  vi.clearAllMocks();
  m.list.mockResolvedValue({ data: [], count: 0, page: 1, pageSize: 100 });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/classes', classRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const call = async (role: Role | null, path: string) => {
  // The role the route sees comes from the account row, not from the token.
  db.user.findUnique.mockResolvedValue({ role: role ?? Role.ADMIN, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
  const token = role ? jwt.sign({ userId: 'u1', role }, 'http-test-secret') : null;
  const response = await fetch(`${base}/api/classes${path}`, { headers: token ? { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}` } : {} });
  return { status: response.status, headers: response.headers, json: await response.json() as Record<string, unknown> };
};

describe('GET /classes/:classId/roster', () => {
  it('needs a signed-in user', async () => {
    expect((await call(null, `/${courseId}/roster`)).status).toBe(401);
    expect(m.list).not.toHaveBeenCalled();
  });

  it.each([Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await call(role, `/${courseId}/roster`)).status).toBe(403);
    expect(m.list).not.toHaveBeenCalled();
  });

  it.each([Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN])('lets %s through, no-store, with the envelope', async (role) => {
    const response = await call(role, `/${courseId}/roster?page=2`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json).toEqual({ status: 'success', data: [], count: 0, page: 1, pageSize: 100 });
    expect(m.list).toHaveBeenCalledWith(courseId, expect.objectContaining({ role }), 2);
  });

  it('defaults to the first page', async () => {
    await call(Role.TEACHER, `/${courseId}/roster`);
    expect(m.list).toHaveBeenCalledWith(courseId, expect.anything(), 1);
  });

  it("passes the service's refusal for a colleague's class through as 403", async () => {
    m.list.mockRejectedValue(new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.'));
    const response = await call(Role.TEACHER, `/${courseId}/roster`);
    expect(response.status).toBe(403);
    expect(response.json).toMatchObject({ status: 'error', code: 'FORBIDDEN_COURSE' });
  });

  it.each(['/not-a-uuid/roster', `/${courseId}/roster?page=0`, `/${courseId}/roster?page=x`])('rejects the bad request %s', async (path) => {
    expect((await call(Role.TEACHER, path)).status).toBe(400);
    expect(m.list).not.toHaveBeenCalled();
  });
});
