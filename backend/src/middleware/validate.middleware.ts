import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Factory: returns middleware that validates req.body against a Zod schema.
 * On failure, responds with 400 and structured field-level error details.
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        data: fieldErrors,
      });
      return;
    }

    req.body = result.data;
    next();
  };
};

/**
 * Factory: validates req.params against a Zod schema.
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid URL parameters',
        data: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    req.params = result.data as Record<string, string>;
    next();
  };
};

/**
 * Factory: validates req.query against a Zod schema.
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid query parameters',
        data: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    req.query = result.data as Record<string, string>;
    next();
  };
};

// Re-export z for convenience so route files don't need a separate zod import
export { z };
