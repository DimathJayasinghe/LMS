import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error';
import { logger } from '../config/logger';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Known operational errors (thrown by services via AppError)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      code: err.code,
    });
    return;
  }

  // Malformed JSON body (Express body-parser throws SyntaxError with statusCode=400)
  if (
    err instanceof SyntaxError &&
    'statusCode' in err &&
    (err as { statusCode: number }).statusCode === 400
  ) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid JSON in request body.',
      code: 'MALFORMED_JSON',
    });
    return;
  }

  // Unknown / unexpected errors — log full details, return generic message
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong. Please try again.',
    code: 'INTERNAL_ERROR',
  });
};
