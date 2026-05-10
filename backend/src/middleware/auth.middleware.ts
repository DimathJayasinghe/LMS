import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { COOKIE_ACCESS_TOKEN } from '../utils/constants';
import type { JwtPayload } from '../types/auth.types';

/**
 * Extracts and verifies the JWT access token from HTTP-only cookies.
 * On success, attaches the decoded payload to req.user.
 * On failure, responds with 401 — the request never reaches the controller.
 */
export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies?.[COOKIE_ACCESS_TOKEN] as string | undefined;

  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please log in.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    // Distinguish expired tokens from invalid tokens for the frontend's
    // silent refresh logic — 401 on expired triggers the refresh flow.
    const isExpired = error instanceof jwt.TokenExpiredError;

    res.status(401).json({
      status: 'error',
      message: isExpired ? 'Token expired. Please refresh.' : 'Invalid token. Please log in again.',
      data: { expired: isExpired },
    });
  }
};
