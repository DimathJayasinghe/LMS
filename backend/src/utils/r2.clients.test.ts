import { describe, it, expect, vi, beforeEach } from 'vitest';

const created: { endpoint: string; send: ReturnType<typeof vi.fn> }[] = [];

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
	class FakeS3Client {
		endpoint: string;
		send = vi.fn(async () => ({ ContentLength: 1, ContentType: 'text/plain' }));
		constructor(config: { endpoint: string }) {
			this.endpoint = config.endpoint;
			created.push(this);
		}
	}
	return { ...actual, S3Client: FakeS3Client };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn(async () => 'https://signed.example') }));

vi.mock('@/config/env', () => ({
	env: {
		STORAGE_DRIVER: 'local',
		R2_ACCOUNT_ID: '',
		R2_ACCESS_KEY_ID: 'key',
		R2_SECRET_ACCESS_KEY: 'secret',
		R2_ENDPOINT: 'http://storage:9000',
		R2_PRESIGN_ENDPOINT: 'http://localhost:9000',
		R2_BUCKET_NAME: 'lms-private',
	},
}));

import { r2HeadObject, deleteR2Object, createR2PresignedPutUrl } from './r2';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('r2 client split', () => {
	beforeEach(() => {
		vi.mocked(getSignedUrl).mockClear();
	});

	it('uses the in-network endpoint for server-side calls and the browser endpoint only for signing', async () => {
		await r2HeadObject('k');
		await deleteR2Object('k');
		await createR2PresignedPutUrl('k', 'text/plain', 60);

		const server = created.find((c) => c.endpoint === 'http://storage:9000');
		const presign = created.find((c) => c.endpoint === 'http://localhost:9000');

		expect(server?.send).toHaveBeenCalledTimes(2);
		expect(presign?.send).not.toHaveBeenCalled();
		expect(vi.mocked(getSignedUrl).mock.calls[0]?.[0]).toBe(presign);
	});
});
