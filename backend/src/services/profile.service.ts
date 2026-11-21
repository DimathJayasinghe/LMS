import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import {
	createR2PresignedPutUrl,
	r2HeadObject,
	getPublicAvatarConfig,
	deleteR2Object,
} from '@/utils/r2';
import { issueTokenPair, revokeAllRefreshTokens } from '@/services/auth.service';
import { BCRYPT_SALT_ROUNDS, CREDENTIAL_CHANGE_COOLDOWN_MS } from '@/utils/constants';
import type {
	UpdateProfileInput,
	AvatarUploadUrlInput,
	AvatarConfirmInput,
	ChangeEmailInput,
	ChangePasswordInput,
} from '@/schemas/profile.schema';

const AVATAR_PRESIGN_TTL = 15 * 60; // 15 min

// Public-safe self shape — mirrors the fields the profile page needs.
const selfSelect = {
	id: true,
	indexNumber: true,
	email: true,
	name: true,
	role: true,
	phone: true,
	nic: true,
	address: true,
	city: true,
	barcode: true,
	profileImage: true,
	emailChangedAt: true,
	passwordChangedAt: true,
	setupCompleted: true,
	createdAt: true,
} as const;

export const updateProfile = async (userId: string, input: UpdateProfileInput) => {
	// Only contact fields. `.strict()` on the schema rejects extras, but we also
	// build `data` explicitly so nothing else can ever reach Prisma.
	const data: { phone?: string | null; address?: string | null; city?: string | null } = {};
	if (input.phone !== undefined) data.phone = input.phone;
	if (input.address !== undefined) data.address = input.address;
	if (input.city !== undefined) data.city = input.city;

	return prisma.user.update({ where: { id: userId }, data, select: selfSelect });
};

export const generateAvatarUploadUrl = async (userId: string, input: AvatarUploadUrlInput) => {
	const { bucket } = getPublicAvatarConfig();
	const ext = input.fileName.split('.').pop()!.toLowerCase();
	const key = `avatars/${userId}/${randomUUID()}.${ext}`;
	const uploadUrl = await createR2PresignedPutUrl(key, input.contentType, AVATAR_PRESIGN_TTL, bucket);

	return {
		uploadUrl,
		key,
		expiresAt: new Date(Date.now() + AVATAR_PRESIGN_TTL * 1000).toISOString(),
	};
};

export const confirmAvatar = async (userId: string, input: AvatarConfirmInput) => {
	const prefix = `avatars/${userId}/`;
	if (!input.key.startsWith(prefix)) {
		throw new AppError('FORBIDDEN_KEY', 403, 'This upload key does not belong to you.');
	}

	const { bucket, publicBaseUrl } = getPublicAvatarConfig();
	const head = await r2HeadObject(input.key, bucket);
	if (!head.exists) {
		throw new AppError('UPLOAD_NOT_FOUND', 409, 'The uploaded image was not found. Please re-upload.');
	}

	const profileImage = `${publicBaseUrl}/${input.key}`;
	await prisma.user.update({ where: { id: userId }, data: { profileImage } });
	return { profileImage };
};

export const removeAvatar = async (userId: string): Promise<void> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { profileImage: true },
	});
	await prisma.user.update({ where: { id: userId }, data: { profileImage: null } });

	// Best-effort object delete — never fail the request if the object is already gone.
	if (user?.profileImage) {
		try {
			const { bucket, publicBaseUrl } = getPublicAvatarConfig();
			const key = user.profileImage.replace(`${publicBaseUrl}/`, '');
			if (key && key !== user.profileImage) await deleteR2Object(key, bucket);
		} catch {
			/* ignore — the DB row is already cleared */
		}
	}
};

const assertCooldown = (last: Date | null, code: string): void => {
	if (!last) return;
	const nextAllowed = last.getTime() + CREDENTIAL_CHANGE_COOLDOWN_MS;
	if (Date.now() < nextAllowed) {
		const when = new Date(nextAllowed).toLocaleDateString();
		throw new AppError(code, 429, `You changed this too recently. You can change it again on ${when}.`);
	}
};

export const changeEmail = async (userId: string, input: ChangeEmailInput) => {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User not found.');

	const ok = await bcrypt.compare(input.currentPassword, user.password);
	if (!ok) throw new AppError('INVALID_CREDENTIALS', 401, 'Current password is incorrect.');

	assertCooldown(user.emailChangedAt, 'EMAIL_CHANGE_TOO_SOON');

	if (input.newEmail === user.email.toLowerCase()) {
		throw new AppError('SAME_EMAIL', 400, 'That is already your email address.');
	}

	const existing = await prisma.user.findUnique({ where: { email: input.newEmail } });
	if (existing) {
		throw new AppError('EMAIL_ALREADY_EXISTS', 409, 'An account with this email already exists.');
	}

	return prisma.user.update({
		where: { id: userId },
		data: { email: input.newEmail, emailChangedAt: new Date() },
		select: selfSelect,
	});
};

export const changePassword = async (userId: string, input: ChangePasswordInput) => {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User not found.');

	const ok = await bcrypt.compare(input.currentPassword, user.password);
	if (!ok) throw new AppError('INVALID_CREDENTIALS', 401, 'Current password is incorrect.');

	// A change forced by a staff reset is exempt from the weekly cooldown.
	if (!user.mustChangePassword) assertCooldown(user.passwordChangedAt, 'PASSWORD_CHANGE_TOO_SOON');

	const same = await bcrypt.compare(input.newPassword, user.password);
	if (same) {
		throw new AppError('SAME_PASSWORD', 400, 'The new password must differ from the current one.');
	}

	const hashed = await bcrypt.hash(input.newPassword, BCRYPT_SALT_ROUNDS);
	// Bumping the version ends every other session at once; the caller gets a fresh pair at the new version.
	const { tokenVersion } = await prisma.user.update({
		where: { id: userId },
		data: { password: hashed, passwordChangedAt: new Date(), mustChangePassword: false, tokenVersion: { increment: 1 } },
		select: { tokenVersion: true },
	});

	await revokeAllRefreshTokens(userId);
	const tokens = await issueTokenPair(userId, user.role, tokenVersion);
	return { tokens };
};
