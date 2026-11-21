import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	userFindUnique,
	userUpdate,
	r2Head,
	r2Put,
	avatarConfig,
	delObj,
	compare,
	hash,
	revokeAll,
	issuePair,
} = vi.hoisted(() => ({
	userFindUnique: vi.fn(),
	userUpdate: vi.fn(),
	r2Head: vi.fn(),
	r2Put: vi.fn(),
	avatarConfig: vi.fn(),
	delObj: vi.fn(),
	compare: vi.fn(),
	hash: vi.fn(),
	revokeAll: vi.fn(),
	issuePair: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: { user: { findUnique: userFindUnique, update: userUpdate } },
}));

vi.mock('@/utils/r2', () => ({
	createR2PresignedPutUrl: r2Put,
	r2HeadObject: r2Head,
	getPublicAvatarConfig: avatarConfig,
	deleteR2Object: delObj,
}));

vi.mock('bcryptjs', () => ({ default: { compare, hash } }));

vi.mock('@/services/auth.service', () => ({
	revokeAllRefreshTokens: revokeAll,
	issueTokenPair: issuePair,
}));

import { updateProfile, confirmAvatar, changeEmail, changePassword } from './profile.service';

const OLD = new Date('2020-01-01T00:00:00Z');

beforeEach(() => {
	vi.clearAllMocks();
	r2Head.mockResolvedValue({ exists: true });
	avatarConfig.mockReturnValue({ bucket: 'lms-public', publicBaseUrl: 'https://cdn.example' });
	compare.mockResolvedValue(true);
	hash.mockResolvedValue('new-hash');
	issuePair.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
	userUpdate.mockResolvedValue({ id: 'u1' });
});

// ─── updateProfile ──────────────────────────────────────────
describe('updateProfile', () => {
	it('writes only contact fields', async () => {
		userUpdate.mockResolvedValueOnce({ id: 'u1', phone: '123' });
		await updateProfile('u1', { phone: '123', address: 'A', city: 'C' });
		const data = userUpdate.mock.calls[0]![0].data;
		expect(Object.keys(data).sort()).toEqual(['address', 'city', 'phone']);
		expect(data).not.toHaveProperty('role');
		expect(data).not.toHaveProperty('nic');
	});
});

// ─── confirmAvatar ──────────────────────────────────────────
describe('confirmAvatar', () => {
	it('rejects a key not under the caller prefix (before HEAD)', async () => {
		await expect(confirmAvatar('u1', { key: 'avatars/other/x.jpg' })).rejects.toMatchObject({
			code: 'FORBIDDEN_KEY',
			statusCode: 403,
		});
		expect(r2Head).not.toHaveBeenCalled();
	});

	it('409s when the object never landed', async () => {
		r2Head.mockResolvedValueOnce({ exists: false });
		await expect(confirmAvatar('u1', { key: 'avatars/u1/x.jpg' })).rejects.toMatchObject({
			code: 'UPLOAD_NOT_FOUND',
			statusCode: 409,
		});
		expect(userUpdate).not.toHaveBeenCalled();
	});

	it('persists the public URL', async () => {
		const res = await confirmAvatar('u1', { key: 'avatars/u1/x.jpg' });
		expect(res).toEqual({ profileImage: 'https://cdn.example/avatars/u1/x.jpg' });
		expect(userUpdate.mock.calls[0]![0].data.profileImage).toBe('https://cdn.example/avatars/u1/x.jpg');
	});
});

