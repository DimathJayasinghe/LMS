import { z } from 'zod';

// ─── Notification settings (super-admin config) ─────────────
export const updateNotificationSettingSchema = z.object({
	enabled: z.boolean(),
});

export type UpdateNotificationSettingInput = z.infer<typeof updateNotificationSettingSchema>;

export const notificationSettingIdParamSchema = z.object({
	id: z.string().uuid(),
});

// ─── My notifications ────────────────────────────────────────
export const listMyNotificationsQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(20),
	unreadOnly: z.coerce.boolean().default(false),
});

export type ListMyNotificationsQuery = z.infer<typeof listMyNotificationsQuerySchema>;

export const notificationIdParamSchema = z.object({
	notificationId: z.string().uuid(),
});
