import { Router } from 'express';
import * as NotificationController from '@/controllers/notification.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { validateParams, validateQuery } from '@/middleware/validate.middleware';
import { listMyNotificationsQuerySchema, notificationIdParamSchema } from '@/schemas/notification.schema';

export const notificationRoutes = Router();

// GET /api/notifications/me — My notification inbox (paginated)
notificationRoutes.get(
	'/me',
	verifyToken,
	validateQuery(listMyNotificationsQuerySchema),
	NotificationController.listMyNotifications,
);

// PATCH /api/notifications/me/read-all — Mark every unread notification as read
notificationRoutes.patch(
	'/me/read-all',
	verifyToken,
	NotificationController.markAllRead,
);

// PATCH /api/notifications/:notificationId/read — Mark one notification as read
notificationRoutes.patch(
	'/:notificationId/read',
	verifyToken,
	validateParams(notificationIdParamSchema),
	NotificationController.markRead,
);
