import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { RedisStore } from 'rate-limit-redis';
import { redis } from './redis';
import { logger } from './logger';
import { env } from './env';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  RATE_LIMIT_GLOBAL_WINDOW_MS,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_STREAM_MAX,
  RATE_LIMIT_STREAM_WINDOW_MS,
} from '../utils/constants';

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

interface LimiterOptions {
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  skipSuccessfulRequests?: boolean;
  requestWasSuccessful?: (req: Request, res: Response) => boolean;
}

/**
 * Creates an express-rate-limit instance.
 *
 * Store selection:
 *  - Redis is available → uses RedisStore (survives restarts; shared if a second
 *    instance is ever added behind nginx)
 *  - Redis is down      → falls back to in-memory store (still fine on the single
 *    VPS this runs on today)
 *
 * In production, Redis should always be available. In local dev, it's okay to
 * run without it — the in-memory fallback still provides rate limiting.
 */
const createLimiter = (
  windowMs: number,
  max: number | ((req: Request) => number),
  keyPrefix: string,
  options: LimiterOptions = {},
): ReturnType<typeof rateLimit> => {
  // Check if Redis is connected at creation time
  const isRedisReady = redis.status === 'ready' || redis.status === 'connect';

  const store = isRedisReady
    ? new RedisStore({
        sendCommand: ((...args: string[]) =>
          redis.call(args[0] as string, ...args.slice(1))
        ) as (...args: string[]) => Promise<boolean | number | string>,
        prefix: keyPrefix,
      })
    : undefined; // undefined = use express-rate-limit's built-in MemoryStore

  if (!store) {
    logger.warn(
      { keyPrefix },
      'Rate limiter using in-memory store (Redis unavailable)',
    );
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,  // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,   // Disable deprecated `X-RateLimit-*` headers
    store,
    ...options,
    message: {
      status: 'error',
      message: 'Too many requests. Please try again later.',
    },
  });
};

// ─── Pre-built Limiters ──────────────────────────────────────

/**
 * Creates the global and auth-specific rate limiters.
 * Must be called AFTER connectRedis() to know the connection status.
 */
export const createRateLimiters = (): {
  globalLimiter: ReturnType<typeof rateLimit>;
  loginAccountLimiter: ReturnType<typeof rateLimit>;
  loginIpLimiter: ReturnType<typeof rateLimit>;
  registerLimiter: ReturnType<typeof rateLimit>;
  refreshLimiter: ReturnType<typeof rateLimit>;
  streamLimiter: ReturnType<typeof rateLimit>;
  zoomWebhookLimiter: ReturnType<typeof rateLimit>;
} => ({
  /**
   * Global limiter: applied to all `/api/*` routes.
   * Uses separate limits for authenticated users and anonymous addresses.
   */
  globalLimiter: createLimiter(
    RATE_LIMIT_GLOBAL_WINDOW_MS,
    (req) => accessKey(req).startsWith('u:') ? env.RATE_LIMIT_GLOBAL_USER_MAX : env.RATE_LIMIT_GLOBAL_ANON_MAX,
    'rl:global:',
    { keyGenerator: accessKey, skip: skipGlobal },
  ),

  /**
   * Auth limiters: applied to login, registration and refresh routes.
   */
  loginAccountLimiter: createLimiter(
    RATE_LIMIT_AUTH_WINDOW_MS,
    env.RATE_LIMIT_LOGIN_ACCOUNT_MAX,
    'rl:login-account:',
    { keyGenerator: loginAccountKey },
  ),
  loginIpLimiter: createLimiter(
    RATE_LIMIT_AUTH_WINDOW_MS,
    env.RATE_LIMIT_LOGIN_IP_MAX,
    'rl:login-ip:',
    { keyGenerator: addressKey },
  ),
  registerLimiter: createLimiter(
    RATE_LIMIT_AUTH_WINDOW_MS,
    env.RATE_LIMIT_REGISTER_IP_MAX,
    'rl:register:',
    { keyGenerator: addressKey },
  ),
  refreshLimiter: createLimiter(
    RATE_LIMIT_AUTH_WINDOW_MS,
    env.RATE_LIMIT_REFRESH_MAX,
    'rl:refresh:',
    { keyGenerator: refreshKey },
  ),

  // Counts every request except signature-verified ones (the verifier sets `zoomVerified`),
  // so a burst of real participant events at the start of a class is never throttled while
  // malformed, unsigned and unverified validation requests all count.
  zoomWebhookLimiter: createLimiter(60 * 1000, env.ZOOM_WEBHOOK_RATE_LIMIT_MAX, 'rl:zoom-webhook:', {
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.locals.zoomVerified === true,
  }),

  /**
   * Stream limiter: applied to the signed video-token endpoint.
   * 30 requests per minute per IP — a legit student watches a handful of
   * videos; this blocks scripted harvesting of stream tokens (§7.1).
   */
  streamLimiter: createLimiter(
    RATE_LIMIT_STREAM_WINDOW_MS,
    RATE_LIMIT_STREAM_MAX,
    'rl:stream:',
  ),
});
