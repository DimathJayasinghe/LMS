import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

const { userFindUnique, tokenFindUnique, tokenUpdateMany, tokenDeleteMany, tokenCreate, mockEnv } = vi.hoisted(() => ({
	userFindUnique: vi.fn(),
	tokenFindUnique: vi.fn(),
	tokenUpdateMany: vi.fn(),
	tokenDeleteMany: vi.fn(),
	tokenCreate: vi.fn(),
	mockEnv: {
		JWT_ACCESS_SECRET: 'a'.repeat(32),
		JWT_REFRESH_SECRET: 'r'.repeat(32),
		JWT_ACCESS_EXPIRES_IN: '15m',
		JWT_REFRESH_EXPIRES_IN: '7d',
		REFRESH_REUSE_GRACE_SECONDS: 10,
	},
}));

vi.mock('@/config/env', () => ({ env: mockEnv }));
vi.mock('@/config/database', () => ({
	prisma: {
		user: { findUnique: userFindUnique },
		refreshToken: {
			findUnique: tokenFindUnique,
			updateMany: tokenUpdateMany,
			deleteMany: tokenDeleteMany,
			create: tokenCreate,
		},
	},
}));
vi.mock('@/config/logger', () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { refreshTokens } from './auth.service';

const NOW = new Date('2026-06-01T12:00:00.000Z');
const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const signRefresh = (opts: { secret?: string; expiresIn?: number } = {}) =>
	jwt.sign({ userId: 'user-1', role: 'STUDENT', jti: crypto.randomUUID() }, opts.secret ?? mockEnv.JWT_REFRESH_SECRET, {
		expiresIn: opts.expiresIn ?? 3600,
	});

const activeUser = {
	id: 'user-1',
	indexNumber: 1,
	email: 's@lms.com',
	name: 'S',
	role: Role.STUDENT,
	password: 'x',
	phone: null,
	nic: null,
	address: null,
	city: null,
	deletedAt: null,
	createdAt: new Date('2026-01-01'),
};

const row = (rotatedAt: Date | null) => ({ id: 'row-1', userId: 'user-1', rotatedAt });
const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);

const callArgs = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.map((c) => c[0]);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	mockEnv.REFRESH_REUSE_GRACE_SECONDS = 10;
	userFindUnique.mockReset().mockResolvedValue(activeUser);
	tokenFindUnique.mockReset();
	tokenUpdateMany.mockReset().mockResolvedValue({ count: 1 });
	tokenDeleteMany.mockReset().mockResolvedValue({ count: 0 });
	tokenCreate.mockReset().mockResolvedValue({});
});

afterEach(() => {
	vi.useRealTimers();
});

const revokedAll = () => callArgs(tokenDeleteMany).some((a) => a?.where && a.where.userId === 'user-1' && Object.keys(a.where).length === 1);

describe('refreshTokens: first use', () => {
	it('rotates by marking the row, not deleting it, and issues a fresh pair', async () => {
		tokenFindUnique.mockResolvedValue(row(null));
		const result = await refreshTokens(signRefresh());

		expect(tokenUpdateMany).toHaveBeenCalledWith({
			where: { id: 'row-1', rotatedAt: null },
			data: { rotatedAt: NOW },
		});
		expect(tokenCreate).toHaveBeenCalledTimes(1);
		expect(result.tokens.accessToken).toBeTruthy();
		expect(revokedAll()).toBe(false);
	});

	it('looks the row up by the hash of the presented token', async () => {
		tokenFindUnique.mockResolvedValue(row(null));
		const t = signRefresh();
		await refreshTokens(t);
		expect(tokenFindUnique).toHaveBeenCalledWith({ where: { token: sha(t) } });
	});

	it('two concurrent first uses both succeed and neither revokes (loser sees count 0, re-reads the rotated row)', async () => {
		tokenFindUnique
			.mockResolvedValueOnce(row(null))
			.mockResolvedValueOnce(row(null))
			.mockResolvedValue(row(NOW));
		tokenUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
		const t = signRefresh();
		const [a, b] = await Promise.all([refreshTokens(t), refreshTokens(t)]);

		expect(a.tokens.refreshToken).toBeTruthy();
		expect(b.tokens.refreshToken).toBeTruthy();
		expect(revokedAll()).toBe(false);
	});

	it('fails closed when the row vanished between lookup and rotation (logout or revoke-all raced us)', async () => {
		tokenFindUnique.mockResolvedValueOnce(row(null)).mockResolvedValue(null);
		tokenUpdateMany.mockResolvedValue({ count: 0 });

		await expect(refreshTokens(signRefresh())).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN', statusCode: 401 });
		expect(tokenCreate).not.toHaveBeenCalled();
		expect(userFindUnique).not.toHaveBeenCalled();
	});

	it('a count-0 loser whose re-read shows a rotation outside the grace window is reuse', async () => {
		tokenFindUnique.mockResolvedValueOnce(row(null)).mockResolvedValue(row(secondsAgo(30)));
		tokenUpdateMany.mockResolvedValue({ count: 0 });

		await expect(refreshTokens(signRefresh())).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
		expect(revokedAll()).toBe(true);
	});

	it('the count-0 loser is treated as reuse when the grace window is disabled', async () => {
		mockEnv.REFRESH_REUSE_GRACE_SECONDS = 0;
		tokenFindUnique.mockResolvedValueOnce(row(null)).mockResolvedValue(row(NOW));
		tokenUpdateMany.mockResolvedValue({ count: 0 });

		await expect(refreshTokens(signRefresh())).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
		expect(revokedAll()).toBe(true);
		expect(tokenCreate).not.toHaveBeenCalled();
	});
});

