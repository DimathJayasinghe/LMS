import { Role } from '@prisma/client';

/** Payload encoded inside the JWT access token */
export interface JwtPayload {
  userId: string;
  role: Role;
}

/** Authenticated user attached to req.user by verifyToken middleware */
export interface AuthenticatedUser {
  userId: string;
  role: Role;
}

/**
 * Extends Express Request to include the authenticated user.
 * After verifyToken middleware runs, req.user is guaranteed to exist.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
