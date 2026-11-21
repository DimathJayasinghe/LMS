import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { findUnique, create, redisSet, redisDel } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: { idempotencyRecord: { findUnique, create } },
}));
vi.mock('@/config/redis', () => ({ redis: { set: redisSet, del: redisDel } }));
vi.mock('@/config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { checkIdempotency, checkOneTimeSecretIdempotency } from './idempotency.middleware';

const KEY = '11111111-1111-1111-1111-111111111111';

// Minimal Express req/res doubles. res.status/json are chainable and record state.
type MockResponse = Response & { body: unknown; headers: Record<string, string> };

function mockRes(): MockResponse {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    set(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return response as unknown as MockResponse;
}
function mockReq(headers: Record<string, string> = {}): Request {
  return { headers, originalUrl: '/api/payments/p1/override' } as unknown as Request;
}

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  redisSet.mockReset();
  redisDel.mockReset();
});

describe('checkIdempotency middleware', () => {
  it('rejects a request with no Idempotency-Key (400) and does not call next', async () => {
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({}), res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID key (400)', async () => {
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({ 'idempotency-key': 'not-a-uuid' }), res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('replays the stored response on a cache hit and never runs the handler', async () => {
    findUnique.mockResolvedValue({
      responseCode: 201,
      responseBody: { status: 'success', data: { id: 'p1' } },
    });
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ status: 'success', data: { id: 'p1' } });
    expect(next).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('returns 409 when the lock is already held (SET NX misses)', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue(null); // ioredis SET ... NX returns null when the key exists
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(res.statusCode).toBe(409);
    expect(next).not.toHaveBeenCalled();
  });

  it('acquires the lock (SET NX) and calls next on a fresh key', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    const res = mockRes();
    const next = vi.fn();
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringContaining(KEY),
      expect.any(String),
      'PX',
      expect.any(Number),
      'NX',
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('caches an IdempotencyRecord when the wrapped handler responds 2xx', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    create.mockResolvedValue({});
    const res = mockRes();
    const next = vi.fn(() => {
      res.status(201).json({ status: 'success' });
    });
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: KEY, responseCode: 201 }),
      }),
    );
  });

  it('releases the lock and does not cache on a 5xx response', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    redisDel.mockResolvedValue(1);
    const res = mockRes();
    const next = vi.fn(() => {
      res.status(500).json({ status: 'error' });
    });
    await checkIdempotency(mockReq({ 'idempotency-key': KEY }), res, next);
    expect(redisDel).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('checkOneTimeSecretIdempotency middleware', () => {
  const secretReq = () => ({ headers: { 'idempotency-key': KEY }, originalUrl: '/api/users/u1/reset-password', method: 'POST', user: { userId: 'actor' } }) as unknown as Request;

  it('stores a placeholder instead of a successful body, so a replay never returns the secret', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    create.mockResolvedValue({});
    const res = mockRes();
    await checkOneTimeSecretIdempotency(secretReq(), res, vi.fn());
    res.status(200).json({ status: 'success', data: { temporaryPassword: 'the-secret-value' } });
    const stored = create.mock.calls[0]![0].data;
    expect(stored.responseCode).toBe(200);
    expect(JSON.stringify(stored)).not.toContain('the-secret-value');
    expect(stored.responseBody).toEqual({ status: 'success', message: 'Already processed; the one-time password was shown once.' });
    expect(res.body).toMatchObject({ data: { temporaryPassword: 'the-secret-value' } });
  });

  it('still stores an error response as it is', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    create.mockResolvedValue({});
    const res = mockRes();
    await checkOneTimeSecretIdempotency(secretReq(), res, vi.fn());
    res.status(403).json({ status: 'error', code: 'FORBIDDEN', message: 'no' });
    expect(create.mock.calls[0]![0].data.responseBody).toEqual({ status: 'error', code: 'FORBIDDEN', message: 'no' });
  });

  it('replays the placeholder with no-store, and a missing key is still 400', async () => {
    findUnique.mockResolvedValue({ responseCode: 200, responseBody: { status: 'success', message: 'Already processed; the one-time password was shown once.' } });
    const res = mockRes();
    await checkOneTimeSecretIdempotency(secretReq(), res, vi.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toHaveProperty('data');
    expect(res.headers['Cache-Control']).toBe('no-store');
    const missing = mockRes();
    await checkOneTimeSecretIdempotency({ headers: {}, originalUrl: '/x', method: 'POST', user: { userId: 'a' } } as unknown as Request, missing, vi.fn());
    expect(missing.statusCode).toBe(400);
  });

  it('keeps the key private to the acting user and the target', async () => {
    findUnique.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    await checkOneTimeSecretIdempotency(secretReq(), mockRes(), vi.fn());
    await checkOneTimeSecretIdempotency({ ...secretReq(), user: { userId: 'someone-else' } } as unknown as Request, mockRes(), vi.fn());
    const [first, second] = findUnique.mock.calls.map((call) => call[0].where.key);
    expect(first).not.toBe(KEY);
    expect(first).not.toBe(second);
  });
});
