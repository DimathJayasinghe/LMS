import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('@/config/env', () => ({
	env: {
		JWT_ACCESS_EXPIRES_IN: '15m',
		JWT_REFRESH_EXPIRES_IN: '7d',
		NODE_ENV: 'test',
		FRONTEND_URL: 'http://localhost:3000',
	},
}));
vi.mock('@/config/database', () => ({ prisma: {} }));

import { setAuthCookies, clearAuthCookies } from './auth-cookies';

const fakeRes = () => {
	const res = { cookie: vi.fn(), clearCookie: vi.fn() };
	return res as unknown as Response & typeof res;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('setAuthCookies', () => {
	it('keeps the access cookie as long as the refresh cookie so the browser still sends an expired JWT', () => {
		const res = fakeRes();
		setAuthCookies(res, 'access', 'refresh');

		const [, , accessOpts] = res.cookie.mock.calls.find((c) => c[0] === 'access_token')!;
		const [, , refreshOpts] = res.cookie.mock.calls.find((c) => c[0] === 'refresh_token')!;
		expect(accessOpts.maxAge).toBe(SEVEN_DAYS_MS);
		expect(accessOpts.maxAge).toBe(refreshOpts.maxAge);
	});

	it('keeps the refresh cookie scoped to /api/auth and the access cookie at the root path', () => {
		const res = fakeRes();
		setAuthCookies(res, 'access', 'refresh');

		const [, , accessOpts] = res.cookie.mock.calls.find((c) => c[0] === 'access_token')!;
		const [, , refreshOpts] = res.cookie.mock.calls.find((c) => c[0] === 'refresh_token')!;
		expect(refreshOpts.path).toBe('/api/auth');
		expect(accessOpts.path).toBe('/');
	});
});

describe('clearAuthCookies', () => {
	it('clears both cookies, the refresh one with its scoped path', () => {
		const res = fakeRes();
		clearAuthCookies(res);

		const names = res.clearCookie.mock.calls.map((c) => c[0]);
		expect(names).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));
		const refresh = res.clearCookie.mock.calls.find((c) => c[0] === 'refresh_token')!;
		expect(refresh[1].path).toBe('/api/auth');
	});
});
