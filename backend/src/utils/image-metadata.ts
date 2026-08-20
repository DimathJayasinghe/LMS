import sharp from 'sharp';
import { AppError } from '@/utils/app-error';

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageMetadata {
	width: number;
	height: number;
	mimeType: SupportedImageMime;
}

const MIME_BY_FORMAT: Record<string, SupportedImageMime | undefined> = {
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
};

/**
 * Decode an uploaded image with libvips. This validates the complete payload,
 * rather than trusting its extension, claimed MIME, or dimension header. The
 * pixel cap prevents a small compressed file from becoming a decompression bomb.
 */
export const readImageMetadata = async (bytes: Uint8Array): Promise<ImageMetadata> => {
	try {
		const image = sharp(bytes, {
			failOn: 'error',
			limitInputPixels: 1920 * 1080,
		});
		const metadata = await image.metadata();
		const mimeType = metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined;
		if (!mimeType || !metadata.width || !metadata.height) throw new Error('Unsupported image');

		// Force a full decode so truncated/corrupt pixel data cannot pass on header
		// metadata alone. At the accepted dimensions this stays under a small bound.
		await image.clone().raw().toBuffer();
		return { width: metadata.width, height: metadata.height, mimeType };
	} catch {
		throw new AppError(
			'INVALID_IMAGE_CONTENT',
			422,
			'The uploaded file is not a valid JPG, PNG, or WebP image.',
		);
	}
};