describe('refreshTokens: duplicate and reuse', () => {
	it.each([
		['rotated 1 s ago', 1],
		['rotated exactly at the grace boundary', 10],
	])('%s is a legitimate duplicate: fresh pair, no revoke', async (_n, secs) => {
		tokenFindUnique.mockResolvedValue(row(secondsAgo(secs)));
		const result = await refreshTokens(signRefresh());

		expect(result.tokens.refreshToken).toBeTruthy();
		expect(tokenUpdateMany).not.toHaveBeenCalled();
		expect(revokedAll()).toBe(false);
	});

	it('rotated 11 s ago is reuse: revoke all and refuse', async () => {
		tokenFindUnique.mockResolvedValue(row(secondsAgo(11)));

		await expect(refreshTokens(signRefresh())).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED', statusCode: 401 });
		expect(revokedAll()).toBe(true);
		expect(tokenCreate).not.toHaveBeenCalled();
	});

	it('grace 0 disables the tolerance: even a 1 s old rotation is reuse', async () => {
		mockEnv.REFRESH_REUSE_GRACE_SECONDS = 0;
		tokenFindUnique.mockResolvedValue(row(secondsAgo(1)));

		await expect(refreshTokens(signRefresh())).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
		expect(revokedAll()).toBe(true);
	});

	it('an unknown hash keeps the old behaviour: revoke all, REFRESH_TOKEN_REUSED', async () => {
		tokenFindUnique.mockResolvedValue(null);

		await expect(refreshTokens(signRefresh())).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
		expect(revokedAll()).toBe(true);
	});
});

describe('refreshTokens: check order and user state', () => {
	it('a bad signature is refused before any database read', async () => {
		await expect(refreshTokens(signRefresh({ secret: 'z'.repeat(32) }))).rejects.toMatchObject({
			code: 'INVALID_REFRESH_TOKEN',
		});
		expect(tokenFindUnique).not.toHaveBeenCalled();
	});

	it('an expired JWT is refused before any database read', async () => {
		const expired = jwt.sign({ userId: 'user-1', role: 'STUDENT' }, mockEnv.JWT_REFRESH_SECRET, { expiresIn: -5 });
		await expect(refreshTokens(expired)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
		expect(tokenFindUnique).not.toHaveBeenCalled();
	});

	it('the token lookup happens before the user lookup', async () => {
		tokenFindUnique.mockResolvedValue(null);
		await refreshTokens(signRefresh()).catch(() => undefined);
		expect(userFindUnique).not.toHaveBeenCalled();
	});

	it.each([
		['soft-deleted', { ...activeUser, deletedAt: new Date('2026-05-01') }],
		['missing', null],
	])('a %s user gets ACCOUNT_DEACTIVATED and no new tokens', async (_n, user) => {
		tokenFindUnique.mockResolvedValue(row(null));
		userFindUnique.mockResolvedValue(user);

		await expect(refreshTokens(signRefresh())).rejects.toMatchObject({ code: 'ACCOUNT_DEACTIVATED', statusCode: 403 });
		expect(tokenCreate).not.toHaveBeenCalled();
	});
});

describe('refreshTokens: opportunistic cleanup', () => {
	it('deletes only this user\'s rotated rows older than the grace window', async () => {
		tokenFindUnique.mockResolvedValue(row(null));
		await refreshTokens(signRefresh());

		const cleanup = callArgs(tokenDeleteMany).find((a) => a?.where?.rotatedAt);
		expect(cleanup).toEqual({
			where: { userId: 'user-1', rotatedAt: { lt: secondsAgo(10) } },
		});
		expect(revokedAll()).toBe(false);
	});
});
