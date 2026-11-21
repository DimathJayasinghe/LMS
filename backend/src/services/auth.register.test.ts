import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const { userFindUnique, userCreate, userUpdate, refreshTokenCreate, transaction, assertScanCodeFree, warn } = vi.hoisted(
	() => ({
		userFindUnique: vi.fn(),
		userCreate: vi.fn(),
		userUpdate: vi.fn(),
		refreshTokenCreate: vi.fn(),
		transaction: vi.fn(),
		assertScanCodeFree: vi.fn(),
		warn: vi.fn(),
	}),
);

const txClient = { user: { create: userCreate, update: userUpdate } };

vi.mock('@/config/database', () => ({
	prisma: {
		user: { findUnique: userFindUnique },
		refreshToken: { create: refreshTokenCreate },
		$transaction: transaction,
	},
}));

vi.mock('@/config/logger', () => ({
	logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() },
}));

vi.mock('bcryptjs', () => ({
	default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn().mockResolvedValue('hashed') },
}));

vi.mock('@/services/scan-code.service', () => ({ assertScanCodeFree }));

import { register } from './auth.service';

const input = { email: 'new@lms.com', name: 'New Student', password: 'Passw0rd1' };

const createdUser = (indexNumber: number) => ({
	id: 'user-new',
	indexNumber,
	email: input.email,
	name: input.name,
	role: Role.STUDENT,
	password: 'hashed',
	phone: null,
	nic: null,
	address: null,
	city: null,
	deletedAt: null,
	createdAt: new Date('2026-11-21'),
	barcode: null,
});

beforeEach(() => {
	userFindUnique.mockReset().mockResolvedValue(null);
	userCreate.mockReset().mockResolvedValue(createdUser(7));
	userUpdate.mockReset().mockImplementation(async ({ data }: { data: { barcode: string } }) => ({
		...createdUser(7),
		barcode: data.barcode,
	}));
	refreshTokenCreate.mockReset().mockResolvedValue({});
	transaction.mockReset().mockImplementation(async (callback: (tx: typeof txClient) => unknown) => callback(txClient));
	assertScanCodeFree.mockReset().mockResolvedValue(undefined);
	warn.mockReset();
});

describe('register — LMS card write', () => {
	it('creates the user and writes the card in one transaction, checking the card as the reserved-format writer', async () => {
		const result = await register(input);

		expect(transaction).toHaveBeenCalledTimes(1);
		expect(assertScanCodeFree).toHaveBeenCalledWith(txClient, 'LMS-000007', {
			exceptUserId: 'user-new',
			allowLmsFormat: true,
		});
		expect(userUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'user-new' }, data: { barcode: 'LMS-000007' } }),
		);
		expect(assertScanCodeFree.mock.invocationCallOrder[0]).toBeLessThan(userUpdate.mock.invocationCallOrder[0]!);
		expect(result.user.email).toBe(input.email);
		expect(refreshTokenCreate).toHaveBeenCalledTimes(1);
	});

	it('fails the whole registration when the card collides, logs it, and issues no session', async () => {
		assertScanCodeFree.mockRejectedValue(new AppError('CODE_UNAVAILABLE', 409, 'This code is unavailable.'));

		await expect(register(input)).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE', statusCode: 409 });

		expect(userUpdate).not.toHaveBeenCalled();
		expect(refreshTokenCreate).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('does not touch the transaction when the email is already registered', async () => {
		userFindUnique.mockResolvedValueOnce({ id: 'someone' });

		await expect(register(input)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
		expect(transaction).not.toHaveBeenCalled();
	});
});
