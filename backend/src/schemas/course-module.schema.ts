import { CourseModuleStatus } from '@prisma/client';
import { z } from 'zod';
import {
	COURSE_MATERIAL_CONTENT_TYPES,
	COURSE_MATERIAL_MAX_SIZE_BYTES,
} from '@/utils/constants';

const title = z.string().trim().min(2).max(200);
const description = z.string().trim().max(1000).nullable().optional();
const position = z.coerce.number().int().min(0).max(10000);

export const moduleParamsSchema = z.object({
	classId: z.string().uuid(),
	moduleId: z.string().uuid(),
});

export const materialParamsSchema = moduleParamsSchema.extend({
	materialId: z.string().uuid(),
});

export const createCourseModuleSchema = z.object({
	title,
	description,
	position: position.optional(),
	status: z.nativeEnum(CourseModuleStatus).optional(),
	releaseAt: z.coerce.date().nullable().optional(),
}).strict();

export const updateCourseModuleSchema = createCourseModuleSchema.partial().refine(
	(value) => Object.keys(value).length > 0,
	{ message: 'At least one field is required.' },
);

const materialContentType = z.enum(COURSE_MATERIAL_CONTENT_TYPES);

export const courseMaterialUploadUrlSchema = z.object({
	fileName: z.string().trim().min(1).max(255),
	contentType: materialContentType,
	fileSizeBytes: z.coerce.number().int().positive().max(COURSE_MATERIAL_MAX_SIZE_BYTES),
}).strict();

export const confirmCourseMaterialSchema = z.object({
	key: z.string().trim().min(1).max(700),
	title,
	description,
	fileName: z.string().trim().min(1).max(255),
	position: position.optional(),
	downloadable: z.boolean().optional(),
}).strict();

export const updateCourseMaterialSchema = z.object({
	title: title.optional(),
	description,
	position: position.optional(),
	downloadable: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
	message: 'At least one field is required.',
});

export type CreateCourseModuleInput = z.infer<typeof createCourseModuleSchema>;
export type UpdateCourseModuleInput = z.infer<typeof updateCourseModuleSchema>;
export type CourseMaterialUploadUrlInput = z.infer<typeof courseMaterialUploadUrlSchema>;
export type ConfirmCourseMaterialInput = z.infer<typeof confirmCourseMaterialSchema>;
export type UpdateCourseMaterialInput = z.infer<typeof updateCourseMaterialSchema>;
