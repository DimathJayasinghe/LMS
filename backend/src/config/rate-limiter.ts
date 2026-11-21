import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { RedisStore } from 'rate-limit-redis';
import { redis } from './redis';
import { logger } from './logger';
import { env } from './env';
import { COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN, RATE_LIMIT_GLOBAL_WINDOW_MS, RATE_LIMIT_AUTH_WINDOW_MS, RATE_LIMIT_STREAM_MAX, RATE_LIMIT_STREAM_WINDOW_MS } from '../utils/constants';

export const addressKey = (req: Request): string => `ip:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;

const tokenKey = (req: Request, cookie: string, secret: string): string => {
  const token = req.cookies?.[cookie] as unknown;
  if (typeof token === 'string') {
    try {
      const payload = jwt.verify(token, secret);
      if (typeof payload !== 'string' && typeof payload.userId === 'string' && payload.userId) return `u:${payload.userId}`;
    } catch {
      // Invalid and expired tokens share the anonymous address bucket.
    }
  }
  return addressKey(req);
};

export const accessKey = (req: Request): string => tokenKey(req, COOKIE_ACCESS_TOKEN, env.JWT_ACCESS_SECRET);
export const refreshKey = (req: Request): string => tokenKey(req, COOKIE_REFRESH_TOKEN, env.JWT_REFRESH_SECRET);
export const loginAccountKey = (req: Request): string => {
  const email: unknown = req.body?.email;
  return `${addressKey(req)}:account:${typeof email === 'string' ? email.trim().toLowerCase() : ''}`;
};
export const skipGlobal = (req: Request): boolean => req.path.replace(/\/$/, '') === '/auth/refresh';

const createLimiter = (
  windowMs: number,
  max: number | ((req: Request) => number),
  keyPrefix: string,
  keyGenerator?: (req: Request) => string,
  skip?: (req: Request) => boolean,
): ReturnType<typeof rateLimit> => {
  const isRedisReady = redis.status === 'ready' || redis.status === 'connect';
  const store = isRedisReady
    ? new RedisStore({
        sendCommand: ((...args: string[]) => redis.call(args[0] as string, ...args.slice(1))) as (...args: string[]) => Promise<boolean | number | string>,
        prefix: keyPrefix,
      })
    : undefined;
  if (!store) logger.warn({ keyPrefix }, 'Rate limiter using in-memory store (Redis unavailable)');
  return rateLimit({
    windowMs, max, store, keyGenerator, skip,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many requests. Please try again later.' },
  });
};

export const createRateLimiters = () => ({
  globalLimiter: createLimiter(RATE_LIMIT_GLOBAL_WINDOW_MS, (req) => accessKey(req).startsWith('u:') ? env.RATE_LIMIT_GLOBAL_USER_MAX : env.RATE_LIMIT_GLOBAL_ANON_MAX, 'rl:global:', accessKey, skipGlobal),
  loginAccountLimiter: createLimiter(RATE_LIMIT_AUTH_WINDOW_MS, env.RATE_LIMIT_LOGIN_ACCOUNT_MAX, 'rl:login-account:', loginAccountKey),
  loginIpLimiter: createLimiter(RATE_LIMIT_AUTH_WINDOW_MS, env.RATE_LIMIT_LOGIN_IP_MAX, 'rl:login-ip:', addressKey),
  registerLimiter: createLimiter(RATE_LIMIT_AUTH_WINDOW_MS, env.RATE_LIMIT_REGISTER_IP_MAX, 'rl:register:', addressKey),
  refreshLimiter: createLimiter(RATE_LIMIT_AUTH_WINDOW_MS, env.RATE_LIMIT_REFRESH_MAX, 'rl:refresh:', refreshKey),
  streamLimiter: createLimiter(RATE_LIMIT_STREAM_WINDOW_MS, RATE_LIMIT_STREAM_MAX, 'rl:stream:'),
});
