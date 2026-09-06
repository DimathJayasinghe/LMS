import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as AuditService from '@/services/audit.service';
import * as MarkerGroupService from '@/services/marker-group.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
	createMarkerGroupSchema,
	markerGroupIdParamSchema,
	replaceMarkerGroupMembersSchema,
	updateMarkerGroupSchema,
} from '@/schemas/marker-group.schema';

export const createMarkerGroup = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const group = await MarkerGroupService.createMarkerGroup(createMarkerGroupSchema.parse(req.body), req.user!);
	await AuditService.logDurable({
		action: AUDIT_ACTION.MARKER_GROUP_CREATED,
		targetType: 'MarkerGroup',
		targetId: group.id,
		context: extractAuditContext(req),
	});
	res.status(201).json({ status: 'success', data: group, message: 'Marker group created.' });
});

export const listMarkerGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const groups = await MarkerGroupService.listMarkerGroups(req.user!);
	res.status(200).json({ status: 'success', data: groups, count: groups.length });
});

export const getMarkerGroup = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = markerGroupIdParamSchema.parse(req.params);
	const group = await MarkerGroupService.getMarkerGroup(id, req.user!);
	res.status(200).json({ status: 'success', data: group });
});

export const updateMarkerGroup = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = markerGroupIdParamSchema.parse(req.params);
	const group = await MarkerGroupService.updateMarkerGroup(id, updateMarkerGroupSchema.parse(req.body), req.user!);
	await AuditService.logDurable({
		action: AUDIT_ACTION.MARKER_GROUP_UPDATED,
		targetType: 'MarkerGroup',
		targetId: id,
		context: extractAuditContext(req),
	});
	res.status(200).json({ status: 'success', data: group, message: 'Marker group updated.' });
});

export const replaceMarkerGroupMembers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = markerGroupIdParamSchema.parse(req.params);
	const input = replaceMarkerGroupMembersSchema.parse(req.body);
	const markers = await MarkerGroupService.replaceMarkerGroupMembers(id, input, req.user!);
	await AuditService.logDurable({
		action: AUDIT_ACTION.MARKER_GROUP_MEMBERS_REPLACED,
		targetType: 'MarkerGroup',
		targetId: id,
		metadata: { markerIds: markers.map((marker) => marker.id), reason: input.reason },
		context: extractAuditContext(req),
	});
	res.status(200).json({ status: 'success', data: markers, count: markers.length, message: 'Marker group members replaced.' });
});

export const listMarkerGroupHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = markerGroupIdParamSchema.parse(req.params);
	const history = await MarkerGroupService.listMarkerGroupHistory(id, req.user!);
	res.status(200).json({ status: 'success', data: history, count: history.length });
});
