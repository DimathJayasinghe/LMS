import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// env.ts calls dotenv.config(); keep a developer's backend/.env out of these tests.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

const requiredEnv = {
	DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
	REDIS_URL: 'redis://localhost:6379',
	JWT_ACCESS_SECRET: 'a'.repeat(32),
	JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const loadEnv = async (vars: Record<string, string>) => {
	vi.resetModules();
	// Clear anything the host shell or a previous test left behind.
	for (const k of ['NODE_ENV', 'STORAGE_DRIVER', 'SMS_DRIVER', 'R2_PRESIGN_ENDPOINT']) delete process.env[k];
	for (const [k, v] of Object.entries({ ...requiredEnv, ...vars })) process.env[k] = v;
	return import('./env');
};

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
