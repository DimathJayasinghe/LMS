import { ClassType } from '@prisma/client';
import { z } from 'zod';

// Query booleans arrive as the strings "true"/"false"; z.coerce.boolean() would
// treat any non-empty string as true, so parse them explicitly.
const booleanQuery = z
	.enum(['true', 'false'])
	.transform((value) => value === 'true');

// ─── Create ───────────────────────────────────────────────
export const createEnrollmentSchema = z.object({
	courseId: z.string().uuid(),
	classType: z.nativeEnum(ClassType),
	// Only honored when an ADMIN/SUPER_ADMIN enrolls someone at the front desk;
	// a STUDENT always enrolls themselves (the controller ignores this for them).
	userId: z.string().uuid().optional(),
});

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

// ─── Lists ────────────────────────────────────────────────
export const listMyEnrollmentsQuerySchema = z.object({
	courseId: z.string().uuid().optional(),
	classType: z.nativeEnum(ClassType).optional(),
	isActive: booleanQuery.optional(),
});

export type ListMyEnrollmentsQuery = z.infer<typeof listMyEnrollmentsQuerySchema>;

export const listEnrollmentsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	userId: z.string().uuid().optional(),
	courseId: z.string().uuid().optional(),
	classType: z.nativeEnum(ClassType).optional(),
	isActive: booleanQuery.optional(),
});

export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;

// ─── Params ───────────────────────────────────────────────
export const enrollmentIdParamSchema = z.object({
	id: z.string().uuid(),
});
