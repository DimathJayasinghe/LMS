import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

/**
 * Factory: creates middleware that restricts access to specific roles.
 * Must be placed AFTER verifyToken in the middleware chain.
 *
 * Usage: requireRole('SUPER_ADMIN', 'ADMIN')
 */
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required.',
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        status: 'error',
        message: 'You do not have permission to perform this action.',
        code: 'FORBIDDEN_ROLE',
      });
      return;
    }

    next();
  };
};
