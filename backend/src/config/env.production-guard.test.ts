import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// env.ts calls dotenv.config(); keep a developer's backend/.env out of these tests.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

const requiredEnv = {
	DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
	REDIS_URL: 'redis://localhost:6379',
	JWT_ACCESS_SECRET: 'a'.repeat(32),
	JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const productionEnv = {
	NODE_ENV: 'production',
	R2_ACCESS_KEY_ID: 'access', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET_NAME: 'bucket', R2_ENDPOINT: 'https://r2.example.com',
	BUNNY_API_KEY: 'api', BUNNY_LIBRARY_ID: 'library', BUNNY_CDN_HOSTNAME: 'cdn',
	BUNNY_READ_ONLY_API_KEY: 'read-only', BUNNY_TOKEN_KEY: 'token',
	ZOOM_WEBHOOK_SECRET: 'webhook', ZOOM_ACCOUNT_ID: 'account', ZOOM_CLIENT_ID: 'client', ZOOM_CLIENT_SECRET: 'secret',
	ZOOM_SDK_KEY: 'sdk', ZOOM_SDK_SECRET: 'secret',
	PAYHERE_MERCHANT_ID: 'merchant', PAYHERE_MERCHANT_SECRET: 'secret', PAYHERE_RETURN_URL: 'return',
	PAYHERE_CANCEL_URL: 'cancel', PAYHERE_NOTIFY_URL: 'notify',
	NOTIFY_SEND_URL: 'https://notify.example.com', NOTIFY_USER_ID: 'user', NOTIFY_API_KEY: 'api', NOTIFY_SENDER_ID: 'sender',
};

const loadEnv = async (vars: Record<string, string | undefined>) => {
	vi.resetModules();
	// Do not inherit configuration from the host or a previous test.
	process.env = {};
	for (const [k, v] of Object.entries({ ...requiredEnv, ...vars })) if (v !== undefined) process.env[k] = v;
	return import('./env');
};

const loadProductionEnv = (overrides: Record<string, string | undefined> = {}) => loadEnv({ ...productionEnv, ...overrides });

describe('production Bunny configuration', () => {
	const saved = { ...process.env };

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
			throw new Error(`exit:${code}`);
		}) as never);
	});

	afterEach(() => {
		process.env = { ...saved };
		vi.restoreAllMocks();
	});

	it.each([
		[{ BUNNY_READ_ONLY_API_KEY: undefined }, ['BUNNY_READ_ONLY_API_KEY']],
		[{ BUNNY_TOKEN_KEY: undefined }, ['BUNNY_TOKEN_KEY']],
		[{ BUNNY_READ_ONLY_API_KEY: undefined, BUNNY_TOKEN_KEY: undefined }, ['BUNNY_READ_ONLY_API_KEY', 'BUNNY_TOKEN_KEY']],
		[{ BUNNY_READ_ONLY_API_KEY: '', BUNNY_TOKEN_KEY: '' }, ['BUNNY_READ_ONLY_API_KEY', 'BUNNY_TOKEN_KEY']],
	])('rejects missing Bunny keys: %s', async (overrides, missing) => {
		await expect(loadProductionEnv(overrides)).rejects.toThrow('exit:1');
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Missing required production environment variables'), missing);
	});

	it('boots with both keys and no legacy secret', async () => {
		const { env } = await loadProductionEnv();
		expect(env.BUNNY_WEBHOOK_SECRET).toBe('');
	});

	it('still accepts a legacy secret', async () => {
		const { env } = await loadProductionEnv({ BUNNY_WEBHOOK_SECRET: 'legacy' });
		expect(env.BUNNY_WEBHOOK_SECRET).toBe('legacy');
	});

	it('checks local drivers before the presign endpoint and missing keys', async () => {
		await expect(loadProductionEnv({ STORAGE_DRIVER: 'local', R2_PRESIGN_ENDPOINT: 'http://localhost:9000', BUNNY_TOKEN_KEY: '' })).rejects.toThrow('exit:1');
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Local/mock provider drivers are not allowed in production'), ['STORAGE_DRIVER=local']);
	});

	it('checks the presign endpoint before missing keys', async () => {
		await expect(loadProductionEnv({ R2_PRESIGN_ENDPOINT: 'http://localhost:9000', BUNNY_TOKEN_KEY: '' })).rejects.toThrow('exit:1');
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining('R2_PRESIGN_ENDPOINT is for the local storage driver'));
	});

	it.each(['development', 'test'])('does not require the keys in %s', async (nodeEnv) => {
		const { env } = await loadEnv({ NODE_ENV: nodeEnv });
		expect(env.BUNNY_READ_ONLY_API_KEY).toBe('');
		expect(env.BUNNY_TOKEN_KEY).toBe('');
	});
});

