import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationChannel, NotificationType } from '@prisma/client';

const { findManySettings, createManySettings, findUniqueSetting, updateSetting } = vi.hoisted(() => ({
	findManySettings: vi.fn(),
	createManySettings: vi.fn().mockResolvedValue({ count: 0 }),
	findUniqueSetting: vi.fn(),
	updateSetting: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		notificationSetting: {
			findMany: findManySettings,
			createMany: createManySettings,
			findUnique: findUniqueSetting,
			update: updateSetting,
		},
	},
}));

import { listSettings, updateSetting as updateSettingService, isChannelEnabled } from './notification-setting.service';

const ALL_ROWS = [
	{ type: NotificationType.RESULTS_PUBLISHED, channel: NotificationChannel.IN_APP },
	{ type: NotificationType.RESULTS_PUBLISHED, channel: NotificationChannel.SMS },
	{ type: NotificationType.PAYMENT_CONFIRMED, channel: NotificationChannel.IN_APP },
	{ type: NotificationType.PAYMENT_CONFIRMED, channel: NotificationChannel.SMS },
	{ type: NotificationType.PAYMENT_OVERRIDDEN, channel: NotificationChannel.IN_APP },
	{ type: NotificationType.PAYMENT_OVERRIDDEN, channel: NotificationChannel.SMS },
];

beforeEach(() => {
	findManySettings.mockReset().mockResolvedValue(ALL_ROWS);
	createManySettings.mockClear().mockResolvedValue({ count: 0 });
	findUniqueSetting.mockReset();
	updateSetting.mockReset();
});

describe('listSettings — seeds missing combinations', () => {
	it('creates no rows when every (type, channel) combination already exists', async () => {
		await listSettings();
		expect(createManySettings).not.toHaveBeenCalled();
	});

	it('seeds exactly the missing combinations, defaulting to enabled=true', async () => {
		findManySettings.mockResolvedValueOnce([ALL_ROWS[0]]); // only one row exists
		await listSettings();

		expect(createManySettings).toHaveBeenCalledTimes(1);
		const { data } = createManySettings.mock.calls[0]![0];
		expect(data).toHaveLength(5);
		expect(data.every((row: { enabled: boolean }) => row.enabled === true)).toBe(true);
	});
});

describe('updateSetting', () => {
	it('404s for a missing setting id', async () => {
		findUniqueSetting.mockResolvedValueOnce(null);
		await expect(updateSettingService('missing-id', { enabled: false })).rejects.toMatchObject({
			code: 'NOTIFICATION_SETTING_NOT_FOUND',
			statusCode: 404,
		});
		expect(updateSetting).not.toHaveBeenCalled();
	});

	it('toggles an existing setting', async () => {
		findUniqueSetting.mockResolvedValueOnce({ id: 'setting-1' });
		updateSetting.mockResolvedValueOnce({ id: 'setting-1', enabled: false });

		await updateSettingService('setting-1', { enabled: false });
		expect(updateSetting).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'setting-1' }, data: { enabled: false } }),
		);
	});
});

describe('isChannelEnabled', () => {
	it('returns the stored enabled value', async () => {
		findUniqueSetting.mockResolvedValueOnce({ enabled: false });
		await expect(
			isChannelEnabled(NotificationType.PAYMENT_CONFIRMED, NotificationChannel.SMS),
		).resolves.toBe(false);
	});

	it('fails open (true) if the row is somehow still missing after seeding', async () => {
		findUniqueSetting.mockResolvedValueOnce(null);
		await expect(
			isChannelEnabled(NotificationType.PAYMENT_CONFIRMED, NotificationChannel.SMS),
		).resolves.toBe(true);
	});
});
