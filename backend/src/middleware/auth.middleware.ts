import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { COOKIE_ACCESS_TOKEN, MUST_CHANGE_PASSWORD_ALLOWED_ROUTES } from '../utils/constants';
import { getSessionState } from '../services/auth.service';
import type { JwtPayload } from '../types/auth.types';

const isAllowedWhileMustChangePassword = (req: Request): boolean => {
  const path = (req.originalUrl.split('?')[0] ?? '').replace(/\/+$/, '');
  return MUST_CHANGE_PASSWORD_ALLOWED_ROUTES.some(([method, allowed]) => method === req.method && allowed === path);
};

/**
 * Extracts and verifies the JWT access token from HTTP-only cookies, then checks the account's current state.
 * The role comes from the database row and the token must carry the account's current `tokenVersion`, so a role
 * change, deactivation, password change or reset applies on the next request instead of when the token expires.
 * On success, attaches the identity to req.user. On failure, responds with 401/403 — the request never reaches the controller.
 */
export const verifyToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.cookies?.[COOKIE_ACCESS_TOKEN] as string | undefined;

  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please log in.',
    });
    return;
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
  } catch (error) {
    // Distinguish expired tokens from invalid tokens for the frontend's
    // silent refresh logic — 401 on expired triggers the refresh flow.
    const isExpired = error instanceof jwt.TokenExpiredError;

    res.status(401).json({
      status: 'error',
      message: isExpired ? 'Token expired. Please refresh.' : 'Invalid token. Please log in again.',
      data: { expired: isExpired },
    });
    return;
  }

  try {
    const state = await getSessionState(decoded.userId);

    if (!state || state.deletedAt || state.tokenVersion !== (decoded.tokenVersion ?? 0)) {
      res.status(401).json({
        status: 'error',
        code: 'SESSION_REVOKED',
        message: 'Your session has ended. Please log in again.',
        data: { expired: false },
      });
      return;
    }

    if (state.mustChangePassword && !isAllowedWhileMustChangePassword(req)) {
      res.status(403).json({
        status: 'error',
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before continuing.',
      });
      return;
    }

    req.user = { userId: decoded.userId, role: state.role };
    next();
  } catch (error) {
    next(error);
  }
};
