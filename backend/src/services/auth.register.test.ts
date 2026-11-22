import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const { refreshTokenCreate, registerSelf, warn } = vi.hoisted(() => ({
	refreshTokenCreate: vi.fn(),
	registerSelf: vi.fn(),
	warn: vi.fn(),
}));

vi.mock('@/config/database', () => ({ prisma: { refreshToken: { create: refreshTokenCreate } } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/services/self-registration.service', () => ({ registerSelf }));

import { register } from './auth.service';

const input = { email: 'new@lms.com', name: 'New Student', password: 'Passw0rd1', dateOfBirth: '2005-03-04', phone: '+94771234567' };

const registered = {
	id: 'user-new',
	indexNumber: 7,
	name: 'New Student',
	email: 'new@lms.com',
	role: Role.STUDENT,
	barcode: 'LMS-000007',
	mustChangePassword: false,
	setupCompleted: false,
	tokenVersion: 0,
};

beforeEach(() => {
	registerSelf.mockReset().mockResolvedValue(registered);
	refreshTokenCreate.mockReset().mockResolvedValue({});
	warn.mockReset();
});

describe('register', () => {
	it('signs the new student in and answers with the minimal shape', async () => {
		const result = await register(input);

		expect(registerSelf).toHaveBeenCalledWith(input);
		expect(result.tokens.accessToken).toEqual(expect.any(String));
		expect(refreshTokenCreate).toHaveBeenCalledTimes(1);
		expect(result.user).toEqual({
			id: 'user-new', indexNumber: 7, name: 'New Student', email: 'new@lms.com', role: Role.STUDENT,
			barcode: 'LMS-000007', mustChangePassword: false, setupCompleted: false,
		});
	});

	it('never returns the session version, the phone, the NIC or the address', async () => {
		const { user } = await register(input);
		expect(Object.keys(user)).not.toEqual(expect.arrayContaining(['tokenVersion']));
		for (const key of ['phone', 'nic', 'address', 'city', 'password', 'dateOfBirth', 'guardianMobile']) {
			expect(user).not.toHaveProperty(key);
		}
	});

	it('passes a refusal through without issuing a session', async () => {
		registerSelf.mockRejectedValue(new AppError('EMAIL_ALREADY_EXISTS', 409, 'An account with this email already exists.'));

		await expect(register(input)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
		expect(refreshTokenCreate).not.toHaveBeenCalled();
	});

	it('logs a card collision as a warning and still refuses the registration', async () => {
		registerSelf.mockRejectedValue(new AppError('CODE_UNAVAILABLE', 409, 'x'));

		await expect(register(input)).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
		expect(warn).toHaveBeenCalledWith({ email: 'new@lms.com' }, expect.stringContaining('already held'));
	});
});
