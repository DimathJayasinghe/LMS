import * as dotenv from 'dotenv';
import { QueueEvents } from 'bullmq';
import type { Job } from 'bullmq';
import { emailQueue, smsQueue } from '../jobs/notification.queue';
import type { EmailJobData, SmsJobData } from '../types/job.types';
import {
	JOB_NAME_SEND_EMAIL,
	JOB_NAME_SEND_SMS,
	JOB_QUEUE_EMAIL,
	JOB_QUEUE_SMS,
} from '../utils/constants';
import { redis } from '../config/redis';

dotenv.config();

/**
 * BullMQ Worker — Smoke Test
 * Run: npx tsx src/scripts/test-worker.ts
 * Requires Redis and the worker process (npm run worker) to be running.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

const SMS_TO = process.env.LMS_TEST_SMS_TO ?? '';
const SMS_MESSAGE = process.env.LMS_TEST_SMS_MESSAGE ?? '';
const SMS_UNICODE = process.env.LMS_TEST_SMS_UNICODE === 'true';

const EMAIL_TO = process.env.LMS_TEST_EMAIL_TO ?? '';
const EMAIL_SUBJECT = process.env.LMS_TEST_EMAIL_SUBJECT ?? '';
const EMAIL_TEXT = process.env.LMS_TEST_EMAIL_TEXT ?? '';
const EMAIL_HTML = process.env.LMS_TEST_EMAIL_HTML ?? '';
const EMAIL_FROM = process.env.LMS_TEST_EMAIL_FROM ?? '';
const EMAIL_REPLY_TO = process.env.LMS_TEST_EMAIL_REPLY_TO ?? '';

const resolvedTimeoutMs = Number(process.env.LMS_TEST_JOB_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
const JOB_TIMEOUT_MS = Number.isFinite(resolvedTimeoutMs) ? resolvedTimeoutMs : DEFAULT_TIMEOUT_MS;

let passed = 0;
let failed = 0;

const assert = (label: string, condition: boolean, detail?: unknown): void => {
	if (condition) {
		console.log(`  OK   ${label}`);
		passed += 1;
	} else {
		console.error(`  FAIL ${label}`, detail ?? '');
		failed += 1;
	}
};

const requireTestTargets = (): void => {
	if (!SMS_TO && !EMAIL_TO) {
		console.error('Set LMS_TEST_SMS_TO and/or LMS_TEST_EMAIL_TO to run the worker test.');
		process.exit(1);
	}
};

const waitForCompletion = async <T, R>(
	label: string,
	jobPromise: Promise<Job<T, R>>,
	queueEvents: QueueEvents,
): Promise<void> => {
	const job = await jobPromise;

	try {
		await job.waitUntilFinished(queueEvents, JOB_TIMEOUT_MS);
		assert(`${label} completed`, true);
	} catch (err) {
		assert(`${label} completed`, false, err);
	}
};

const runSmsTest = async (): Promise<void> => {
	if (!SMS_TO) {
		return;
	}

	const message = SMS_MESSAGE || `LMS worker SMS test @ ${new Date().toISOString()}`;
	const payload: SmsJobData = { to: SMS_TO, message, isUnicode: SMS_UNICODE };
	const queueEvents = new QueueEvents(JOB_QUEUE_SMS, { connection: redis.duplicate() });

	try {
		await queueEvents.waitUntilReady();
		await waitForCompletion(
			'SMS job',
			smsQueue.add(JOB_NAME_SEND_SMS, payload),
			queueEvents,
		);
	} finally {
		await queueEvents.close();
	}
};

const runEmailTest = async (): Promise<void> => {
	if (!EMAIL_TO) {
		return;
	}

	const subject = EMAIL_SUBJECT || `LMS worker email test @ ${new Date().toISOString()}`;
	const fallbackText = `LMS worker email test @ ${new Date().toISOString()}`;
	const recipients = EMAIL_TO.includes(',')
		? EMAIL_TO.split(',').map((entry) => entry.trim()).filter(Boolean)
		: EMAIL_TO;
	const payload: EmailJobData = {
		to: recipients,
		subject,
		text: EMAIL_TEXT || (!EMAIL_HTML ? fallbackText : undefined),
		html: EMAIL_HTML || undefined,
		from: EMAIL_FROM || undefined,
		replyTo: EMAIL_REPLY_TO || undefined,
	};

	const queueEvents = new QueueEvents(JOB_QUEUE_EMAIL, { connection: redis.duplicate() });

	try {
		await queueEvents.waitUntilReady();
		await waitForCompletion(
			'Email job',
			emailQueue.add(JOB_NAME_SEND_EMAIL, payload),
			queueEvents,
		);
	} finally {
		await queueEvents.close();
	}
};

const main = async (): Promise<void> => {
	requireTestTargets();

	console.log('\nBullMQ Worker — Smoke Test\n');

	await Promise.all([runSmsTest(), runEmailTest()]);

	await Promise.allSettled([smsQueue.close(), emailQueue.close()]);

	console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
	process.exit(failed > 0 ? 1 : 0);
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
