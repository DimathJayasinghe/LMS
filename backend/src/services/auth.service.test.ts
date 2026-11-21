import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Role } from '@prisma/client';

const { userFindUnique, refreshTokenCreate } = vi.hoisted(() => ({
	userFindUnique: vi.fn(),
	refreshTokenCreate: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		user: { findUnique: userFindUnique },
		refreshToken: { create: refreshTokenCreate },
	},
}));

vi.mock('@/config/logger', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('bcryptjs', () => ({
	default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn() },
}));

import { login } from './auth.service';

const activeUser = {
	id: 'user-1',
	indexNumber: 1,
	email: 'student@lms.com',
	name: 'Student One',
	role: Role.STUDENT,
	password: 'hashed',
	phone: null,
	nic: null,
	address: null,
	city: null,
	deletedAt: null,
	createdAt: new Date('2026-01-01'),
};

beforeEach(() => {
	userFindUnique.mockReset().mockResolvedValue(activeUser);
	refreshTokenCreate.mockReset().mockResolvedValue({});
});

afterEach(() => {
	vi.useRealTimers();
});

describe('login — refresh token uniqueness', () => {
	it('issues distinct refresh tokens for two logins within the same second', async () => {
		// Freeze time so both logins share the exact same `iat` — the
		// regression this guards is two same-second issuances producing a
		// byte-identical JWT (and therefore an identical stored hash).
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-11T10:00:00.000Z'));

		const first = await login({ email: activeUser.email, password: 'whatever1' });
		const second = await login({ email: activeUser.email, password: 'whatever1' });

		expect(first.tokens.refreshToken).not.toBe(second.tokens.refreshToken);

		const storedHashes = refreshTokenCreate.mock.calls.map((call) => call[0].data.token);
		expect(new Set(storedHashes).size).toBe(2);
	});

	it('rejects a deactivated account before issuing tokens', async () => {
		userFindUnique.mockResolvedValueOnce({ ...activeUser, deletedAt: new Date() });

		await expect(login({ email: activeUser.email, password: 'x' })).rejects.toMatchObject({
			code: 'ACCOUNT_DEACTIVATED',
			statusCode: 403,
		});
		expect(refreshTokenCreate).not.toHaveBeenCalled();
	});

	it('gives a vague error for an unknown email (no user enumeration)', async () => {
		userFindUnique.mockResolvedValueOnce(null);

		await expect(login({ email: 'nobody@lms.com', password: 'x' })).rejects.toMatchObject({
			code: 'INVALID_CREDENTIALS',
			statusCode: 401,
		});
	});
});

describe('getMe organization', () => {
  it('returns the organization and its billing timezone', async () => {
    const organization = { id: 'org', name: 'School', timezone: 'Asia/Colombo' };
    userFindUnique.mockResolvedValueOnce({ ...activeUser, organization });
    const { getMe } = await import('./auth.service');
    expect(await getMe(activeUser.id)).toMatchObject({ organization });
  });
});
