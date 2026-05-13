import { Role } from '@prisma/client';
import { z } from 'zod';

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
