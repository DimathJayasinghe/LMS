import { Worker } from 'bullmq';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { initSentry, captureException } from '@/config/sentry';
import { processEmailJob } from '@/jobs/email.job';
import { processSmsJob } from '@/jobs/sms.job';
import type { EmailJobData, SmsJobData } from '@/types/job.types';
import {
	JOB_EMAIL_CONCURRENCY,
	JOB_QUEUE_EMAIL,
	JOB_QUEUE_SMS,
	JOB_SMS_CONCURRENCY,
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

const emailWorker = new Worker<EmailJobData>(
	JOB_QUEUE_EMAIL,
	async (job) => {
		await processEmailJob(job.data);
	},
	{
		connection: redis.duplicate(),
		concurrency: JOB_EMAIL_CONCURRENCY,
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

emailWorker.on('completed', (job) => {
	logger.info({ jobId: job.id, queue: JOB_QUEUE_EMAIL }, 'Email job completed');
});

emailWorker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, queue: JOB_QUEUE_EMAIL, err: err.message }, 'Email job failed');
	captureException(err, {
		tags: { queue: JOB_QUEUE_EMAIL },
		extras: { jobId: job?.id },
	});
});

const bootstrap = async (): Promise<void> => {
	await Promise.all([
		smsWorker.waitUntilReady(),
		emailWorker.waitUntilReady(),
	]);

	logger.info('BullMQ workers ready');
};

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
	logger.info({ signal }, 'Shutting down worker');

	await Promise.all([
		smsWorker.close(),
		emailWorker.close(),
	]);

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
