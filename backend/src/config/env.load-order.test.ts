import { describe, it, expect, vi } from 'vitest';

// Stands in for backend/.env: NODE_ENV and the settings production requires exist only once dotenv has run.
const fileValues = {
	NODE_ENV: 'production',
	DATABASE_URL: 'postgresql://u:p@localhost:5432/db', REDIS_URL: 'redis://localhost:6379',
	JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32),
	R2_ACCESS_KEY_ID: 'access', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET_NAME: 'bucket', R2_ENDPOINT: 'https://r2.example.com',
	BUNNY_API_KEY: 'api', BUNNY_LIBRARY_ID: 'library', BUNNY_CDN_HOSTNAME: 'cdn', BUNNY_READ_ONLY_API_KEY: 'read-only', BUNNY_TOKEN_KEY: 'token',
	ZOOM_WEBHOOK_SECRET: 'webhook', ZOOM_ACCOUNT_ID: 'account', ZOOM_CLIENT_ID: 'client', ZOOM_CLIENT_SECRET: 'secret',
	ZOOM_SDK_KEY: 'sdk', ZOOM_SDK_SECRET: 'secret',
	PAYHERE_MERCHANT_ID: 'merchant', PAYHERE_MERCHANT_SECRET: 'secret', PAYHERE_RETURN_URL: 'return',
	PAYHERE_CANCEL_URL: 'cancel', PAYHERE_NOTIFY_URL: 'notify',
	NOTIFY_SEND_URL: 'https://notify.example.com', NOTIFY_USER_ID: 'user', NOTIFY_API_KEY: 'api', NOTIFY_SENDER_ID: 'sender',
};
vi.mock('dotenv', () => ({ default: { config: () => { Object.assign(process.env, fileValues); } } }));

describe('settings file loading order', () => {
	it('loads the settings file before any module reads the environment at import time', async () => {
		vi.resetModules();
		const saved = process.env;
		process.env = {};
		try {
			await import('./env');
			const { COOKIE_OPTIONS } = await import('@/utils/constants');
			expect(COOKIE_OPTIONS.secure).toBe(true);
		} finally {
			process.env = saved;
		}
	});
});
