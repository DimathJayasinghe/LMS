import { Worker } from 'bullmq';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
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

smsWorker.on('completed', (job) => {
	logger.info({ jobId: job.id, queue: JOB_QUEUE_SMS }, 'SMS job completed');
});

smsWorker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, queue: JOB_QUEUE_SMS, err: err.message }, 'SMS job failed');
});

emailWorker.on('completed', (job) => {
	logger.info({ jobId: job.id, queue: JOB_QUEUE_EMAIL }, 'Email job completed');
});

emailWorker.on('failed', (job, err) => {
	logger.error({ jobId: job?.id, queue: JOB_QUEUE_EMAIL, err: err.message }, 'Email job failed');
});

const bootstrap = async (): Promise<void> => {
	await Promise.all([
		smsWorker.waitUntilReady(),
		emailWorker.waitUntilReady(),
	]);

	logger.info('BullMQ workers ready');
};

const shutdown = async (signal: string): Promise<void> => {
	logger.info({ signal }, 'Shutting down worker');

	await Promise.all([
		smsWorker.close(),
		emailWorker.close(),
	]);

	process.exit(0);
};

process.on('SIGTERM', () => {
	void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
	void shutdown('SIGINT');
});

bootstrap().catch((err) => {
	logger.error({ err }, 'Failed to start BullMQ workers');
	process.exit(1);
});
