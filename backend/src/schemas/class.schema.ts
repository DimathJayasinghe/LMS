import { z } from 'zod';
import { COURSE_ASSET_CONTENT_TYPES, COURSE_ASSET_MAX_SIZE_BYTES } from '@/utils/constants';

// ─── Classes (Courses) ──────────────────────────────────────
export const createClassSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  year: z.coerce.number().int().positive(),
  description: z.string().max(500).trim().optional(),
  monthlyFee: z.coerce.number().positive(),
  isActive: z.boolean().optional(),
  // Academic hierarchy — a course belongs to one subject and one teacher.
  subjectId: z.string().uuid(),
  // Optional: a TEACHER omits this (they own the course); a SUPER_ADMIN sets it.
  teacherId: z.string().uuid().optional(),
}).strict();

export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = createClassSchema.partial();

export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const classIdParamSchema = z.object({
  classId: z.string().uuid(),
});

export const courseAssetKindSchema = z.enum(['BANNER', 'BACKDROP']);
export type CourseAssetKind = z.infer<typeof courseAssetKindSchema>;

export const courseAssetUploadUrlSchema = z.object({
  kind: courseAssetKindSchema,
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(COURSE_ASSET_CONTENT_TYPES),
  fileSizeBytes: z.coerce.number().int().positive().max(COURSE_ASSET_MAX_SIZE_BYTES),
}).strict();
export type CourseAssetUploadUrlInput = z.infer<typeof courseAssetUploadUrlSchema>;

export const courseAssetConfirmSchema = z.object({
  kind: courseAssetKindSchema,
  key: z.string().min(1).max(500),
  altText: z.string().trim().min(1).max(200).optional(),
}).strict();
export type CourseAssetConfirmInput = z.infer<typeof courseAssetConfirmSchema>;

export const courseAssetAltSchema = z.object({
  altText: z.string().trim().min(1).max(200),
}).strict();
export type CourseAssetAltInput = z.infer<typeof courseAssetAltSchema>;

export const courseAssetParamsSchema = classIdParamSchema.extend({
  kind: z.enum(['banner', 'backdrop']),
});

export const listClassesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().positive().optional(),
});

export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;

// ─── Public listing (marketing page, unauthenticated) ───────
export const listPublicClassesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().positive().optional(),
});

export type ListPublicClassesQuery = z.infer<typeof listPublicClassesQuerySchema>;