// ─── changeEmail ────────────────────────────────────────────
describe('changeEmail', () => {
	const user = (over = {}) => ({
		id: 'u1',
		email: 'old@x.com',
		password: 'h',
		role: 'STUDENT',
		emailChangedAt: null,
		...over,
	});

	it('401 on wrong current password, before cooldown', async () => {
		userFindUnique.mockResolvedValueOnce(user());
		compare.mockResolvedValueOnce(false);
		await expect(
			changeEmail('u1', { currentPassword: 'bad', newEmail: 'new@x.com' }),
		).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
		expect(userUpdate).not.toHaveBeenCalled();
	});

	it('429 when within the cooldown window', async () => {
		userFindUnique.mockResolvedValueOnce(user({ emailChangedAt: new Date() }));
		await expect(
			changeEmail('u1', { currentPassword: 'ok', newEmail: 'new@x.com' }),
		).rejects.toMatchObject({ code: 'EMAIL_CHANGE_TOO_SOON', statusCode: 429 });
	});

	it('400 SAME_EMAIL without consuming the window', async () => {
		userFindUnique.mockResolvedValueOnce(user({ emailChangedAt: OLD }));
		await expect(
			changeEmail('u1', { currentPassword: 'ok', newEmail: 'old@x.com' }),
		).rejects.toMatchObject({ code: 'SAME_EMAIL', statusCode: 400 });
		expect(userUpdate).not.toHaveBeenCalled();
	});

	it('409 when the new email is taken', async () => {
		userFindUnique.mockResolvedValueOnce(user({ emailChangedAt: OLD }));
		userFindUnique.mockResolvedValueOnce({ id: 'other' }); // uniqueness probe
		await expect(
			changeEmail('u1', { currentPassword: 'ok', newEmail: 'taken@x.com' }),
		).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
		expect(userUpdate).not.toHaveBeenCalled();
	});

	it('updates email + emailChangedAt on success', async () => {
		userFindUnique.mockResolvedValueOnce(user({ emailChangedAt: OLD }));
		userFindUnique.mockResolvedValueOnce(null); // free
		await changeEmail('u1', { currentPassword: 'ok', newEmail: 'new@x.com' });
		const data = userUpdate.mock.calls[0]![0].data;
		expect(data.email).toBe('new@x.com');
		expect(data.emailChangedAt).toBeInstanceOf(Date);
	});
});

// ─── changePassword ─────────────────────────────────────────
describe('changePassword', () => {
	const user = (over = {}) => ({
		id: 'u1',
		password: 'h',
		role: 'STUDENT',
		passwordChangedAt: null,
		mustChangePassword: false,
		...over,
	});

	it('401 on wrong current password', async () => {
		userFindUnique.mockResolvedValueOnce(user());
		compare.mockResolvedValueOnce(false);
		await expect(
			changePassword('u1', { currentPassword: 'bad', newPassword: 'longenough' }),
		).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
	});

	it('429 within cooldown', async () => {
		userFindUnique.mockResolvedValueOnce(user({ passwordChangedAt: new Date() }));
		await expect(
			changePassword('u1', { currentPassword: 'ok', newPassword: 'longenough' }),
		).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_TOO_SOON', statusCode: 429 });
	});

	it('400 SAME_PASSWORD (new equals current) without consuming window', async () => {
		userFindUnique.mockResolvedValueOnce(user({ passwordChangedAt: OLD }));
		compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true); // current ok, new == current
		await expect(
			changePassword('u1', { currentPassword: 'ok', newPassword: 'ok-longenough' }),
		).rejects.toMatchObject({ code: 'SAME_PASSWORD', statusCode: 400 });
		expect(userUpdate).not.toHaveBeenCalled();
	});

	it('hashes, sets passwordChangedAt, bumps the session version, revokes tokens, reissues at the new version', async () => {
		userFindUnique.mockResolvedValueOnce(user({ passwordChangedAt: OLD }));
		compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // current ok, new != current
		userUpdate.mockResolvedValueOnce({ tokenVersion: 5 });
		const res = await changePassword('u1', { currentPassword: 'ok', newPassword: 'brand-new-pass' });
		const data = userUpdate.mock.calls[0]![0].data;
		expect(data.password).toBe('new-hash');
		expect(data.passwordChangedAt).toBeInstanceOf(Date);
		expect(data.tokenVersion).toEqual({ increment: 1 });
		expect(data.mustChangePassword).toBe(false);
		expect(revokeAll).toHaveBeenCalledWith('u1');
		expect(issuePair).toHaveBeenCalledWith('u1', 'STUDENT', 5);
		expect(res).toEqual({ tokens: { accessToken: 'a', refreshToken: 'r' } });
	});

	it('a forced change after a staff reset is not blocked by the cooldown and clears the flag', async () => {
		userFindUnique.mockResolvedValueOnce(user({ passwordChangedAt: new Date(), mustChangePassword: true }));
		compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		userUpdate.mockResolvedValueOnce({ tokenVersion: 2 });
		await expect(changePassword('u1', { currentPassword: 'temp', newPassword: 'brand-new-pass' })).resolves.toBeTruthy();
		expect(userUpdate.mock.calls[0]![0].data.mustChangePassword).toBe(false);
	});

	it('a forced change still needs the temporary password and a different new one', async () => {
		userFindUnique.mockResolvedValue(user({ mustChangePassword: true }));
		compare.mockResolvedValueOnce(false);
		await expect(changePassword('u1', { currentPassword: 'guess', newPassword: 'brand-new-pass' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
		compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
		await expect(changePassword('u1', { currentPassword: 'temp', newPassword: 'temp' })).rejects.toMatchObject({ code: 'SAME_PASSWORD' });
		expect(userUpdate).not.toHaveBeenCalled();
	});
});
