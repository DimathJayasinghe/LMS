import { describe, expect, it } from 'vitest';
import { courseAssetUploadUrlSchema, createClassSchema, updateClassSchema } from './class.schema';

const validClass = {
	name: 'Physics Theory',
	year: 2026,
	monthlyFee: 2500,
	subjectId: '11111111-1111-4111-8111-111111111111',
};

describe('class artwork input boundaries', () => {
	it('rejects arbitrary artwork URLs during class creation and update', () => {
		expect(createClassSchema.safeParse({ ...validClass, bannerUrl: 'https://tracker.example/pixel.png' }).success)
			.toBe(false);
		expect(updateClassSchema.safeParse({ backdropUrl: 'https://tracker.example/pixel.png' }).success)
			.toBe(false);
	});

	it('rejects unsupported formats and browser-reported files over 8 MB', () => {
		const base = { kind: 'BANNER', fileName: 'banner.png', fileSizeBytes: 1024 };
		expect(courseAssetUploadUrlSchema.safeParse({ ...base, contentType: 'image/svg+xml' }).success)
			.toBe(false);
		expect(courseAssetUploadUrlSchema.safeParse({
			...base,
			contentType: 'image/png',
			fileSizeBytes: (8 * 1024 * 1024) + 1,
		}).success).toBe(false);
	});
});
