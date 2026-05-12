import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as UserService from '@/services/user.service';
import {
	listUsersQuerySchema,
	userIdParamSchema,
	type AssignBarcodeInput,
	type UpdateRoleInput,
	type UpdateStatusInput,
} from '@/schemas/user.schema';

export const listUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listUsersQuerySchema.parse(req.query);
	const { data, count } = await UserService.listUsers(query);

	res.status(200).json({
		status: 'success',
		data,
		count,
	});
});

export const getUserById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = userIdParamSchema.parse(req.params);
	const user = await UserService.getUserById(id);

	res.status(200).json({
		status: 'success',
		data: user,
	});
});

export const updateRole = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = userIdParamSchema.parse(req.params);
	const input = req.body as UpdateRoleInput;
	const user = await UserService.updateRole(id, input);

	res.status(200).json({
		status: 'success',
		data: user,
		message: 'User role updated successfully.',
	});
});

export const updateStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = userIdParamSchema.parse(req.params);
	const input = req.body as UpdateStatusInput;
	const user = await UserService.updateStatus(id, input);

	res.status(200).json({
		status: 'success',
		data: user,
		message: input.isActive ? 'User activated successfully.' : 'User deactivated successfully.',
	});
});

export const assignBarcode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = userIdParamSchema.parse(req.params);
	const input = req.body as AssignBarcodeInput;
	const user = await UserService.assignBarcode(id, input);

	res.status(200).json({
		status: 'success',
		data: user,
		message: 'Barcode assigned successfully.',
	});
});

export const getMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const user = await UserService.getUserById(req.user!.userId);

	res.status(200).json({
		status: 'success',
		data: user,
	});
});
