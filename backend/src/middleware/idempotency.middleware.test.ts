import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { checkIdempotency } from './idempotency.middleware';

const KEY = '11111111-1111-1111-1111-111111111111';

// Minimal Express req/res doubles. res.status/json are chainable and record state.
function mockRes(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
}
function mockReq(headers: Record<string, string> = {}): any {
  return { headers, originalUrl: '/api/payments/p1/override' };
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
