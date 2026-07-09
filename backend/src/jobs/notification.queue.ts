import { Queue } from 'bullmq';
import { redis } from '@/config/redis';
import { getNotifyConfig } from '@/jobs/sms.job';
import type { SmsJobData } from '@/types/job.types';
import {
	JOB_CRON_WEEKLY_TIMETABLE,
	JOB_DEFAULT_ATTEMPTS,
	JOB_DEFAULT_BACKOFF_MS,
	JOB_NAME_GENERATE_SESSIONS,
	JOB_NAME_SEND_SMS,
	JOB_QUEUE_SMS,
	JOB_QUEUE_TIMETABLE,
	JOB_REMOVE_ON_COMPLETE,
	JOB_REMOVE_ON_FAIL,
} from '@/utils/constants';

const defaultJobOptions = {
	attempts: JOB_DEFAULT_ATTEMPTS,
	backoff: { type: 'exponential', delay: JOB_DEFAULT_BACKOFF_MS },
	removeOnComplete: JOB_REMOVE_ON_COMPLETE,
	removeOnFail: JOB_REMOVE_ON_FAIL,
};

const smsQueueConnection = redis.duplicate();

export const smsQueue = new Queue<SmsJobData>(JOB_QUEUE_SMS, {
	connection: smsQueueConnection,
	defaultJobOptions,
});

export const enqueueSmsJob = async (data: SmsJobData): Promise<void> => {
	getNotifyConfig();
	await smsQueue.add(JOB_NAME_SEND_SMS, data);
};

// ─── Timetable generation ──────────────────────────────────
const timetableQueueConnection = redis.duplicate();

export const timetableQueue = new Queue(JOB_QUEUE_TIMETABLE, {
	connection: timetableQueueConnection,
	defaultJobOptions,
});

/**
 * Register the repeatable weekly job that materializes upcoming sessions from
 * the timetable slots. Idempotent — the fixed jobId means re-registering just
 * updates the schedule instead of stacking duplicates. Called from the worker.
 */
export const scheduleWeeklyTimetableGeneration = async (): Promise<void> => {
	await timetableQueue.add(
		JOB_NAME_GENERATE_SESSIONS,
		{},
		{ repeat: { pattern: JOB_CRON_WEEKLY_TIMETABLE }, jobId: 'weekly-timetable' },
	);
};
