import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ lookup: vi.fn() }));
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));

vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/config/env', () => ({ env: { JWT_ACCESS_SECRET: 'http-test-secret', NODE_ENV: 'test' } }));
vi.mock('@/config/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/controllers/profile.controller', () => ({
  updateProfile: vi.fn(), getAvatarUploadUrl: vi.fn(), confirmAvatar: vi.fn(), removeAvatar: vi.fn(), changeEmail: vi.fn(), changePassword: vi.fn(),
}));
vi.mock('@/services/user.service', () => ({}));
vi.mock('@/services/password-reset.service', () => ({}));
vi.mock('@/services/staff-account.service', () => ({}));
vi.mock('@/services/student-lookup.service', () => ({ lookupStudents: m.lookup }));

import { userRoutes } from './user.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

let server: Server;
let base: string;
const rows = [{ id: 's1', name: 'Nimal Perera', indexNumber: 4021, profileImage: null }];

beforeEach(async () => {
  vi.clearAllMocks();
  m.lookup.mockResolvedValue(rows);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/users', userRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const get = async (role: Role | null, query: string) => {
  // The role the route sees comes from the account row, not from the token.
  db.user.findUnique.mockResolvedValue({ role: role ?? Role.ADMIN, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
  const token = role ? jwt.sign({ userId: 'u1', role }, 'http-test-secret') : null;
  const response = await fetch(`${base}/api/users/lookup${query}`, { headers: token ? { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}` } : {} });
  return { status: response.status, headers: response.headers, json: await response.json() as Record<string, unknown> };
};

describe('GET /users/lookup', () => {
  it('needs a signed-in user', async () => {
    expect((await get(null, '?q=nimal')).status).toBe(401);
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('stops %s at the route', async (role) => {
    expect((await get(role, '?q=nimal')).status).toBe(403);
    expect(m.lookup).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('lets %s look, never cached, with the envelope and a count', async (role) => {
    const response = await get(role, '?q=nimal');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json).toEqual({ status: 'success', data: rows, count: 1 });
    expect(m.lookup).toHaveBeenCalledWith(expect.objectContaining({ role }), { q: 'nimal' });
  });

  it('trims the search text', async () => {
    await get(Role.ADMIN, '?q=%20%20nimal%20');
    expect(m.lookup).toHaveBeenCalledWith(expect.anything(), { q: 'nimal' });
  });

  it('is not captured by the /:id route', async () => {
    await get(Role.ADMIN, '?q=nimal');
    expect(m.lookup).toHaveBeenCalledTimes(1);
  });

  it.each([['no search', ''], ['one character', '?q=n'], ['only spaces', '?q=%20%20%20'], ['a search over 60 characters', `?q=${'a'.repeat(61)}`]])('rejects %s', async (_label, query) => {
    expect((await get(Role.ADMIN, query)).status).toBe(400);
    expect(m.lookup).not.toHaveBeenCalled();
  });
});
