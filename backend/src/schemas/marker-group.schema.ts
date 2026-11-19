import { MarkerGroupScope } from '@prisma/client';
import { z } from 'zod';

const groupTargetSchema = z.object({
	scope: z.nativeEnum(MarkerGroupScope),
	courseId: z.string().uuid().optional(),
	subjectId: z.string().uuid().optional(),
	instituteId: z.string().uuid().optional(),
}).superRefine((value, context) => {
	const expectedTarget = value.scope === MarkerGroupScope.COURSE
		? 'courseId'
		: value.scope === MarkerGroupScope.SUBJECT
			? 'subjectId'
			: 'instituteId';
	const suppliedTargets = ['courseId', 'subjectId', 'instituteId']
		.filter((field) => value[field as keyof typeof value] !== undefined);

	if (suppliedTargets.length !== 1 || suppliedTargets[0] !== expectedTarget) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			message: `A ${value.scope} group requires exactly one ${expectedTarget}.`,
			path: [expectedTarget],
		});
	}
});

export const createMarkerGroupSchema = groupTargetSchema.extend({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(1000).nullable().optional(),
});

export const updateMarkerGroupSchema = z.object({
	name: z.string().trim().min(1).max(120).optional(),
	description: z.string().trim().max(1000).nullable().optional(),
	isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const replaceMarkerGroupMembersSchema = z.object({
	markerIds: z.array(z.string().uuid()).max(50),
	reason: z.string().trim().min(1).max(500),
});

export const markerGroupIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateMarkerGroupInput = z.infer<typeof createMarkerGroupSchema>;
export type UpdateMarkerGroupInput = z.infer<typeof updateMarkerGroupSchema>;
export type ReplaceMarkerGroupMembersInput = z.infer<typeof replaceMarkerGroupMembersSchema>;
