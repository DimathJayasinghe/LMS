import { describe, it, expect, vi, beforeEach } from 'vitest';

const { smsLogUpdate, mockEnv } = vi.hoisted(() => ({
	smsLogUpdate: vi.fn(),
	mockEnv: {
		SMS_DRIVER: 'log',
		NOTIFY_SEND_URL: 'https://notify.example/send',
		NOTIFY_USER_ID: 'u',
		NOTIFY_API_KEY: 'k',
		NOTIFY_SENDER_ID: 's',
	},
}));

vi.mock('@/config/env', () => ({ env: mockEnv }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/config/database', () => ({ prisma: { smsLog: { update: smsLogUpdate } } }));

import { processSmsJob } from './sms.job';

describe('processSmsJob', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		smsLogUpdate.mockReset().mockResolvedValue({});
	});

	it('does not call Notify.lk with the log driver and marks the SmsLog SENT', async () => {
		mockEnv.SMS_DRIVER = 'log';
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		await processSmsJob({ to: '0771234567', message: 'hello', smsLogId: 'log-1' });

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(smsLogUpdate).toHaveBeenCalledWith({
			where: { id: 'log-1' },
			data: { status: 'SENT', errorDetail: null },
		});
	});

	it('still validates the recipient with the log driver', async () => {
		mockEnv.SMS_DRIVER = 'log';

		await expect(processSmsJob({ to: ' ', message: 'hello' })).rejects.toMatchObject({
			code: 'SMS_TO_REQUIRED',
		});
	});

	it('posts to Notify.lk with the notify driver', async () => {
		mockEnv.SMS_DRIVER = 'notify';
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ status: 'success' }), { status: 200 }));

		await processSmsJob({ to: '0771234567', message: 'hello', smsLogId: 'log-2' });

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(smsLogUpdate).toHaveBeenCalledWith({
			where: { id: 'log-2' },
			data: { status: 'SENT', errorDetail: null },
		});
	});
});
