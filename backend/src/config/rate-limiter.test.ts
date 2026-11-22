import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';

vi.mock('./env', () => ({ env: { JWT_ACCESS_SECRET: 'access-secret-for-tests', JWT_REFRESH_SECRET: 'refresh-secret-for-tests', RATE_LIMIT_GLOBAL_USER_MAX: 200, RATE_LIMIT_GLOBAL_ANON_MAX: 100, RATE_LIMIT_LOGIN_ACCOUNT_MAX: 10, RATE_LIMIT_LOGIN_IP_MAX: 60, RATE_LIMIT_REFRESH_MAX: 20 } }));
vi.mock('./redis', () => ({ redis: { status: 'end', call: vi.fn().mockResolvedValue('ok') } }));
vi.mock('./logger', () => ({ logger: { warn: vi.fn() } }));
const readSetting = vi.hoisted(() => vi.fn());
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => readSetting }));

import { accessKey, refreshKey, loginAccountKey, addressKey, skipGlobal, createRateLimiters, registerIpLimit } from './rate-limiter';
import { redis } from './redis';

const req = (cookies: Record<string, string> = {}, body: unknown = {}): Request =>
  ({ ip: '192.0.2.1', cookies, body, path: '/auth/refresh' }) as Request;

describe('rate limit keys', () => {
  it('separates authenticated users sharing an address', () => {
    const token = (userId: string) => jwt.sign({ userId }, 'access-secret-for-tests');
    expect(accessKey(req({ access_token: token('one') }))).toBe('u:one');
    expect(accessKey(req({ access_token: token('two') }))).toBe('u:two');
  });
  it('uses the address for missing, invalid, and expired tokens', () => {
    const expired = jwt.sign({ userId: 'one', exp: 1 }, 'access-secret-for-tests');
    for (const cookies of [{} as Record<string, string>, { access_token: 'bad' }, { access_token: expired }]) {
      expect(accessKey(req(cookies))).toBe('ip:192.0.2.1');
    }
  });
  it('uses the verified refresh identity', () => {
    const token = jwt.sign({ userId: 'one' }, 'refresh-secret-for-tests');
    expect(refreshKey(req({ refresh_token: token }))).toBe('u:one');
    expect(refreshKey(req({ refresh_token: 'bad' }))).toBe('ip:192.0.2.1');
  });
  it('normalizes login accounts and separates the address key', () => {
    expect(loginAccountKey(req({}, { email: '  A@EXAMPLE.COM ' }))).toBe(loginAccountKey(req({}, { email: 'a@example.com' })));
    expect(loginAccountKey(req({}, { email: 'a@example.com' }))).not.toBe(addressKey(req()));
  });
  it('skips only refresh from the global limiter', () => {
    expect(skipGlobal(req())).toBe(true);
    expect(skipGlobal({ ...req(), path: '/auth/refresh/other' } as Request)).toBe(false);
  });
});

describe('limiter stores', () => {
  it('constructs limiters with memory when Redis is unavailable', () => {
    redis.status = 'end';
    expect(createRateLimiters().globalLimiter).toBeTypeOf('function');
  });
  it('constructs limiters with Redis when connected', () => {
    redis.status = 'ready';
    expect(createRateLimiters().globalLimiter).toBeTypeOf('function');
    expect(redis.call).toHaveBeenCalled();
    redis.status = 'end';
  });
});

describe('registration cap per address', () => {
  it('is the owner\'s hourly setting', async () => {
    readSetting.mockResolvedValue(120);
    await expect(registerIpLimit()).resolves.toBe(120);
    expect(readSetting).toHaveBeenCalledWith('identity.register.perIpPerHour');
  });
  it('falls back to the default instead of closing registration when settings cannot be read', async () => {
    readSetting.mockRejectedValue(new Error('database down'));
    await expect(registerIpLimit()).resolves.toBe(60);
  });
});
