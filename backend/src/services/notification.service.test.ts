import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationType } from '@prisma/client';

const {
	notificationCreate,
	notificationFindMany,
	notificationCount,
	notificationFindUnique,
	notificationUpdate,
	notificationUpdateMany,
	userFindUnique,
	isChannelEnabled,
	sendSms,
	broadcastNotificationCreated,
} = vi.hoisted(() => ({
	notificationCreate: vi.fn(),
	notificationFindMany: vi.fn().mockResolvedValue([]),
	notificationCount: vi.fn().mockResolvedValue(0),
	notificationFindUnique: vi.fn(),
	notificationUpdate: vi.fn(),
	notificationUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
	userFindUnique: vi.fn(),
	isChannelEnabled: vi.fn(),
	sendSms: vi.fn().mockResolvedValue(undefined),
	broadcastNotificationCreated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		notification: {
			create: notificationCreate,
			findMany: notificationFindMany,
			count: notificationCount,
			findUnique: notificationFindUnique,
			update: notificationUpdate,
			updateMany: notificationUpdateMany,
		},
		user: { findUnique: userFindUnique },
	},
}));

vi.mock('@/config/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

vi.mock('@/services/notification-setting.service', () => ({ isChannelEnabled }));
vi.mock('@/services/sms-notification.service', () => ({ sendSms }));
vi.mock('@/services/stream.service', () => ({ broadcastNotificationCreated }));

import { dispatch, listMyNotifications, markRead, markAllRead } from './notification.service';

beforeEach(() => {
	notificationCreate.mockReset().mockResolvedValue({ id: 'notif-1' });
	notificationFindMany.mockClear().mockResolvedValue([]);
	notificationCount.mockClear().mockResolvedValue(0);
	notificationFindUnique.mockReset();
	notificationUpdate.mockReset();
	notificationUpdateMany.mockClear().mockResolvedValue({ count: 0 });
	userFindUnique.mockReset().mockResolvedValue({ phone: '0771234567' });
	isChannelEnabled.mockReset();
	sendSms.mockClear().mockResolvedValue(undefined);
	broadcastNotificationCreated.mockClear().mockResolvedValue(undefined);
});

describe('dispatch', () => {
	it('creates a notification row and broadcasts SSE when IN_APP is enabled, sends SMS when SMS is enabled', async () => {
		isChannelEnabled.mockResolvedValue(true);

		await dispatch({
			type: NotificationType.RESULTS_PUBLISHED,
			userId: 'user-1',
			link: '/exams/1',
			params: { examTitle: 'Math Final' },
		});

		expect(notificationCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					type: NotificationType.RESULTS_PUBLISHED,
					message: 'Results for Math Final are now available.',
					userId: 'user-1',
				}),
			}),
		);
		expect(broadcastNotificationCreated).toHaveBeenCalledWith(
			expect.objectContaining({ notificationId: 'notif-1', userId: 'user-1' }),
		);
		expect(sendSms).toHaveBeenCalledWith(
			expect.objectContaining({ phoneNumber: '0771234567', templateKey: 'RESULTS_PUBLISHED' }),
		);
	});

	it('skips the in-app row when IN_APP is disabled but still sends SMS when SMS is enabled', async () => {
		isChannelEnabled.mockImplementation(async (_type, channel) => channel === 'SMS');

		await dispatch({ type: NotificationType.PAYMENT_CONFIRMED, userId: 'user-1', params: {} });

		expect(notificationCreate).not.toHaveBeenCalled();
		expect(broadcastNotificationCreated).not.toHaveBeenCalled();
		expect(sendSms).toHaveBeenCalled();
	});

	it('skips SMS when SMS is disabled but still creates the in-app row when IN_APP is enabled', async () => {
		isChannelEnabled.mockImplementation(async (_type, channel) => channel === 'IN_APP');

		await dispatch({ type: NotificationType.PAYMENT_CONFIRMED, userId: 'user-1', params: {} });

		expect(notificationCreate).toHaveBeenCalled();
		expect(sendSms).not.toHaveBeenCalled();
	});

	it('creates the in-app row even when the IN_APP setting is off if the caller forces it, and leaves SMS to its setting', async () => {
		isChannelEnabled.mockResolvedValue(false);

		await dispatch({ type: NotificationType.FEE_DUE, userId: 'user-1', params: { courseName: 'Physics', paymentMonth: '2026-11' }, forceInApp: true });

		expect(notificationCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: NotificationType.FEE_DUE, userId: 'user-1' }) }));
		expect(sendSms).not.toHaveBeenCalled();
	});

	it('does not read the IN_APP setting at all when the in-app row is forced', async () => {
		isChannelEnabled.mockResolvedValue(true);

		await dispatch({ type: NotificationType.FEE_DUE, userId: 'user-1', params: {}, forceInApp: true });

		expect(isChannelEnabled).not.toHaveBeenCalledWith(NotificationType.FEE_DUE, 'IN_APP');
	});

	it('does nothing on either channel when both are disabled, and does not throw', async () => {
		isChannelEnabled.mockResolvedValue(false);

		await expect(
			dispatch({ type: NotificationType.PAYMENT_CONFIRMED, userId: 'user-1', params: {} }),
		).resolves.toBeUndefined();
		expect(notificationCreate).not.toHaveBeenCalled();
		expect(sendSms).not.toHaveBeenCalled();
	});

	it('does not send SMS when the user has no phone number, even if SMS is enabled', async () => {
		isChannelEnabled.mockResolvedValue(true);
		userFindUnique.mockResolvedValueOnce({ phone: null });

		await dispatch({ type: NotificationType.PAYMENT_CONFIRMED, userId: 'user-1', params: {} });
		expect(sendSms).not.toHaveBeenCalled();
	});

	it('a failure creating the in-app row does not prevent SMS from still being attempted', async () => {
		isChannelEnabled.mockResolvedValue(true);
		notificationCreate.mockRejectedValueOnce(new Error('db down'));

		await expect(
			dispatch({ type: NotificationType.PAYMENT_CONFIRMED, userId: 'user-1', params: {} }),
		).resolves.toBeUndefined();
		expect(sendSms).toHaveBeenCalled();
	});

	it('leaves an unknown placeholder untouched instead of throwing', async () => {
		isChannelEnabled.mockImplementation(async (_type, channel) => channel === 'IN_APP');

		await dispatch({
			type: NotificationType.RESULTS_PUBLISHED,
			userId: 'user-1',
			params: {}, // examTitle deliberately omitted
		});

		expect(notificationCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ message: 'Results for {examTitle} are now available.' }),
			}),
		);
	});
});

