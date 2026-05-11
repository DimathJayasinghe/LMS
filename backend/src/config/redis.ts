import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Redis client singleton.
 *
 * Used by:
 *  - express-rate-limit (RedisStore) — distributed rate limiting across auto-scaled instances
 *  - BullMQ (future) — background job queue
 *  - Session/cache layer (future)
 *
 * If Redis is unreachable, the app logs a warning but does NOT crash.
 * Rate limiting degrades to in-memory when Redis is down.
 */
const REDIS_RETRY_LOG_INTERVAL = 10; // Only log every Nth reconnect attempt

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ — retries indefinitely
  enableReadyCheck: true,
  lazyConnect: true,          // Don't connect on import — connect on first command
  retryStrategy(times: number): number {
    const delay = Math.min(times * 50, 5000);

    // Log only on first attempt and every Nth attempt to avoid log spam
    if (times === 1 || times % REDIS_RETRY_LOG_INTERVAL === 0) {
      logger.warn({ attempt: times, delayMs: delay }, 'Redis reconnecting...');
    }

    return delay;
  },
});

// ─── Lifecycle Logging ───────────────────────────────────────

redis.on('connect', () => {
  logger.info('Redis client connected');
});

redis.on('ready', () => {
  logger.info('Redis client ready — accepting commands');
});

redis.on('error', (err: Error) => {
  // Suppress repeated ECONNREFUSED noise in development
  // The retryStrategy already logs reconnect attempts
  if (!err.message.includes('ECONNREFUSED')) {
    logger.error({ err: err.message }, 'Redis client error');
  }
});

redis.on('close', () => {
  // Only log once when the connection is first lost (not on every retry)
});

/**
 * Attempts an initial connection. Logs success or a single warning on failure.
 * Called once at server startup — non-blocking.
 */
export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect();
  } catch {
    logger.warn('Redis unavailable at startup — rate limiting will use in-memory fallback');
  }
};

/**
 * Graceful shutdown helper.
 * Call from process signal handlers (SIGTERM/SIGINT) to close the connection cleanly.
 */
export const disconnectRedis = async (): Promise<void> => {
  await redis.quit();
  logger.info('Redis disconnected gracefully');
};
