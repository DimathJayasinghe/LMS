import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';
import { captureException } from '../config/sentry';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const bodyKeys =
    req.body && typeof req.body === 'object'
      ? Object.keys(req.body as Record<string, unknown>)
      : undefined;

  // Known operational errors (thrown by services via AppError)
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      captureException(err, {
        tags: { type: 'AppError', path: req.path, method: req.method },
        extras: { params: req.params, query: req.query, bodyKeys },
        user: req.user ? { id: req.user.userId, role: req.user.role } : undefined,
      });
    }
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      code: err.code,
      ...(err.details === undefined ? {} : { data: err.details }),
    });
    return;
  }

  // Malformed JSON body (Express body-parser throws SyntaxError with statusCode=400)
  if (
    err instanceof SyntaxError &&
    'statusCode' in err &&
    (err as { statusCode: number }).statusCode === 400
  ) {
    captureException(err, {
      tags: { type: 'SyntaxError', path: req.path, method: req.method },
      extras: { params: req.params, query: req.query, bodyKeys },
      user: req.user ? { id: req.user.userId, role: req.user.role } : undefined,
    });
    res.status(400).json({
      status: 'error',
      message: 'Invalid JSON in request body.',
      code: 'MALFORMED_JSON',
    });
    return;
  }

  // Unknown / unexpected errors — log full details, return generic message
  logger.error({ err }, 'Unhandled error');
  captureException(err, {
    tags: { type: 'UnhandledError', path: req.path, method: req.method },
    extras: { params: req.params, query: req.query, bodyKeys },
    user: req.user ? { id: req.user.userId, role: req.user.role } : undefined,
  });
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong. Please try again.',
    code: 'INTERNAL_ERROR',
  });
};
