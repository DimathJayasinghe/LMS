import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as UserService from '@/services/user.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
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

	// Fetch before state for audit metadata
	const before = await UserService.getUserById(id);
	const user = await UserService.updateRole(id, input);

	void AuditService.log({
		action: AUDIT_ACTION.ROLE_CHANGED,
		description: `Role changed from ${before.role} to ${input.role}`,
		targetType: 'User',
		targetId: id,
		metadata: { before: { role: before.role }, after: { role: input.role } },
		context: extractAuditContext(req),
	});

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

	void AuditService.log({
		action: input.isActive ? AUDIT_ACTION.USER_ACTIVATED : AUDIT_ACTION.USER_DEACTIVATED,
		description: input.isActive ? 'Account activated' : 'Account deactivated',
		targetType: 'User',
		targetId: id,
		context: extractAuditContext(req),
	});

	res.status(200).json({
		status: 'success',
		data: user,
		message: input.isActive ? 'User activated successfully.' : 'User deactivated successfully.',
	});
});

export const assignBarcode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = userIdParamSchema.parse(req.params);
	const input = req.body as AssignBarcodeInput;

	const before = await UserService.getUserById(id);
	const user = await UserService.assignBarcode(id, input);

	void AuditService.log({
		action: AUDIT_ACTION.BARCODE_ASSIGNED,
		description: `Barcode ${before.barcode ? 'changed' : 'assigned'}`,
		targetType: 'User',
		targetId: id,
		metadata: { before: { barcode: before.barcode }, after: { barcode: input.barcode } },
		context: extractAuditContext(req),
	});

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

