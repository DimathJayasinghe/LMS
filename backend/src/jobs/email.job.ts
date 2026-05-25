import { Resend } from 'resend';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { AppError } from '@/utils/app-error';
import type { EmailJobData } from '@/types/job.types';

interface ResendConfig {
	apiKey: string;
	fromEmail: string;
	replyToEmail?: string;
}

let resendClient: Resend | null = null;

const getResendClient = (apiKey: string): Resend => {
	if (!resendClient) {
		resendClient = new Resend(apiKey);
	}

	return resendClient;
};

export const getResendConfig = (): ResendConfig => {
	const { RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_REPLY_TO_EMAIL } = env;

	if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
		throw new AppError('RESEND_NOT_CONFIGURED', 500, 'Resend is not configured.');
	}

	return {
		apiKey: RESEND_API_KEY,
		fromEmail: RESEND_FROM_EMAIL,
		replyToEmail: RESEND_REPLY_TO_EMAIL || undefined,
	};
};

export const processEmailJob = async (data: EmailJobData): Promise<void> => {
	if (!data.to || (Array.isArray(data.to) && data.to.length === 0)) {
		throw new AppError('EMAIL_TO_REQUIRED', 400, 'Email recipient is required.');
	}

	if (!data.subject?.trim()) {
		throw new AppError('EMAIL_SUBJECT_REQUIRED', 400, 'Email subject is required.');
	}

	if (!data.html && !data.text) {
		throw new AppError('EMAIL_BODY_REQUIRED', 400, 'Email body is required.');
	}

	const config = getResendConfig();
	const resend = getResendClient(config.apiKey);
	const from = data.from?.trim() || config.fromEmail;
	const replyTo = data.replyTo?.trim() || config.replyToEmail;

	const basePayload = {
		from,
		to: data.to,
		subject: data.subject,
		replyTo,
	};

	let result: { id?: string } | null = null;
	let error: { message: string } | null = null;

	if (data.html) {
		const html = data.html;
		const text = data.text?.trim() ? data.text : undefined;

		({ data: result, error } = await resend.emails.send({
			...basePayload,
			html,
			...(text ? { text } : {}),
		}));
	} else {
		const text = data.text;
		if (!text) {
			throw new AppError('EMAIL_BODY_REQUIRED', 400, 'Email body is required.');
		}

		({ data: result, error } = await resend.emails.send({
			...basePayload,
			text,
		}));
	}

	if (error) {
		throw new Error(error.message);
	}

	logger.info({ emailId: result?.id, to: data.to }, 'Email sent');
};
