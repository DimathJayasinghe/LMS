import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { readImageMetadata } from './image-metadata';

const image = sharp({
	create: {
		width: 16,
		height: 6,
		channels: 3,
		background: { r: 30, g: 80, b: 160 },
	},
});

describe('readImageMetadata', () => {
	it.each([
		['PNG', 'image/png', () => image.clone().png().toBuffer()],
		['JPEG', 'image/jpeg', () => image.clone().jpeg().toBuffer()],
		['WebP', 'image/webp', () => image.clone().webp().toBuffer()],
	] as const)('fully decodes %s content and returns its actual dimensions', async (_name, mimeType, make) => {
		await expect(readImageMetadata(await make())).resolves.toEqual({
			width: 16,
			height: 6,
			mimeType,
		});
	});

	it('rejects renamed non-image content', async () => {
		await expect(readImageMetadata(new TextEncoder().encode('not really an image'))).rejects.toMatchObject({
			code: 'INVALID_IMAGE_CONTENT',
			statusCode: 422,
		});
	});

	it('rejects a truncated image that still contains a plausible header', async () => {
		const valid = await image.clone().png().toBuffer();
		await expect(readImageMetadata(valid.subarray(0, 40))).rejects.toMatchObject({
			code: 'INVALID_IMAGE_CONTENT',
		});
	});
});
