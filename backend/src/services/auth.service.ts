import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { BCRYPT_SALT_ROUNDS } from '../utils/constants';
import { logger } from '../config/logger';
import type { RegisterInput, LoginInput } from '../schemas/auth.schema';
import type { JwtPayload } from '../types/auth.types';

// ─── Types ───────────────────────────────────────────────────

/** Shape returned to the controller after successful auth operations */
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Public-safe user data (never includes password or internal fields) */
interface SafeUser {
  id: string;
  indexNumber: number;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  nic: string | null;
  createdAt: Date;
}

// ─── Token Helpers (private) ─────────────────────────────────

/**
 * Parses a duration string like "15m" or "7d" into seconds.
 * jwt.sign() accepts expiresIn as a string, but we need seconds for cookie maxAge.
 */
const parseDurationToSeconds = (duration: string): number => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] ?? 0);
};

// in backend/src/services/auth.service.ts
const signAccessToken = (payload: JwtPayload): string => {
  const expiresInSeconds = parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN);
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: expiresInSeconds });
};

const signRefreshToken = (payload: JwtPayload): string => {
  const expiresInSeconds = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: expiresInSeconds });
};

/**
 * Hashes a refresh token before storing in the database.
 * We never store raw tokens — if the DB leaks, tokens are useless.
 */
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/** Strips sensitive fields from user objects before returning to client */
const toSafeUser = (user: {
  id: string;
  indexNumber: number;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  nic: string | null;
  createdAt: Date;
}): SafeUser => ({
  id: user.id,
  indexNumber: user.indexNumber,
  email: user.email,
  name: user.name,
  role: user.role,
  phone: user.phone,
  nic: user.nic,
  createdAt: user.createdAt,
});

// ─── Public Service Methods ──────────────────────────────────

/**
 * Registers a new student account.
 * Students register with deletedAt = null (active by default).
 * Role assignment is done by Super Admin later — all registrations default to STUDENT.
 */
export const register = async (
  data: RegisterInput,
): Promise<{ user: SafeUser; tokens: AuthTokens }> => {
  // Check for existing email (case-insensitive via schema transform)
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new AppError('EMAIL_ALREADY_EXISTS', 409, 'An account with this email already exists.');
  }

  // Check NIC uniqueness if provided
  if (data.nic) {
    const existingNic = await prisma.user.findUnique({
      where: { nic: data.nic },
    });

    if (existingNic) {
      throw new AppError('NIC_ALREADY_EXISTS', 409, 'An account with this NIC already exists.');
    }
  }

  const hashedPassword = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      password: hashedPassword,
      phone: data.phone ?? null,
      nic: data.nic ?? null,
      // role defaults to STUDENT (schema default)
      // deletedAt defaults to null (active)
    },
  });

  const tokens = await generateAndStoreTokens(user.id, user.role);

  logger.info({ userId: user.id, email: user.email }, 'New student registered');

  return { user: toSafeUser(user), tokens };
};

/**
 * Authenticates a user with email + password.
 * Returns tokens on success; throws AppError on failure.
 */
export const login = async (
  data: LoginInput,
): Promise<{ user: SafeUser; tokens: AuthTokens }> => {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  // Intentionally vague error — don't reveal if email exists
  if (!user) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password.');
  }

  // Check if user is soft-deleted (deactivated)
  if (user.deletedAt) {
    throw new AppError(
      'ACCOUNT_DEACTIVATED',
      403,
      'Your account has been deactivated. Please contact the admin.',
    );
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.password);

  if (!isPasswordValid) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password.');
  }

  const tokens = await generateAndStoreTokens(user.id, user.role);

  logger.info({ userId: user.id }, 'User logged in');

  return { user: toSafeUser(user), tokens };
};

/**
 * Rotates the refresh token — issues a new pair and invalidates the old one.
 * This is the "silent refresh" flow from the plan doc (§1, JWT Expiration Trap).
 *
 * Security: if a stolen refresh token is reused after rotation, the entire
 * token family is revoked (all tokens for that user are deleted).
 */
export const refreshTokens = async (
  oldRefreshToken: string,
): Promise<{ user: SafeUser; tokens: AuthTokens }> => {
  // Verify the JWT signature first
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(oldRefreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Invalid refresh token. Please log in again.');
  }

  // Find the hashed token in the database
  const hashedOldToken = hashToken(oldRefreshToken);
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: hashedOldToken },
  });

  if (!storedToken) {
    // Token was already used or never existed — possible token theft.
    // Revoke ALL tokens for this user as a security precaution.
    await prisma.refreshToken.deleteMany({
      where: { userId: decoded.userId },
    });

    logger.warn(
      { userId: decoded.userId },
      'Refresh token reuse detected — all tokens revoked (possible theft)',
    );

    throw new AppError(
      'REFRESH_TOKEN_REUSED',
      401,
      'Session compromised. All sessions have been revoked. Please log in again.',
    );
  }

  // Delete the old token (one-time use)
  await prisma.refreshToken.delete({
    where: { id: storedToken.id },
  });

  // Verify the user still exists and is active
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });

  if (!user || user.deletedAt) {
    throw new AppError('ACCOUNT_DEACTIVATED', 403, 'Account no longer active.');
  }

  // Issue a fresh token pair
  const tokens = await generateAndStoreTokens(user.id, user.role);

  return { user: toSafeUser(user), tokens };
};

/**
 * Logs out by deleting the specific refresh token from the database.
 * The access token cookie will also be cleared by the controller.
 */
export const logout = async (refreshToken: string): Promise<void> => {
  const hashedToken = hashToken(refreshToken);

  // deleteMany instead of delete to avoid errors if token doesn't exist
  await prisma.refreshToken.deleteMany({
    where: { token: hashedToken },
  });

  logger.info('User logged out');
};

/**
 * Returns cookie maxAge values in milliseconds for the controller to use.
 */
export const getCookieMaxAge = (): { accessMaxAge: number; refreshMaxAge: number } => ({
  accessMaxAge: parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN) * 1000,
  refreshMaxAge: parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000,
});

/**
 * Fetches the authenticated user's public profile.
 * Throws 404 if the user no longer exists (edge case: account deleted mid-session).
 */
export const getMe = async (userId: string): Promise<SafeUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      indexNumber: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      nic: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
  }

  return toSafeUser(user);
};

// ─── Private Helpers ─────────────────────────────────────────

/**
 * Generates an access + refresh token pair and persists the refresh token hash.
 * The raw refresh token is returned (not the hash) — the controller sets it as a cookie.
 */
const generateAndStoreTokens = async (
  userId: string,
  role: string,
): Promise<AuthTokens> => {
  const payload: JwtPayload = { userId, role: role as JwtPayload['role'] };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store the HASHED refresh token — never the raw value
  const refreshExpiresIn = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
  await prisma.refreshToken.create({
    data: {
      token: hashToken(refreshToken),
      userId,
      expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
    },
  });

  return { accessToken, refreshToken };
};
