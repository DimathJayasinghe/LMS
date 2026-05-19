import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from './redis';
import { logger } from './logger';
import {
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_GLOBAL_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_AUTH_WINDOW_MS,
} from '../utils/constants';

/**
 * Creates an express-rate-limit instance.
 *
 * Store selection:
 *  - Redis is available → uses RedisStore (distributed across all Render instances)
 *  - Redis is down      → falls back to in-memory store (per-instance only)
 *
 * In production, Redis should always be available. In local dev, it's okay to
 * run without it — the in-memory fallback still provides rate limiting.
 */
const createLimiter = (
  windowMs: number,
  max: number,
  keyPrefix: string,
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
  authLimiter: ReturnType<typeof rateLimit>;
} => ({
  /**
   * Global limiter: applied to all `/api/*` routes.
   * 100 requests per minute per IP — generous for normal usage,
   * tight enough to block naive DoS.
   */
  globalLimiter: createLimiter(
    RATE_LIMIT_GLOBAL_WINDOW_MS,
    RATE_LIMIT_GLOBAL_MAX,
    'rl:global:',
  ),

  /**
   * Auth limiter: applied to `/api/auth/login` and `/api/auth/register`.
   * 10 requests per minute per IP — prevents brute-force password attacks.
   */
  authLimiter: createLimiter(
    RATE_LIMIT_AUTH_WINDOW_MS,
    RATE_LIMIT_AUTH_MAX,
    'rl:auth:',
  ),
});
