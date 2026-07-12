import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as NotificationService from '@/services/notification.service';
import { listMyNotificationsQuerySchema, notificationIdParamSchema } from '@/schemas/notification.schema';

export const listMyNotifications = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listMyNotificationsQuerySchema.parse(req.query);
	const { records, total, unreadCount } = await NotificationService.listMyNotifications(
		req.user!.userId,
		query,
	);

	res.status(200).json({
		status: 'success',
		data: records,
		count: total,
		unreadCount,
		page: query.page,
		limit: query.limit,
	});
});

export const markRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { notificationId } = notificationIdParamSchema.parse(req.params);
	const notification = await NotificationService.markRead(req.user!.userId, notificationId);

	res.status(200).json({
		status: 'success',
		data: notification,
	});
});

export const markAllRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { updated } = await NotificationService.markAllRead(req.user!.userId);

	res.status(200).json({
		status: 'success',
		data: { updated },
		message: 'All notifications marked as read.',
	});
});
