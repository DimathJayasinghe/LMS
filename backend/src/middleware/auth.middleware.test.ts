import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const mocks = vi.hoisted(() => ({ getSessionState: vi.fn(), env: { JWT_ACCESS_SECRET: 'a'.repeat(32) } }));
vi.mock('@/config/env', () => ({ env: mocks.env }));
vi.mock('../config/env', () => ({ env: mocks.env }));
vi.mock('@/services/auth.service', () => ({ getSessionState: mocks.getSessionState }));
vi.mock('../services/auth.service', () => ({ getSessionState: mocks.getSessionState }));

import { verifyToken } from './auth.middleware';

const sign = (claims: Record<string, unknown> = {}, options: jwt.SignOptions = { expiresIn: 600 }) =>
  jwt.sign({ userId: 'user-1', role: 'STUDENT', tokenVersion: 2, ...claims }, mocks.env.JWT_ACCESS_SECRET, options);

const run = async (token: string | undefined, method = 'GET', url = '/api/classes') => {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const next = vi.fn();
  const req = { cookies: token ? { access_token: token } : {}, method, originalUrl: url } as unknown as Request;
  await verifyToken(req, { status } as unknown as Response, next as NextFunction);
  return { req, status, json, next };
};

const session = (overrides: Record<string, unknown> = {}) => ({ role: 'STUDENT', deletedAt: null, tokenVersion: 2, mustChangePassword: false, ...overrides });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSessionState.mockResolvedValue(session());
});

describe('verifyToken session state', () => {
  it('rejects a request with no token before any database read', async () => {
    const { status, next } = await run(undefined);
    expect(status).toHaveBeenCalledWith(401);
    expect(mocks.getSessionState).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps the expired-token answer the frontend refresh flow relies on', async () => {
    const { status, json } = await run(sign({}, { expiresIn: -5 }));
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: { expired: true } }));
    expect(mocks.getSessionState).not.toHaveBeenCalled();
  });

  it('accepts a live session and takes the role from the database, not the token', async () => {
    mocks.getSessionState.mockResolvedValue(session({ role: 'TEACHER' }));
    const { req, next } = await run(sign({ role: 'SUPER_ADMIN' }));
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ userId: 'user-1', role: 'TEACHER' });
  });

  it.each([
    ['a deactivated account', session({ deletedAt: new Date() })],
    ['a missing account', null],
    ['a token issued before the last revocation', session({ tokenVersion: 3 })],
  ])('answers 401 SESSION_REVOKED for %s', async (_name, state) => {
    mocks.getSessionState.mockResolvedValue(state);
    const { status, json, next } = await run(sign());
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_REVOKED', data: { expired: false } }));
    expect(next).not.toHaveBeenCalled();
  });

  it('treats a token without a version claim as version 0 so sessions survive the deploy', async () => {
    mocks.getSessionState.mockResolvedValue(session({ tokenVersion: 0 }));
    const token = jwt.sign({ userId: 'user-1', role: 'STUDENT' }, mocks.env.JWT_ACCESS_SECRET, { expiresIn: 600 });
    const { next } = await run(token);
    expect(next).toHaveBeenCalledWith();
  });

  it('hands a failing session lookup to the error handler instead of letting the request through', async () => {
    const failure = new Error('database down');
    mocks.getSessionState.mockRejectedValue(failure);
    const { next, status } = await run(sign());
    expect(next).toHaveBeenCalledWith(failure);
    expect(status).not.toHaveBeenCalled();
  });
});

describe('verifyToken forced password change', () => {
  beforeEach(() => mocks.getSessionState.mockResolvedValue(session({ mustChangePassword: true })));

  it.each([
    ['GET', '/api/auth/me'],
    ['POST', '/api/auth/logout'],
    ['POST', '/api/auth/refresh'],
    ['PATCH', '/api/users/me/password'],
    ['PATCH', '/api/users/me/password/'],
    ['PATCH', '/api/users/me/password?x=1'],
  ])('allows %s %s', async (method, url) => {
    const { next, status } = await run(sign(), method, url);
    expect(next).toHaveBeenCalledWith();
    expect(status).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/api/classes'],
    ['GET', '/api/users/me'],
    ['PATCH', '/api/users/me/email'],
    ['POST', '/api/auth/me'],
    ['GET', '/api/users/me/password'],
    ['POST', '/api/users/u1/reset-password'],
  ])('answers 403 PASSWORD_CHANGE_REQUIRED for %s %s', async (method, url) => {
    const { status, json, next } = await run(sign(), method, url);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('checks the revocation before the forced-change rule', async () => {
    mocks.getSessionState.mockResolvedValue(session({ mustChangePassword: true, tokenVersion: 9 }));
    const { json } = await run(sign(), 'GET', '/api/classes');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_REVOKED' }));
  });
});
