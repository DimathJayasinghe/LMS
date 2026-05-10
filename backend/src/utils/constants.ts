// Shared constants (limits, durations, etc.)

/** bcrypt salt rounds — 12 is a good balance between security and speed */
export const BCRYPT_SALT_ROUNDS = 12;

/** Cookie names for access and refresh tokens */
export const COOKIE_ACCESS_TOKEN = 'access_token';
export const COOKIE_REFRESH_TOKEN = 'refresh_token';

/** Cookie config shared between set and clear operations */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

/** Max login attempts per minute per IP before rate limiting */
export const MAX_LOGIN_ATTEMPTS_PER_MINUTE = 10;
