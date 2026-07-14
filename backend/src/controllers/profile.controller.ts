import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as ProfileService from '@/services/profile.service';
import { setAuthCookies } from '@/utils/auth-cookies';
import type {
	UpdateProfileInput,
	AvatarUploadUrlInput,
	AvatarConfirmInput,
	ChangeEmailInput,
	ChangePasswordInput,
} from '@/schemas/profile.schema';

export const updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await ProfileService.updateProfile(req.user!.userId, req.body as UpdateProfileInput);
	res.status(200).json({ status: 'success', data, message: 'Profile updated.' });
});

export const getAvatarUploadUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await ProfileService.generateAvatarUploadUrl(
		req.user!.userId,
		req.body as AvatarUploadUrlInput,
	);
	res.status(200).json({ status: 'success', data });
});

export const confirmAvatar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await ProfileService.confirmAvatar(req.user!.userId, req.body as AvatarConfirmInput);
	res.status(200).json({ status: 'success', data, message: 'Profile photo updated.' });
});

export const removeAvatar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	await ProfileService.removeAvatar(req.user!.userId);
	res.status(200).json({ status: 'success', data: { profileImage: null }, message: 'Profile photo removed.' });
});

export const changeEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const data = await ProfileService.changeEmail(req.user!.userId, req.body as ChangeEmailInput);
	res.status(200).json({ status: 'success', data, message: 'Email updated.' });
});

export const changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { tokens } = await ProfileService.changePassword(
		req.user!.userId,
		req.body as ChangePasswordInput,
	);
	setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
	res.status(200).json({
		status: 'success',
		data: null,
		message: 'Password updated. Other sessions were signed out.',
	});
});
