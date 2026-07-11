import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { UpdateNotificationSettingInput } from '@/schemas/notification.schema';

interface NotificationSettingSummary {
	id: string;
	type: NotificationType;
	channel: NotificationChannel;
	enabled: boolean;
	updatedAt: Date;
}

const settingSelect = {
	id: true,
	type: true,
	channel: true,
	enabled: true,
	updatedAt: true,
} satisfies Prisma.NotificationSettingSelect;

const ALL_TYPES = Object.values(NotificationType);
const ALL_CHANNELS = Object.values(NotificationChannel);

/**
 * Ensures a row exists for every (type, channel) combination, defaulting new
 * ones to enabled=true. Idempotent — safe to call on every list/check. This
 * is what lets a new NotificationType ship without a manual data migration.
 */
const ensureDefaultSettings = async (): Promise<void> => {
	const existing = await prisma.notificationSetting.findMany({
		select: { type: true, channel: true },
	});
	const existingKeys = new Set(existing.map((s) => `${s.type}:${s.channel}`));

	const missing = ALL_TYPES.flatMap((type) =>
		ALL_CHANNELS.filter((channel) => !existingKeys.has(`${type}:${channel}`)).map((channel) => ({
			type,
			channel,
			enabled: true,
		})),
	);

	if (missing.length > 0) {
		await prisma.notificationSetting.createMany({ data: missing, skipDuplicates: true });
	}
};

export const listSettings = async (): Promise<NotificationSettingSummary[]> => {
	await ensureDefaultSettings();

	return prisma.notificationSetting.findMany({
		select: settingSelect,
		orderBy: [{ type: 'asc' }, { channel: 'asc' }],
	});
};

export const updateSetting = async (
	id: string,
	input: UpdateNotificationSettingInput,
): Promise<NotificationSettingSummary> => {
	const existing = await prisma.notificationSetting.findUnique({ where: { id } });
	if (!existing) {
		throw new AppError('NOTIFICATION_SETTING_NOT_FOUND', 404, 'Notification setting not found.');
	}

	return prisma.notificationSetting.update({
		where: { id },
		data: { enabled: input.enabled },
		select: settingSelect,
	});
};

/** Used internally by NotificationService.dispatch() — not exposed as an endpoint. */
export const isChannelEnabled = async (
	type: NotificationType,
	channel: NotificationChannel,
): Promise<boolean> => {
	await ensureDefaultSettings();

	const setting = await prisma.notificationSetting.findUnique({
		where: { type_channel: { type, channel } },
	});

	// Missing after ensureDefaultSettings() would be a bug, not a real "disabled"
	// state — fail open so a settings-table hiccup doesn't silently swallow
	// results/payment notifications.
	return setting?.enabled ?? true;
};
