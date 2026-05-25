import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import { IDEMPOTENCY_KEY_HEADER } from '../utils/constants';

/**
 * Idempotency middleware for high-stakes POST routes.
 *
 * Problem it solves:
 *   A student double-clicks "Pay" or their network retries the request.
 *   Without this, the backend processes the payment twice → student charged double.
 *
 * How it works (industry-standard two-layer pattern):
 *   Layer 1 — Postgres (durable cache): Check if the key has a completed response.
 *   Layer 2 — Redis SET NX (atomic lock): Prevents the race condition where two
 *             identical requests both pass the Postgres check before either persists.
 *
 * Race condition this solves:
 *   Without the Redis lock, two requests arriving within the same millisecond
 *   could both find `existing = null` in Postgres and execute the handler in
 *   parallel. Redis SET NX is atomic — only one request wins the lock.
 *
 * Response caching rules:
 *   - 2xx/3xx/4xx responses → cached (deterministic outcomes are safe to replay)
 *   - 5xx responses → NOT cached (transient failures; lock released for retry)
 *
 * Where to use:
 *   - POST /api/payments/payhere (cannot charge twice)
 *   - PATCH /api/submissions/:id/marks (cannot submit scores twice)
 *   - POST /api/accounts/activate (cannot activate twice)
 *
 * Apply per-route AFTER validateBody, BEFORE the controller:
 *   router.post('/pay', verifyToken, requireRole('STUDENT'), validateBody(schema), checkIdempotency, controller.fn)
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Redis key prefix for idempotency locks
const LOCK_PREFIX = 'idempotency:lock:';

// How long a lock lives — max time a request should take before we assume it's dead.
// 5 minutes is generous; most requests complete in < 1 second.
const LOCK_TTL_MS = 5 * 60 * 1000;

export const checkIdempotency = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const key = req.headers[IDEMPOTENCY_KEY_HEADER];

  // No key provided — reject. High-stakes routes MUST have an idempotency key.
  if (!key || typeof key !== 'string') {
    res.status(400).json({
      status: 'error',
      message: `Missing required header: ${IDEMPOTENCY_KEY_HEADER}`,
    });
    return;
  }

  // Validate UUID format (36 chars with hyphens)
  if (!UUID_REGEX.test(key)) {
    res.status(400).json({
      status: 'error',
      message: 'Idempotency key must be a valid UUID.',
    });
    return;
  }

  try {
    // ─── Step 1: Check Postgres for a completed (cached) response ─────
    // If a previous request with this key completed successfully, replay it.
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { key },
    });

    if (existing) {
      logger.info(
        { idempotencyKey: key, route: req.originalUrl },
        'Idempotency cache hit — returning stored response',
      );
      res.status(existing.responseCode).json(existing.responseBody);
      return;
    }

    // ─── Step 2: Acquire atomic lock via Redis SET NX ─────────────────
    // This prevents the TOCTOU race between the Postgres check and the
    // handler execution. Only one request wins the lock; duplicates get 409.
    const lockKey = `${LOCK_PREFIX}${key}`;
    let lockAcquired = false;

    try {
      const result = await redis.set(lockKey, req.originalUrl, 'PX', LOCK_TTL_MS, 'NX');
      lockAcquired = result === 'OK';
    } catch {
      // Redis unavailable — degrade gracefully. The Postgres unique constraint
      // on IdempotencyRecord.key is the last line of defense against true
      // duplicates, but the race window remains open. This is acceptable:
      // Redis downtime is rare and the window is milliseconds.
      logger.warn(
        { idempotencyKey: key },
        'Redis unavailable for idempotency lock — proceeding without atomic guard',
      );
      lockAcquired = true;
    }

    if (!lockAcquired) {
      // Another request with this key is currently being processed.
      // Return 409 so the client knows to wait, not retry.
      res.status(409).json({
        status: 'error',
        message: 'A request with this idempotency key is already being processed.',
      });
      return;
    }

    // ─── Step 3: Intercept response to cache + release lock ──────────
    const originalJson = res.json.bind(res);

    res.json = ((body: unknown): Response => {
      if (res.statusCode < 500) {
        // Cache deterministic responses (2xx, 3xx, 4xx) — safe to replay.
        // Store asynchronously — don't block the client.
        prisma.idempotencyRecord
          .create({
            data: {
              key,
              route: req.originalUrl,
              responseCode: res.statusCode,
              responseBody: body as object,
            },
          })
          .catch((err: Error) => {
            // Log but don't fail — the response is already sent to the client
            logger.error(
              { err: err.message, idempotencyKey: key },
              'Failed to store idempotency record',
            );
          });
      } else {
        // 5xx — transient server error. Release the lock so the client can retry.
        // Do NOT cache: the downstream service may have recovered.
        redis.del(lockKey).catch((err: Error) => {
          logger.error(
            { err: err.message, idempotencyKey: key },
            'Failed to release idempotency lock after server error',
          );
        });
      }

      return originalJson(body);
    }) as Response['json'];

    next();
  } catch (error) {
    // DB error during the Postgres lookup — let the request through rather
    // than blocking the user from completing a legitimate action.
    logger.error(
      { err: error, idempotencyKey: key },
      'Idempotency lookup failed — proceeding without dedup',
    );
    next();
  }
};
