import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as UserService from '@/services/user.service';
import * as PasswordResetService from '@/services/password-reset.service';
import * as StaffAccountService from '@/services/staff-account.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
	listUsersQuerySchema,
	academicStaffQuerySchema,
	userIdParamSchema,
	nicUploadUrlSchema,
	nicConfirmSchema,
	createStudentBarcodeSchema,
	studentBarcodeIdParamSchema,
	resolveBarcodeQuerySchema,
	type AssignBarcodeInput,
	type CreateStaffInput,
	type ResetPasswordInput,
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

export const listAcademicStaff = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = academicStaffQuerySchema.parse(req.query);
	const staff = await UserService.listAcademicStaff(query, req.user!.role);

	res.status(200).json({ status: 'success', data: staff, count: staff.length });
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
	const user = await UserService.updateRole(id, input, req.user!);

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
	const user = await UserService.updateStatus(id, input, req.user!);

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
	const user = await UserService.assignBarcode(id, input, req.user!.role);

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

// ─── Account Setup (NIC upload + institute barcodes) ─────────

export const getNicUploadUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = nicUploadUrlSchema.parse(req.body);
	const upload = await UserService.generateNicUploadUrl(req.user!.userId, input);

	void AuditService.log({
		action: AUDIT_ACTION.NIC_UPLOAD_URL,
		description: `NIC ${input.side.toLowerCase()} photo upload URL issued`,
		targetType: 'User',
		targetId: req.user!.userId,
		context: extractAuditContext(req),
	});

	res.status(200).json({
		status: 'success',
		data: upload,
	});
});

export const confirmNicUpload = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = nicConfirmSchema.parse(req.body);
	const result = await UserService.confirmNicUpload(req.user!.userId, input);

	res.status(200).json({
		status: 'success',
		data: result,
	});
});

export const listMyInstituteBarcodes = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const barcodes = await UserService.listMyInstituteBarcodes(req.user!.userId);

	res.status(200).json({
		status: 'success',
		data: barcodes,
		count: barcodes.length,
	});
});

export const createMyInstituteBarcode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = createStudentBarcodeSchema.parse(req.body);
	const barcode = await UserService.createMyInstituteBarcode(req.user!.userId, input);

	void AuditService.log({
		action: AUDIT_ACTION.STUDENT_BARCODE_ASSIGNED,
		description: `Institute barcode registered for institute ${input.instituteId}`,
		targetType: 'User',
		targetId: req.user!.userId,
		context: extractAuditContext(req),
	});

	res.status(201).json({
		status: 'success',
		data: barcode,
		message: 'Institute barcode registered.',
	});
});

export const deleteMyInstituteBarcode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { barcodeId } = studentBarcodeIdParamSchema.parse(req.params);
	await UserService.deleteMyInstituteBarcode(req.user!.userId, barcodeId);

	void AuditService.log({
		action: AUDIT_ACTION.STUDENT_BARCODE_REMOVED,
		targetType: 'User',
		targetId: req.user!.userId,
		context: extractAuditContext(req),
	});

	res.status(200).json({
		status: 'success',
		data: null,
		message: 'Institute barcode removed.',
	});
});

export const resolveBarcode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { code } = resolveBarcodeQuerySchema.parse(req.query);
	const data = await UserService.resolveStudentByBarcode(code);

	res.status(200).json({
		status: 'success',
		data,
	});
});

export const resetPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = userIdParamSchema.parse(req.params);
	const { ip, userAgent } = extractAuditContext(req);
	const { temporaryPassword } = await PasswordResetService.resetPassword(id, req.body as ResetPasswordInput, req.user!, { ip, userAgent });

	// The password is in this response only: no-store, and the idempotency record keeps a placeholder instead of this body.
	res.set('Cache-Control', 'no-store');
	res.status(200).json({
		status: 'success',
		data: { temporaryPassword, mustChangePassword: true },
		message: 'Password reset. Give the temporary password to the account holder; it is not shown again.',
	});
});

export const createStaff = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { user, temporaryPassword } = await StaffAccountService.createStaff(req.body as CreateStaffInput, req.user!, extractAuditContext(req));

	// The password is in this response only: no-store, and the idempotency record keeps a placeholder instead of this body.
	res.set('Cache-Control', 'no-store');
	res.status(201).json({
		status: 'success',
		data: { user, temporaryPassword, mustChangePassword: true },
		message: 'Staff account created. Give the temporary password to the new user; it is not shown again.',
	});
});
