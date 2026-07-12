import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { logger } from '@/config/logger';
import { NOTIFICATION_TEMPLATES } from '@/utils/constants';
import * as NotificationSettingService from '@/services/notification-setting.service';
import * as SmsNotificationService from '@/services/sms-notification.service';
import * as StreamService from '@/services/stream.service';
import type { ListMyNotificationsQuery } from '@/schemas/notification.schema';

interface NotificationSummary {
	id: string;
	type: NotificationType;
	title: string;
	message: string;
	link: string | null;
	isRead: boolean;
	createdAt: Date;
}

const notificationSelect = {
	id: true,
	type: true,
	title: true,
	message: true,
	link: true,
	isRead: true,
	createdAt: true,
} satisfies Prisma.NotificationSelect;

const fillTemplate = (template: string, params: Record<string, string>): string =>
	template.replace(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match);

interface DispatchParams {
	type: NotificationType;
	userId: string;
	link?: string;
	params: Record<string, string>;
}

/**
 * Single entry point for every notification-worthy event (results published,
 * payment confirmed/overridden, ...). Checks the super-admin-configurable
 * NotificationSetting per channel and only acts on channels that are enabled.
 * Never throws — a broken notification must not fail the payment/results
 * action that triggered it; failures are logged instead. Callers use
 * `void NotificationService.dispatch(...)`, matching AuditService.log's
 * fire-and-forget convention.
 */
export const dispatch = async (input: DispatchParams): Promise<void> => {
	const template = NOTIFICATION_TEMPLATES[input.type];

	try {
		const inAppEnabled = await NotificationSettingService.isChannelEnabled(
			input.type,
			NotificationChannel.IN_APP,
		);

		if (inAppEnabled) {
			const notification = await prisma.notification.create({
				data: {
					type: input.type,
					title: template.title,
					message: fillTemplate(template.inApp, input.params),
					link: input.link ?? null,
					userId: input.userId,
				},
				select: { id: true },
			});

			void StreamService.broadcastNotificationCreated({
				notificationId: notification.id,
				userId: input.userId,
				type: input.type,
				title: template.title,
			});
		}
	} catch (err) {
		logger.error(
			{ err, type: input.type, userId: input.userId },
			'Failed to create in-app notification',
		);
	}

	try {
		const smsEnabled = await NotificationSettingService.isChannelEnabled(
			input.type,
			NotificationChannel.SMS,
		);

		if (smsEnabled) {
			const user = await prisma.user.findUnique({
				where: { id: input.userId },
				select: { phone: true },
			});

			if (user?.phone) {
				// sendSms renders the template itself, persists an SmsLog row, and
				// enqueues the BullMQ job — see sms-notification.service.ts.
				await SmsNotificationService.sendSms({
					phoneNumber: user.phone,
					templateKey: input.type,
					variables: input.params,
					userId: input.userId,
				});
			}
		}
	} catch (err) {
		logger.error({ err, type: input.type, userId: input.userId }, 'Failed to send SMS notification');
	}
};

export const listMyNotifications = async (
	userId: string,
	query: ListMyNotificationsQuery,
): Promise<{ records: NotificationSummary[]; total: number; unreadCount: number }> => {
	const where: Prisma.NotificationWhereInput = {
		userId,
		...(query.unreadOnly ? { isRead: false } : {}),
	};

	const [records, total, unreadCount] = await Promise.all([
		prisma.notification.findMany({
			where,
			select: notificationSelect,
			orderBy: { createdAt: 'desc' },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.notification.count({ where }),
		prisma.notification.count({ where: { userId, isRead: false } }),
	]);

	return { records, total, unreadCount };
};

export const markRead = async (userId: string, notificationId: string): Promise<NotificationSummary> => {
	const notification = await prisma.notification.findUnique({ where: { id: notificationId } });

	if (!notification) {
		throw new AppError('NOTIFICATION_NOT_FOUND', 404, 'Notification not found.');
	}

	// Matches the ownership-violation pattern in attendance.service.ts's
	// getStudentAttendance — explicit 403, not a disguised 404.
	if (notification.userId !== userId) {
		throw new AppError('FORBIDDEN', 403, 'You can only mark your own notifications as read.');
	}

	return prisma.notification.update({
		where: { id: notificationId },
		data: { isRead: true },
		select: notificationSelect,
	});
};

export const markAllRead = async (userId: string): Promise<{ updated: number }> => {
	const { count } = await prisma.notification.updateMany({
		where: { userId, isRead: false },
		data: { isRead: true },
	});

	return { updated: count };
};
