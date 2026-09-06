import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as MarkerGroupService from '@/services/marker-group.service';
import {
	createMarkerGroupSchema,
	markerGroupIdParamSchema,
	replaceMarkerGroupMembersSchema,
	updateMarkerGroupSchema,
} from '@/schemas/marker-group.schema';

export const createMarkerGroup = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const group = await MarkerGroupService.createMarkerGroup(createMarkerGroupSchema.parse(req.body), req.user!);
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
	res.status(200).json({ status: 'success', data: group, message: 'Marker group updated.' });
});

export const replaceMarkerGroupMembers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = markerGroupIdParamSchema.parse(req.params);
	const input = replaceMarkerGroupMembersSchema.parse(req.body);
	const markers = await MarkerGroupService.replaceMarkerGroupMembers(id, input, req.user!);
	res.status(200).json({ status: 'success', data: markers, count: markers.length, message: 'Marker group members replaced.' });
});

export const listMarkerGroupHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = markerGroupIdParamSchema.parse(req.params);
	const history = await MarkerGroupService.listMarkerGroupHistory(id, req.user!);
	res.status(200).json({ status: 'success', data: history, count: history.length });
});
