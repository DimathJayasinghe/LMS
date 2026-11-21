import { Role } from '@prisma/client';

/** Payload encoded inside the JWT access token */
export interface JwtPayload {
  userId: string;
  role: Role;
  /** `User.tokenVersion` read with the credential; any later bump makes this token dead. Absent on tokens issued before the field existed (read as 0). */
  tokenVersion?: number;
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
      rawBody?: string;
    }
  }
}
