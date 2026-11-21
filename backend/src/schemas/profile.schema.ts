import { z } from 'zod';
import { AVATAR_IMAGE_CONTENT_TYPES, AVATAR_IMAGE_MAX_SIZE_BYTES } from '@/utils/constants';

// Contact-only self edits. NIC, name, email, role are intentionally NOT accepted
// here — identity fields are admin-managed. `.strict()` rejects any smuggled key.
export const updateProfileSchema = z
	.object({
		phone: z.string().trim().min(3).max(30).nullish(),
		address: z.string().trim().min(1).max(300).nullish(),
		city: z.string().trim().min(1).max(120).nullish(),
	})
	.strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const avatarUploadUrlSchema = z.object({
	fileName: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.regex(
			/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i,
			'File name must be a .jpg/.jpeg/.png/.webp without spaces.',
		),
	contentType: z.enum(AVATAR_IMAGE_CONTENT_TYPES),
	fileSizeBytes: z.coerce.number().int().positive().max(AVATAR_IMAGE_MAX_SIZE_BYTES),
});

export type AvatarUploadUrlInput = z.infer<typeof avatarUploadUrlSchema>;

// Confirms an avatar actually landed in the public bucket (client calls this after
// the browser PUT). `key` is the value handed back by the presign endpoint.
export const avatarConfirmSchema = z.object({
	key: z.string().trim().min(1).max(300),
});

export type AvatarConfirmInput = z.infer<typeof avatarConfirmSchema>;

export const changeEmailSchema = z.object({
	currentPassword: z.string().min(1).max(200),
	newEmail: z.string().trim().toLowerCase().email().max(255),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1).max(200),
	newPassword: z.string().min(8).max(200),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