describe('env provider-driver guard', () => {
	const saved = { ...process.env };

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
			throw new Error(`exit:${code}`);
		}) as never);
	});

	afterEach(() => {
		process.env = { ...saved };
		vi.restoreAllMocks();
	});

	it('defaults every driver to the real provider', async () => {
		const { env } = await loadEnv({ NODE_ENV: 'development' });

		expect(env.STORAGE_DRIVER).toBe('r2');
		expect(env.SMS_DRIVER).toBe('notify');
	});

	it('accepts local drivers outside production', async () => {
		const { env } = await loadEnv({ NODE_ENV: 'development', STORAGE_DRIVER: 'local', SMS_DRIVER: 'log' });

		expect(env.STORAGE_DRIVER).toBe('local');
		expect(env.SMS_DRIVER).toBe('log');
	});

	it('refuses a local driver in production before any other check', async () => {
		await expect(loadEnv({ NODE_ENV: 'production', STORAGE_DRIVER: 'local' })).rejects.toThrow('exit:1');
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining('Local/mock provider drivers are not allowed in production'),
			['STORAGE_DRIVER=local'],
		);
	});

	it('refuses R2_PRESIGN_ENDPOINT in production', async () => {
		await expect(
			loadEnv({ NODE_ENV: 'production', R2_PRESIGN_ENDPOINT: 'http://localhost:9000' }),
		).rejects.toThrow('exit:1');
	});

	it('rejects an unknown driver value', async () => {
		await expect(loadEnv({ NODE_ENV: 'development', SMS_DRIVER: 'twilio' })).rejects.toThrow('exit:1');
	});
});

describe('env REFRESH_REUSE_GRACE_SECONDS', () => {
	const saved = { ...process.env };

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
			throw new Error(`exit:${code}`);
		}) as never);
	});

	afterEach(() => {
		process.env = { ...saved };
		vi.restoreAllMocks();
	});

	it('defaults to 10 seconds', async () => {
		const { env } = await loadEnv({ NODE_ENV: 'development' });
		expect(env.REFRESH_REUSE_GRACE_SECONDS).toBe(10);
	});

	it('treats an empty value as unset (default), not as 0', async () => {
		const { env } = await loadEnv({ NODE_ENV: 'development', REFRESH_REUSE_GRACE_SECONDS: '' });
		expect(env.REFRESH_REUSE_GRACE_SECONDS).toBe(10);
	});

	it.each([['0', 0], ['60', 60]])('accepts the boundary value %s', async (raw, expected) => {
		const { env } = await loadEnv({ NODE_ENV: 'development', REFRESH_REUSE_GRACE_SECONDS: raw });
		expect(env.REFRESH_REUSE_GRACE_SECONDS).toBe(expected);
	});

	it.each(['-1', '61', 'abc', '1.5'])('rejects %s', async (raw) => {
		await expect(loadEnv({ NODE_ENV: 'development', REFRESH_REUSE_GRACE_SECONDS: raw })).rejects.toThrow('exit:1');
	});
});
