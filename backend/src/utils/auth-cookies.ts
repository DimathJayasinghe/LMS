import type { Response } from 'express';
import { COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN, COOKIE_OPTIONS } from '@/utils/constants';
import { getCookieMaxAge } from '@/services/auth.service';

/**
 * Sets both access + refresh token cookies (refresh scoped to /api/auth).
 *
 * The access cookie deliberately lives as long as the refresh cookie: the JWT's own
 * `exp` stays authoritative, so the backend still reports an expired token as
 * `expired` and the client can refresh. If the cookie expired with the JWT the
 * browser would drop it and the request would look anonymous, never refreshing.
 */
export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
	const { refreshMaxAge } = getCookieMaxAge();
	res.cookie(COOKIE_ACCESS_TOKEN, accessToken, { ...COOKIE_OPTIONS, maxAge: refreshMaxAge });
	res.cookie(COOKIE_REFRESH_TOKEN, refreshToken, {
		...COOKIE_OPTIONS,
		maxAge: refreshMaxAge,
		path: '/api/auth',
	});
};

/** Clears both auth cookies. */
export const clearAuthCookies = (res: Response): void => {
	res.clearCookie(COOKIE_ACCESS_TOKEN, COOKIE_OPTIONS);
	res.clearCookie(COOKIE_REFRESH_TOKEN, { ...COOKIE_OPTIONS, path: '/api/auth' });
};
