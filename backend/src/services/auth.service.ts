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
export interface AuthTokens {
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
  address: string | null;
  city: string | null;
  createdAt: Date;
  profileImage: string | null;
  /** Present on `/auth/me` — the caller's own account fields. */
  barcode?: string | null;
  setupCompleted?: boolean;
  /** Presence-only flags — never the raw R2 key (see account-setup.endpoints.md). */
  nicFrontUploaded?: boolean;
  nicBackUploaded?: boolean;
  /** Self-only — credential-change cooldown anchors (see profile.endpoints.md). */
  emailChangedAt?: Date | null;
  passwordChangedAt?: Date | null;
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
  // jwtid: see signRefreshToken below — same fix, for the same reason
  // (consistency; access tokens aren't persisted so they can't 500, but two
  // byte-identical tokens for the same user is still worth avoiding).
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: expiresInSeconds,
    jwtid: crypto.randomUUID(),
  });
};

const signRefreshToken = (payload: JwtPayload): string => {
  const expiresInSeconds = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
  // jwtid makes every issuance unique even for the same user within the same
  // second (iat has only second-granularity) — without it, two refresh tokens
  // signed in the same second are byte-identical, so their SHA-256 hashes
  // collide on RefreshToken.token's unique constraint and the second issuance
  // 500s (e.g. register() immediately followed by login()).
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: expiresInSeconds,
    jwtid: crypto.randomUUID(),
  });
};

/**
 * Hashes a refresh token before storing in the database.
 * We never store raw tokens — if the DB leaks, tokens are useless.
 */
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * The LMS QR (`User.barcode`) is issued to every student automatically —
 * derived from their already-unique `indexNumber`, so it's guaranteed
 * collision-free without a generate-and-retry loop. Admins can still
 * reassign it later via `PATCH /users/:id/barcode` (e.g. a lost card).
 */
const formatLmsBarcode = (indexNumber: number): string => `LMS-${String(indexNumber).padStart(6, '0')}`;

/** Strips sensitive fields from user objects before returning to client */
const toSafeUser = (user: {
  id: string;
  indexNumber: number;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  nic: string | null;
  address: string | null;
  city: string | null;
  createdAt: Date;
  profileImage?: string | null;
}): SafeUser => ({
  id: user.id,
  indexNumber: user.indexNumber,
  email: user.email,
  name: user.name,
  role: user.role,
  phone: user.phone,
  nic: user.nic,
  address: user.address,
  city: user.city,
  createdAt: user.createdAt,
  profileImage: user.profileImage ?? null,
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

  const created = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      password: hashedPassword,
      phone: data.phone ?? null,
      nic: data.nic ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      // role defaults to STUDENT (schema default)
      // deletedAt defaults to null (active)
    },
  });

  // indexNumber is only known once autoincrement assigns it, so the LMS QR
  // (derived from it) is a follow-up write, not part of the create() data.
  const user = await prisma.user.update({
    where: { id: created.id },
    data: { barcode: formatLmsBarcode(created.indexNumber) },
  });

  const tokens = await issueTokenPair(user.id, user.role);

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

  const tokens = await issueTokenPair(user.id, user.role);

  logger.info({ userId: user.id }, 'User logged in');

  return { user: toSafeUser(user), tokens };
};

const revokeAfterReuse = async (userId: string): Promise<never> => {
  // Revoke ALL tokens for this user as a security precaution.
  await prisma.refreshToken.deleteMany({ where: { userId } });

  logger.warn({ userId }, 'Refresh token reuse detected — all tokens revoked (possible theft)');

  throw new AppError(
    'REFRESH_TOKEN_REUSED',
    401,
    'Session compromised. All sessions have been revoked. Please log in again.',
  );
};

/**
 * Rotates the refresh token — issues a new pair and invalidates the old one.
 * This is the "silent refresh" flow from the plan doc (§1, JWT Expiration Trap).
 *
 * Security: if a stolen refresh token is reused after rotation, the entire
 * token family is revoked (all tokens for that user are deleted). A presentation
 * within REFRESH_REUSE_GRACE_SECONDS of the rotation is treated as a legitimate
 * duplicate (several tabs, or a retried request) and gets a fresh pair instead.
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
    // Token was never issued or has been deleted — possible token theft.
    return revokeAfterReuse(decoded.userId);
  }

  const graceMs = env.REFRESH_REUSE_GRACE_SECONDS * 1000;
  const now = new Date();

  if (storedToken.rotatedAt === null) {
    // First use: mark the row rotated. updateMany with the rotatedAt guard means
    // two concurrent first uses cannot both win; the loser (count 0) is a duplicate
    // that was rotated an instant ago, so it takes the grace path below.
    const { count } = await prisma.refreshToken.updateMany({
      where: { id: storedToken.id, rotatedAt: null },
      data: { rotatedAt: now },
    });
    if (count === 0 && graceMs === 0) {
      return revokeAfterReuse(decoded.userId);
    }
  } else if (graceMs === 0 || now.getTime() - storedToken.rotatedAt.getTime() > graceMs) {
    // Presented again after the tolerance window: genuine reuse.
    return revokeAfterReuse(decoded.userId);
  }

  // Verify the user still exists and is active
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });

  if (!user || user.deletedAt) {
    throw new AppError('ACCOUNT_DEACTIVATED', 403, 'Account no longer active.');
  }

  // Issue a fresh token pair
  const tokens = await issueTokenPair(user.id, user.role);

  // Rotated rows older than the tolerance window can never be accepted again.
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, rotatedAt: { lt: new Date(now.getTime() - graceMs) } },
  });

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
      address: true,
      city: true,
      createdAt: true,
      profileImage: true,
      barcode: true,
      setupCompleted: true,
      nicFrontUrl: true,
      nicBackUrl: true,
      emailChangedAt: true,
      passwordChangedAt: true,
    },
  });

  if (!user) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
  }

  // `/auth/me` returns the caller their own barcode (entrance QR) + setup gate,
  // which the shared `toSafeUser` shape omits. NIC upload state is a
  // presence flag only — never the raw R2 key — so every SSR page's auth
  // check doesn't pay for a signed-URL round trip it doesn't need.
  return {
    ...toSafeUser(user),
    barcode: user.barcode,
    setupCompleted: user.setupCompleted,
    nicFrontUploaded: Boolean(user.nicFrontUrl),
    nicBackUploaded: Boolean(user.nicBackUrl),
    emailChangedAt: user.emailChangedAt,
    passwordChangedAt: user.passwordChangedAt,
  };
};

// ─── Token Helpers ───────────────────────────────────────────

/**
 * Generates an access + refresh token pair and persists the refresh token hash.
 * The raw refresh token is returned (not the hash) — the controller sets it as a cookie.
 * Exported so self-service flows (e.g. password change) can reissue a session.
 */
export const issueTokenPair = async (
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

/** Deletes every refresh-token row for a user (used on password change). */
export const revokeAllRefreshTokens = async (userId: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
};
