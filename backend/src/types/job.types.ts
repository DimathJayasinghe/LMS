export interface SmsJobData {
	to: string;
	message: string;
	senderId?: string;
	isUnicode?: boolean;
}

export interface EmailJobData {
	to: string | string[];
	subject: string;
	html?: string;
	text?: string;
	from?: string;
	replyTo?: string;
}
