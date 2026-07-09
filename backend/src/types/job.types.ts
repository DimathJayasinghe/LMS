export interface SmsJobData {
	to: string;
	message: string;
	senderId?: string;
	isUnicode?: boolean;
	smsLogId?: string;
}
