import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '@/config/env';
import { AppError } from '@/utils/app-error';
import { ZOOM_WEBHOOK_MAX_SKEW_SECONDS } from '@/utils/constants';

type ZoomHeaders = {
  'x-zm-request-timestamp'?: string;
  'x-zm-signature'?: string;
};

const getZoomHeader = (req: Request, name: keyof ZoomHeaders): string | undefined => {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
};

const isTimestampFresh = (timestamp: string): boolean => {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - parsed) <= ZOOM_WEBHOOK_MAX_SKEW_SECONDS;
};

export const verifyZoomWebhook = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!env.ZOOM_WEBHOOK_SECRET) {
    throw new AppError('ZOOM_NOT_CONFIGURED', 503, 'Zoom webhook secret is not configured.');
  }

  const body = req.body as Record<string, unknown> | undefined;

  // Allow the URL validation event to pass through; it does not always include signature headers.
  if (body?.event === 'endpoint.url_validation') {
    next();
    return;
  }

  const timestamp = getZoomHeader(req, 'x-zm-request-timestamp');
  const signature = getZoomHeader(req, 'x-zm-signature');

  if (!timestamp || !signature) {
    res.status(401).json({
      status: 'error',
      message: 'Zoom signature headers are missing.',
      code: 'ZOOM_SIGNATURE_MISSING',
    });
    return;
  }

  if (!isTimestampFresh(timestamp)) {
    res.status(401).json({
      status: 'error',
      message: 'Zoom webhook timestamp is too old or invalid.',
      code: 'ZOOM_SIGNATURE_STALE',
    });
    return;
  }

  const rawBody = req.rawBody ?? '';
  const message = `v0:${timestamp}:${rawBody}`;
  const digest = createHmac('sha256', env.ZOOM_WEBHOOK_SECRET)
    .update(message)
    .digest('hex');
  const expectedSignature = `v0=${digest}`;

  if (signature.length !== expectedSignature.length) {
    res.status(401).json({
      status: 'error',
      message: 'Zoom signature verification failed.',
      code: 'ZOOM_SIGNATURE_INVALID',
    });
    return;
  }

  const isValid = timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );

  if (!isValid) {
    res.status(401).json({
      status: 'error',
      message: 'Zoom signature verification failed.',
      code: 'ZOOM_SIGNATURE_INVALID',
    });
    return;
  }

  next();
};
