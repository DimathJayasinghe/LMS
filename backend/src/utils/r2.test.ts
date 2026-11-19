import { describe, it, expect, vi, beforeEach } from 'vitest';

const baseEnv = {
	STORAGE_DRIVER: 'r2',
	R2_ACCOUNT_ID: 'acct',
	R2_ACCESS_KEY_ID: 'key',
	R2_SECRET_ACCESS_KEY: 'secret',
	R2_ENDPOINT: '',
	R2_PRESIGN_ENDPOINT: '',
	R2_BUCKET_NAME: 'lms-private',
};

const loadR2 = async (overrides: Record<string, string>) => {
	vi.resetModules();
	vi.doMock('@/config/env', () => ({ env: { ...baseEnv, ...overrides } }));
	return import('./r2');
};

describe('r2 presigning', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('signs against the R2 virtual-host endpoint by default', async () => {
		const { createR2PresignedPutUrl } = await loadR2({});
		const url = new URL(await createR2PresignedPutUrl('org/a/file.pdf', 'application/pdf', 300));

		expect(url.host).toBe('lms-private.acct.r2.cloudflarestorage.com');
		expect(url.pathname).toBe('/org/a/file.pdf');
	});

	it('signs path-style for the browser-visible host with the local driver', async () => {
		const { createR2PresignedPutUrl, createR2PresignedGetUrl } = await loadR2({
			STORAGE_DRIVER: 'local',
			R2_ENDPOINT: 'http://storage:9000',
			R2_PRESIGN_ENDPOINT: 'http://localhost:9000',
		});

		const put = new URL(await createR2PresignedPutUrl('org/a/file.pdf', 'application/pdf', 300));
		expect(put.origin).toBe('http://localhost:9000');
		expect(put.pathname).toBe('/lms-private/org/a/file.pdf');

		const get = new URL(await createR2PresignedGetUrl('org/a/file.pdf', 300));
		expect(get.origin).toBe('http://localhost:9000');
	});

	it('falls back to the in-network endpoint when no presign endpoint is set', async () => {
		const { createR2PresignedPutUrl } = await loadR2({
			STORAGE_DRIVER: 'local',
			R2_ENDPOINT: 'http://localhost:9000',
		});

		const url = new URL(await createR2PresignedPutUrl('k', 'text/plain', 300));
		expect(url.origin).toBe('http://localhost:9000');
		expect(url.pathname).toBe('/lms-private/k');
	});

	it('refuses to presign when credentials are missing', async () => {
		const { createR2PresignedPutUrl } = await loadR2({ R2_ACCESS_KEY_ID: '' });

		await expect(createR2PresignedPutUrl('k', 'text/plain', 300)).rejects.toMatchObject({
			code: 'R2_NOT_CONFIGURED',
		});
	});
});
