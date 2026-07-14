import { Request, Response } from 'express';
import * as AuthService from '../services/auth.service';
import { asyncHandler } from '../utils/async-handler';
import { COOKIE_REFRESH_TOKEN } from '../utils/constants';
import { setAuthCookies, clearAuthCookies } from '../utils/auth-cookies';
import type { RegisterInput, LoginInput } from '../schemas/auth.schema';

// ─── Controller Methods ─────────────────────────────────────

/**
 * POST /api/auth/register
 * Creates a new student account and issues tokens via cookies.
 */
export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const data = req.body as RegisterInput;

  const { user, tokens } = await AuthService.register(data);

  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

  res.status(201).json({
    status: 'success',
    data: user,
    message: 'Registration successful.',
  });
});

/**
 * POST /api/auth/login
 * Authenticates and issues tokens via cookies.
 */
export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const data = req.body as LoginInput;

  const { user, tokens } = await AuthService.login(data);

  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

  res.status(200).json({
    status: 'success',
    data: user,
    message: 'Login successful.',
  });
});

/**
 * POST /api/auth/refresh
 * Silent token rotation — exchanges a valid refresh token for a new pair.
 * The Next.js frontend calls this automatically before the access token expires.
 */
export const refresh = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.[COOKIE_REFRESH_TOKEN] as string | undefined;

  if (!refreshToken) {
    res.status(401).json({
      status: 'error',
      message: 'No refresh token provided. Please log in.',
    });
    return;
  }

  const { user, tokens } = await AuthService.refreshTokens(refreshToken);

  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

  res.status(200).json({
    status: 'success',
    data: user,
    message: 'Token refreshed successfully.',
  });
});

/**
 * POST /api/auth/logout
 * Clears cookies and removes the refresh token from the database.
 */
export const logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.[COOKIE_REFRESH_TOKEN] as string | undefined;

  // Best-effort logout — don't fail if token is already gone
  if (refreshToken) {
    await AuthService.logout(refreshToken);
  }

  clearAuthCookies(res);

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully.',
  });
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile.
 * verifyToken middleware guarantees req.user is populated.
 */
export const getMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = await AuthService.getMe(req.user!.userId);

  res.status(200).json({
    status: 'success',
    data: user,
  });
});
