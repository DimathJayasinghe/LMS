import { Router } from 'express';
import { Role } from '@prisma/client';
import * as MarkerGroupController from '@/controllers/marker-group.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import { validateBody, validateParams } from '@/middleware/validate.middleware';
import {
	createMarkerGroupSchema,
	markerGroupIdParamSchema,
	replaceMarkerGroupMembersSchema,
	updateMarkerGroupSchema,
} from '@/schemas/marker-group.schema';

export const markerGroupRoutes = Router();

markerGroupRoutes.get(
	'/', verifyToken, requireRole(Role.SUPER_ADMIN, Role.TEACHER), MarkerGroupController.listMarkerGroups,
);
markerGroupRoutes.post(
	'/', verifyToken, requireRole(Role.SUPER_ADMIN, Role.TEACHER), validateBody(createMarkerGroupSchema),
	checkIdempotency, MarkerGroupController.createMarkerGroup,
);
markerGroupRoutes.get(
	'/:id', verifyToken, requireRole(Role.SUPER_ADMIN, Role.TEACHER), validateParams(markerGroupIdParamSchema),
	MarkerGroupController.getMarkerGroup,
);
markerGroupRoutes.patch(
	'/:id', verifyToken, requireRole(Role.SUPER_ADMIN, Role.TEACHER), validateParams(markerGroupIdParamSchema),
	validateBody(updateMarkerGroupSchema), checkIdempotency, MarkerGroupController.updateMarkerGroup,
);
markerGroupRoutes.put(
	'/:id/members', verifyToken, requireRole(Role.SUPER_ADMIN, Role.TEACHER), validateParams(markerGroupIdParamSchema),
	validateBody(replaceMarkerGroupMembersSchema), checkIdempotency, MarkerGroupController.replaceMarkerGroupMembers,
);
markerGroupRoutes.get(
	'/:id/history', verifyToken, requireRole(Role.SUPER_ADMIN, Role.TEACHER), validateParams(markerGroupIdParamSchema),
	MarkerGroupController.listMarkerGroupHistory,
);
