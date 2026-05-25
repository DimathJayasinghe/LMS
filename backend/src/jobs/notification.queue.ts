import { Queue } from 'bullmq';
import { redis } from '@/config/redis';
import { getResendConfig } from '@/jobs/email.job';
import { getNotifyConfig } from '@/jobs/sms.job';
import type { EmailJobData, SmsJobData } from '@/types/job.types';
import {
	JOB_DEFAULT_ATTEMPTS,
	JOB_DEFAULT_BACKOFF_MS,
	JOB_NAME_SEND_EMAIL,
	JOB_NAME_SEND_SMS,
	JOB_QUEUE_EMAIL,
	JOB_QUEUE_SMS,
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
const emailQueueConnection = redis.duplicate();

export const smsQueue = new Queue<SmsJobData>(JOB_QUEUE_SMS, {
	connection: smsQueueConnection,
	defaultJobOptions,
});

export const emailQueue = new Queue<EmailJobData>(JOB_QUEUE_EMAIL, {
	connection: emailQueueConnection,
	defaultJobOptions,
});

export const enqueueSmsJob = async (data: SmsJobData): Promise<void> => {
	getNotifyConfig();
	await smsQueue.add(JOB_NAME_SEND_SMS, data);
};

export const enqueueEmailJob = async (data: EmailJobData): Promise<void> => {
	getResendConfig();
	await emailQueue.add(JOB_NAME_SEND_EMAIL, data);
};
