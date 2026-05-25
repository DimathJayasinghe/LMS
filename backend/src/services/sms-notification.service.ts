// SMS notification service — template-based SMS orchestration.
// Renders templates from constants.ts, enqueues via BullMQ, and creates SmsLog rows.
// Adding a new event requires only: (1) add template to SMS_TEMPLATES, (2) call sendSms().

import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { enqueueSmsJob } from '@/jobs/notification.queue';
import { SMS_TEMPLATES } from '@/utils/constants';
import type { SmsTemplateKey } from '@/utils/constants';

/**
 * Render a template by replacing `{placeholder}` tokens with values.
 * Example: renderTemplate('RESULTS_PUBLISHED', { examTitle: 'Math Final' })
 */
export const renderTemplate = (
	templateKey: SmsTemplateKey,
	variables: Record<string, string>,
): string => {
	let message: string = SMS_TEMPLATES[templateKey];

	for (const [key, value] of Object.entries(variables)) {
		message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
	}

	return message;
};

interface SendSmsInput {
	phoneNumber: string;
	templateKey: SmsTemplateKey;
	variables: Record<string, string>;
	userId?: string;
}

/**
 * Send a single SMS to a recipient.
 * 1. Renders template
 * 2. Creates SmsLog row with PENDING status
 * 3. Enqueues the BullMQ job (worker updates status on completion)
 *
 * Fire-and-forget — callers should not await this.
 */
export const sendSms = async (input: SendSmsInput): Promise<void> => {
	const { phoneNumber, templateKey, variables, userId } = input;

	if (!phoneNumber?.trim()) {
		logger.warn({ templateKey, userId }, 'SMS skipped — no phone number');
		return;
	}

	const message = renderTemplate(templateKey, variables);

	// Persist the SmsLog row before enqueuing so we track every attempt
	const smsLog = await prisma.smsLog.create({
		data: {
			phoneNumber,
			message,
			status: 'PENDING',
			userId: userId ?? null,
		},
	});

	try {
		await enqueueSmsJob({
			to: phoneNumber,
			message,
			smsLogId: smsLog.id,
		});
	} catch (err) {
		// Mark the log as FAILED if we can't even enqueue
		await prisma.smsLog
			.update({
				where: { id: smsLog.id },
				data: { status: 'FAILED', errorDetail: 'Failed to enqueue SMS job' },
			})
			.catch(() => {
				/* non-blocking */
			});

		logger.error({ err, smsLogId: smsLog.id }, 'Failed to enqueue SMS job');
	}
};

/**
 * Send SMS to multiple recipients for the same event.
 * Each recipient gets their own SmsLog row and BullMQ job.
 */
export const sendBulkSms = async (
	recipients: Array<{ phoneNumber: string; userId?: string }>,
	templateKey: SmsTemplateKey,
	variables: Record<string, string>,
): Promise<void> => {
	for (const recipient of recipients) {
		// Fire-and-forget per recipient — errors logged but don't stop batch
		sendSms({
			phoneNumber: recipient.phoneNumber,
			templateKey,
			variables,
			userId: recipient.userId,
		}).catch((err: unknown) => {
			logger.error(
				{ err, phoneNumber: recipient.phoneNumber, templateKey },
				'Bulk SMS send failed for recipient',
			);
		});
	}
};
