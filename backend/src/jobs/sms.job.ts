// BullMQ job: Send SMS via Notify.lk
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { SmsJobData } from '@/types/job.types';

interface NotifyConfig {
	sendUrl: string;
	userId: string;
	apiKey: string;
	senderId: string;
}

interface NotifyResponse {
	status?: string;
	data?: unknown;
	message?: string;
}

const parseNotifyResponse = (raw: string): NotifyResponse => {
	if (!raw) {
		return {};
	}

	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			status: typeof parsed.status === 'string' ? parsed.status : undefined,
			data: parsed.data,
			message: typeof parsed.message === 'string' ? parsed.message : undefined,
		};
	} catch {
		return {};
	}
};

export const getNotifyConfig = (): NotifyConfig => {
	const { NOTIFY_SEND_URL, NOTIFY_USER_ID, NOTIFY_API_KEY, NOTIFY_SENDER_ID } = env;

	if (!NOTIFY_SEND_URL || !NOTIFY_USER_ID || !NOTIFY_API_KEY || !NOTIFY_SENDER_ID) {
		throw new AppError('NOTIFY_NOT_CONFIGURED', 500, 'Notify.lk is not configured.');
	}

	return {
		sendUrl: NOTIFY_SEND_URL,
		userId: NOTIFY_USER_ID,
		apiKey: NOTIFY_API_KEY,
		senderId: NOTIFY_SENDER_ID,
	};
};

const buildNotifyParams = (config: NotifyConfig, data: SmsJobData): URLSearchParams => {
	const recipient = data.to.trim();
	const message = data.message.trim();
	const senderId = data.senderId?.trim() || config.senderId;

	const params = new URLSearchParams({
		user_id: config.userId,
		api_key: config.apiKey,
		sender_id: senderId,
		to: recipient,
		message,
	});

	if (data.isUnicode) {
		params.set('type', 'unicode');
	}

	return params;
};

/**
 * Update the SmsLog row after a send attempt.
 * Non-blocking — errors are logged but never propagated.
 */
const updateSmsLog = (
	smsLogId: string | undefined,
	status: 'SENT' | 'FAILED',
	errorDetail?: string,
): void => {
	if (!smsLogId) return;

	prisma.smsLog
		.update({
			where: { id: smsLogId },
			data: { status, errorDetail: errorDetail ?? null },
		})
		.catch((err: unknown) => {
			logger.error({ err, smsLogId }, 'Failed to update SmsLog — non-blocking');
		});
};

export const processSmsJob = async (data: SmsJobData): Promise<void> => {
	if (!data.to?.trim()) {
		throw new AppError('SMS_TO_REQUIRED', 400, 'SMS recipient is required.');
	}

	if (!data.message?.trim()) {
		throw new AppError('SMS_MESSAGE_REQUIRED', 400, 'SMS message is required.');
	}

	const config = getNotifyConfig();
	const params = buildNotifyParams(config, data);

	try {
		const response = await fetch(config.sendUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params,
		});

		const raw = await response.text();
		const payload = parseNotifyResponse(raw);

		if (!response.ok || payload.status !== 'success') {
			const errorMsg = payload.message ?? raw ?? 'Notify.lk SMS send failed.';
			updateSmsLog(data.smsLogId, 'FAILED', errorMsg);
			throw new Error(errorMsg);
		}

		updateSmsLog(data.smsLogId, 'SENT');
		logger.info({ to: data.to }, 'SMS sent');
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Unknown SMS error';
		updateSmsLog(data.smsLogId, 'FAILED', errorMsg);
		throw err;
	}
};

