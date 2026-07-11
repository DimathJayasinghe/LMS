import { Router } from 'express';
import { Role } from '@prisma/client';
import * as NotificationSettingController from '@/controllers/notification-setting.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams } from '@/middleware/validate.middleware';
import {
	notificationSettingIdParamSchema,
	updateNotificationSettingSchema,
} from '@/schemas/notification.schema';

export const notificationSettingRoutes = Router();

// GET /api/notification-settings — List all (type, channel) toggles
notificationSettingRoutes.get(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	NotificationSettingController.listSettings,
);

// PATCH /api/notification-settings/:id — Toggle one (type, channel) on/off
notificationSettingRoutes.patch(
	'/:id',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateParams(notificationSettingIdParamSchema),
	validateBody(updateNotificationSettingSchema),
	NotificationSettingController.updateSetting,
);
