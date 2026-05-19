import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { IDEMPOTENCY_KEY_HEADER } from '../utils/constants';

/**
 * Idempotency middleware for high-stakes POST routes.
 *
 * Problem it solves:
 *   A student double-clicks "Pay" or their network retries the request.
 *   Without this, the backend processes the payment twice → student charged double.
 *
 * How it works:
 *   1. The Next.js frontend generates a UUID (idempotency key) per action attempt
 *      and sends it in the `Idempotency-Key` header.
 *   2. This middleware checks if that key already exists in the database.
 *   3. If it EXISTS → return the cached response (no reprocessing).
 *   4. If it does NOT exist → let the request through, then intercept the response
 *      and store it for future duplicate detection.
 *
 * Where to use:
 *   - POST /api/payments/payhere (cannot charge twice)
 *   - POST /api/exams/finalize-marks (cannot submit scores twice)
 *   - POST /api/accounts/activate (cannot activate twice)
 *
 * Apply per-route AFTER validateBody, BEFORE the controller:
 *   router.post('/pay', verifyToken, requireRole('STUDENT'), validateBody(schema), checkIdempotency, controller.fn)
 */
export const checkIdempotency = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const key = req.headers[IDEMPOTENCY_KEY_HEADER];

  // No key provided — skip idempotency check (let validation/auth handle it)
  if (!key || typeof key !== 'string') {
    res.status(400).json({
      status: 'error',
      message: `Missing required header: ${IDEMPOTENCY_KEY_HEADER}`,
    });
    return;
  }

  // Validate UUID format (loose check — 36 chars with hyphens)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    res.status(400).json({
      status: 'error',
      message: 'Idempotency key must be a valid UUID.',
    });
    return;
  }

  try {
    // Check for existing record
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { key },
    });

    if (existing) {
      // Cache HIT — return the stored response without reprocessing
      logger.info(
        { idempotencyKey: key, route: req.originalUrl },
        'Idempotency cache hit — returning stored response',
      );

      res.status(existing.responseCode).json(existing.responseBody);
      return;
    }

    // Cache MISS — intercept the response to capture and store it
    const originalJson = res.json.bind(res);

    res.json = ((body: unknown): Response => {
      // Store the response asynchronously — don't block the client
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
          // Log but don't fail the request — the response is already sent
          logger.error(
            { err: err.message, idempotencyKey: key },
            'Failed to store idempotency record',
          );
        });

      return originalJson(body);
    }) as Response['json'];

    next();
  } catch (error) {
    // DB error during the lookup — let the request through rather than blocking
    // the user from completing a legitimate action
    logger.error(
      { err: error, idempotencyKey: key },
      'Idempotency lookup failed — proceeding without dedup',
    );
    next();
  }
};
