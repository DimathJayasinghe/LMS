import type { Response } from 'express';
import { COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN, COOKIE_OPTIONS } from '@/utils/constants';
import { getCookieMaxAge } from '@/services/auth.service';

/** Sets both access + refresh token cookies (refresh scoped to /api/auth). */
export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
	const { accessMaxAge, refreshMaxAge } = getCookieMaxAge();
	res.cookie(COOKIE_ACCESS_TOKEN, accessToken, { ...COOKIE_OPTIONS, maxAge: accessMaxAge });
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
