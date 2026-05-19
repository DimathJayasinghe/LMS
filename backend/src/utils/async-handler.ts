import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async Express handler so thrown errors are forwarded to next().
 * Eliminates repetitive try/catch in every controller method.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
