import { Worker } from 'bullmq';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { initSentry, captureException } from '@/config/sentry';
import { processSmsJob } from '@/jobs/sms.job';
import { scheduleWeeklyTimetableGeneration } from '@/jobs/notification.queue';
import { generateSessions } from '@/services/timetable.service';
import { createSettingsReader } from '@/services/settings.service';
import type { SmsJobData } from '@/types/job.types';
import {
	JOB_QUEUE_SMS,
	JOB_QUEUE_TIMETABLE,
	JOB_SMS_CONCURRENCY,
	DEFAULT_ORGANIZATION_ID,
} from '@/utils/constants';

const smsWorker = new Worker<SmsJobData>(
	JOB_QUEUE_SMS,
	async (job) => {
		await processSmsJob(job.data);
	},
	{
		connection: redis.duplicate(),
		concurrency: JOB_SMS_CONCURRENCY,
	},
);

// Weekly timetable → dated sessions. Generates the next window every run.
const timetableWorker = new Worker(
	JOB_QUEUE_TIMETABLE,
	async () => {
		const from = new Date();
		const days = await createSettingsReader(DEFAULT_ORGANIZATION_ID)('timetable.generateAheadDays');
		const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
		const result = await generateSessions(from, to);
		logger.info(result, 'Timetable sessions generated');
	},
	{
		connection: redis.duplicate(),
		concurrency: 1,
	},
);

initSentry();

smsWorker.on('completed', (job) => {
	logger.info({ jobId: job.id, queue: JOB_QUEUE_SMS }, 'SMS job completed');
});

smsWorker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, queue: JOB_QUEUE_SMS, err: err.message }, 'SMS job failed');
	captureException(err, {
		tags: { queue: JOB_QUEUE_SMS },
		extras: { jobId: job?.id },
	});
});

timetableWorker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, queue: JOB_QUEUE_TIMETABLE, err: err.message }, 'Timetable job failed');
	captureException(err, {
		tags: { queue: JOB_QUEUE_TIMETABLE },
		extras: { jobId: job?.id },
	});
});

const bootstrap = async (): Promise<void> => {
	await Promise.all([smsWorker.waitUntilReady(), timetableWorker.waitUntilReady()]);
	await scheduleWeeklyTimetableGeneration();
	logger.info('BullMQ workers ready');
};

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
	logger.info({ signal }, 'Shutting down worker');
	await Promise.all([smsWorker.close(), timetableWorker.close()]);
	process.exit(exitCode);
};

process.on('SIGTERM', () => {
	void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
	void shutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
	logger.error({ err: reason }, 'Unhandled promise rejection in worker');
	captureException(reason, { tags: { origin: 'unhandledRejection' } });
});

process.on('uncaughtException', (err) => {
	logger.error({ err }, 'Uncaught exception in worker');
	captureException(err, { tags: { origin: 'uncaughtException' } });
	void shutdown('uncaughtException', 1);
});

bootstrap().catch((err) => {
	logger.error({ err }, 'Failed to start BullMQ workers');
	captureException(err, { tags: { origin: 'bootstrap' } });
	process.exit(1);
});
