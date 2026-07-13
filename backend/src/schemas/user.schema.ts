import { Role } from '@prisma/client';
import { z } from 'zod';
import { NIC_IMAGE_CONTENT_TYPES, NIC_IMAGE_MAX_SIZE_BYTES } from '@/utils/constants';

// ─── List Users ─────────────────────────────────────────────
export const listUsersQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	role: z.nativeEnum(Role).optional(),
	status: z.enum(['active', 'inactive', 'all']).default('active'),
	search: z.string().trim().min(1).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// ─── Params ────────────────────────────────────────────────
export const userIdParamSchema = z.object({
	id: z.string().uuid(),
});

// ─── Mutations ─────────────────────────────────────────────
export const updateRoleSchema = z.object({
	role: z.nativeEnum(Role),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const updateStatusSchema = z.object({
	isActive: z.boolean(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const assignBarcodeSchema = z.object({
	barcode: z.string().trim().min(3).max(50),
});

export type AssignBarcodeInput = z.infer<typeof assignBarcodeSchema>;

// ─── Account Setup (NIC upload + institute barcodes) ────────
export const nicUploadUrlSchema = z.object({
	side: z.enum(['FRONT', 'BACK']),
	fileName: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.regex(/^[A-Za-z0-9._-]+\.(jpg|jpeg|png)$/i, 'File name must be a .jpg/.jpeg/.png without spaces.'),
	contentType: z.enum(NIC_IMAGE_CONTENT_TYPES),
	fileSizeBytes: z.coerce.number().int().positive().max(NIC_IMAGE_MAX_SIZE_BYTES),
});

export type NicUploadUrlInput = z.infer<typeof nicUploadUrlSchema>;

// Confirms a NIC photo actually landed in R2 (the client calls this after the
// browser PUT). `key` is the value handed back by the presign endpoint.
export const nicConfirmSchema = z.object({
	side: z.enum(['FRONT', 'BACK']),
	key: z.string().trim().min(1).max(300),
});

export type NicConfirmInput = z.infer<typeof nicConfirmSchema>;

export const createStudentBarcodeSchema = z.object({
	instituteId: z.string().uuid(),
	barcode: z.string().trim().min(1).max(50),
});

export type CreateStudentBarcodeInput = z.infer<typeof createStudentBarcodeSchema>;

export const studentBarcodeIdParamSchema = z.object({
	barcodeId: z.string().uuid(),
});
