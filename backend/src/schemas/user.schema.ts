import { Role } from '@prisma/client';
import { z } from 'zod';
import { scanCodeSchema } from './scan-code.schema';
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

/** `GET /users/lookup?q=`: the front desk's slim student search. Two characters is the least that narrows anything. */
export const studentLookupQuerySchema = z.object({
	q: z.string().trim().min(2).max(60),
});

export type StudentLookupQuery = z.infer<typeof studentLookupQuerySchema>;

export const academicStaffQuerySchema = z.object({
	role: z.enum([Role.TEACHER, Role.MARKER]),
});

export type AcademicStaffQuery = z.infer<typeof academicStaffQuerySchema>;

// ─── Params ────────────────────────────────────────────────
export const userIdParamSchema = z.object({
	id: z.string().uuid(),
});

// ─── Mutations ─────────────────────────────────────────────
// Hand-over of a leaving teacher's classes, applied in the same transaction as the change. One new teacher for every
// class, or one per class (an entry wins over the single teacher); the service checks who may receive.
const handoverFields = {
	handover: z
		.array(z.object({ courseId: z.string().uuid(), toTeacherId: z.string().uuid() }))
		.max(200)
		.refine((entries) => new Set(entries.map((entry) => entry.courseId)).size === entries.length, 'Name each class once.')
		.optional(),
	handoverAllTo: z.string().uuid().optional(),
	/** When the new teacher's income share starts; only recorded in the audit row until the income share exists. */
	effectiveMonth: z.enum(['NEXT', 'CURRENT']).optional(),
};

/** The acting owner's confirmation: why, and their own password while the step-up is on. */
const confirmationFields = {
	reason: z.string().trim().min(3).max(300).optional(),
	currentPassword: z.string().min(1).max(72).optional(),
};

// The owner role and the student role are never targets: owners are added by an operator, and a student is never promoted.
export const updateRoleSchema = z.object({
	role: z.enum([Role.ADMIN, Role.TEACHER, Role.MARKER]),
	...confirmationFields,
	...handoverFields,
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const updateStatusSchema = z.object({
	isActive: z.boolean(),
	...confirmationFields,
	...handoverFields,
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

/** `POST /users/:id/handover`: hands the classes of an account that already left to teachers who are working. */
export const handoverOrphanedSchema = z
	.object({ handover: handoverFields.handover, handoverAllTo: handoverFields.handoverAllTo, effectiveMonth: handoverFields.effectiveMonth })
	.refine((body) => body.handoverAllTo !== undefined || (body.handover?.length ?? 0) > 0, 'Choose who takes the classes over.');

export type HandoverOrphanedInput = z.infer<typeof handoverOrphanedSchema>;

export const assignBarcodeSchema = z.object({
	barcode: scanCodeSchema.min(3).max(50),
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
	barcode: scanCodeSchema.min(1).max(50),
});

export type CreateStudentBarcodeInput = z.infer<typeof createStudentBarcodeSchema>;

export const studentBarcodeIdParamSchema = z.object({
	barcodeId: z.string().uuid(),
});

// ─── Barcode Resolution (Admin/Staff) ───────────────────────
export const resolveBarcodeQuerySchema = z.object({
	code: scanCodeSchema.min(1).max(50),
});

export type ResolveBarcodeQuery = z.infer<typeof resolveBarcodeQuerySchema>;

// ─── Staff account creation (owner only) ────────────────────
/** The roles the owner can create here; owners come from the operator command and students register themselves. */
export const STAFF_ROLES = [Role.TEACHER, Role.ADMIN, Role.MARKER] as const;

export const createStaffSchema = z.object({
	name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be under 100 characters').trim(),
	email: z
		.string()
		.email('Invalid email address')
		.max(255, 'Email must be under 255 characters')
		.transform((value) => value.toLowerCase().trim()),
	phone: z
		.string()
		.regex(/^(?:\+94|0)[0-9]{9}$/, 'Invalid Sri Lankan phone number')
		.optional(),
	role: z.enum(STAFF_ROLES),
	/** The owner's own password; required while the step-up is on for this action. */
	currentPassword: z.string().min(1).max(72).optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

// ─── Staff-assisted password reset ──────────────────────────
export const IDENTITY_CHECKS = ['IN_PERSON_CARD', 'GUARDIAN_PHONE', 'OWNER_KNOWS'] as const;

export const resetPasswordSchema = z.object({
	identityCheck: z.enum(IDENTITY_CHECKS),
	/** The acting staff member's own password; required when the target is a staff account. */
	currentPassword: z.string().min(1).max(72).optional(),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