describe('listMyNotifications / markRead / markAllRead', () => {
	it('scopes the query to the requesting user and applies unreadOnly', async () => {
		await listMyNotifications('user-1', { page: 1, limit: 20, unreadOnly: true });
		expect(notificationFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { userId: 'user-1', isRead: false } }),
		);
	});

	it('markRead 404s for a missing notification', async () => {
		notificationFindUnique.mockResolvedValueOnce(null);
		await expect(markRead('user-1', 'notif-1')).rejects.toMatchObject({
			code: 'NOTIFICATION_NOT_FOUND',
			statusCode: 404,
		});
	});

	it('markRead 403s when the notification belongs to someone else', async () => {
		notificationFindUnique.mockResolvedValueOnce({ id: 'notif-1', userId: 'someone-else' });
		await expect(markRead('user-1', 'notif-1')).rejects.toMatchObject({
			code: 'FORBIDDEN',
			statusCode: 403,
		});
		expect(notificationUpdate).not.toHaveBeenCalled();
	});

	it('markRead succeeds for the owning user', async () => {
		notificationFindUnique.mockResolvedValueOnce({ id: 'notif-1', userId: 'user-1' });
		notificationUpdate.mockResolvedValueOnce({ id: 'notif-1', isRead: true });

		await markRead('user-1', 'notif-1');
		expect(notificationUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'notif-1' }, data: { isRead: true } }),
		);
	});

	it('markAllRead scopes updateMany to the user\'s unread notifications', async () => {
		notificationUpdateMany.mockResolvedValueOnce({ count: 3 });
		await expect(markAllRead('user-1')).resolves.toEqual({ updated: 3 });
		expect(notificationUpdateMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { userId: 'user-1', isRead: false } }),
		);
	});
});
