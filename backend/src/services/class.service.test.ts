import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	courseFindMany,
	courseFindFirst,
	courseFindUnique,
	courseUpdate,
	courseUpdateMany,
	r2Put,
	r2Head,
	r2Get,
	r2Delete,
	publicConfig,
	readMetadata,
} = vi.hoisted(() => ({
	courseFindMany: vi.fn(),
	courseFindFirst: vi.fn(),
	courseFindUnique: vi.fn(),
	courseUpdate: vi.fn(),
	courseUpdateMany: vi.fn(),
	r2Put: vi.fn(),
	r2Head: vi.fn(),
	r2Get: vi.fn(),
	r2Delete: vi.fn(),
	publicConfig: vi.fn(),
	readMetadata: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		course: {
			findMany: courseFindMany,
			findFirst: courseFindFirst,
			findUnique: courseFindUnique,
			update: courseUpdate,
			updateMany: courseUpdateMany,
		},
	},
}));

vi.mock('@/config/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/utils/r2', () => ({
	createR2PresignedPutUrl: r2Put,
	r2HeadObject: r2Head,
	r2GetObjectBytes: r2Get,
	deleteR2Object: r2Delete,
	getPublicAssetConfig: publicConfig,
}));
vi.mock('@/utils/image-metadata', () => ({ readImageMetadata: readMetadata }));

import {
	confirmCourseAsset,
	generateCourseAssetUploadUrl,
	getClassById,
	listClasses,
	listPublicClasses,
	removeCourseAsset,
	updateCourseAssetAlt,
} from './class.service';
import { Role } from '@prisma/client';

beforeEach(() => {
	courseFindMany.mockReset().mockResolvedValue([]);
	courseFindFirst.mockReset();
	courseFindUnique.mockReset();
	courseUpdate.mockReset();
	courseUpdateMany.mockReset().mockResolvedValue({ count: 1 });
	r2Put.mockReset().mockResolvedValue('https://signed.example');
	r2Head.mockReset().mockResolvedValue({ exists: true, size: 1024, contentType: 'image/png' });
	r2Get.mockReset().mockResolvedValue(new Uint8Array(32));
	r2Delete.mockReset().mockResolvedValue(undefined);
	publicConfig.mockReset().mockReturnValue({ bucket: 'public', publicBaseUrl: 'https://cdn.example' });
	readMetadata.mockReset().mockResolvedValue({ width: 1600, height: 600, mimeType: 'image/png' });
});

describe('secure course display assets', () => {
	const teacher = { userId: 'teacher-1', role: Role.TEACHER };
	const superAdmin = { userId: 'super-1', role: Role.SUPER_ADMIN };
	const assetState = {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Physics Theory',
		bannerKey: 'courses/11111111-1111-4111-8111-111111111111/banner/old.png',
		bannerUrl: 'https://cdn.example/old.png',
		backdropKey: null,
		backdropUrl: null,
	};

	it('does not presign another teacher\'s class asset', async () => {
		courseFindUnique.mockResolvedValueOnce({ id: assetState.id, teacherId: 'teacher-2' });
		await expect(generateCourseAssetUploadUrl(assetState.id, {
			kind: 'BANNER', fileName: 'banner.png', contentType: 'image/png', fileSizeBytes: 100,
		}, teacher)).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
		expect(r2Put).not.toHaveBeenCalled();
	});

	it('lets super admin authorize a course-bound upload and returns exact requirements', async () => {
		courseFindUnique.mockResolvedValueOnce({ id: assetState.id, teacherId: 'teacher-2' });
		const result = await generateCourseAssetUploadUrl(assetState.id, {
			kind: 'BACKDROP', fileName: 'photo.webp', contentType: 'image/webp', fileSizeBytes: 100,
		}, superAdmin);
		expect(result).toMatchObject({ requiredWidth: 1920, requiredHeight: 1080, maxSizeBytes: 8 * 1024 * 1024 });
		expect(r2Put.mock.calls[0]![0]).toMatch(new RegExp(`^courses/${assetState.id}/backdrop/.+\\.webp$`));
		expect(r2Put.mock.calls[0]![3]).toBe('public');
	});

	it('rejects a key from another class before inspecting storage', async () => {
		courseFindUnique.mockResolvedValueOnce({ id: assetState.id, teacherId: 'teacher-1' });
		await expect(confirmCourseAsset(assetState.id, {
			kind: 'BANNER', key: 'courses/other/banner/image.png', altText: 'Class art',
		}, teacher)).rejects.toMatchObject({ code: 'FORBIDDEN_KEY', statusCode: 403 });
		expect(r2Head).not.toHaveBeenCalled();
	});

	it('deletes and rejects an image with the wrong decoded dimensions', async () => {
		courseFindUnique.mockResolvedValueOnce({ id: assetState.id, teacherId: 'teacher-1' });
		readMetadata.mockResolvedValueOnce({ width: 800, height: 300, mimeType: 'image/png' });
		const key = `courses/${assetState.id}/banner/new.png`;
		await expect(confirmCourseAsset(assetState.id, { kind: 'BANNER', key }, teacher))
			.rejects.toMatchObject({ code: 'INVALID_IMAGE_DIMENSIONS', statusCode: 422 });
		expect(r2Delete).toHaveBeenCalledWith(key, 'public');
		expect(courseUpdate).not.toHaveBeenCalled();
	});

	it('persists only the server-controlled CDN URL and cleans up the replaced object', async () => {
		courseFindUnique
			.mockResolvedValueOnce({ id: assetState.id, teacherId: 'teacher-1' })
			.mockResolvedValueOnce(assetState)
			.mockResolvedValueOnce({ ...assetState, bannerAlt: 'Students solving equations' });
		const key = `courses/${assetState.id}/banner/new.png`;
		await confirmCourseAsset(assetState.id, {
			kind: 'BANNER', key, altText: 'Students solving equations',
		}, teacher);
		expect(courseUpdateMany.mock.calls[0]![0].data).toEqual({
			bannerKey: key,
			bannerUrl: `https://cdn.example/${key}`,
			bannerAlt: 'Students solving equations',
		});
		expect(r2Delete).toHaveBeenCalledWith(assetState.bannerKey, 'public');
	});

	it('removes a legacy URL even when it has no tracked key', async () => {
		courseFindUnique
			.mockResolvedValueOnce({ id: assetState.id, teacherId: 'teacher-1' })
			.mockResolvedValueOnce({ ...assetState, bannerKey: null })
			.mockResolvedValueOnce({ ...assetState, bannerUrl: null });
		const result = await removeCourseAsset(assetState.id, 'BANNER', teacher);
		expect(result.removed).toBe(true);
		expect(courseUpdateMany.mock.calls[0]![0].data).toEqual({ bannerKey: null, bannerUrl: null, bannerAlt: null });
		expect(r2Delete).not.toHaveBeenCalled();
	});

	it('updates alt text without exposing object keys or replacing the image', async () => {
		courseFindUnique
			.mockResolvedValueOnce({ id: assetState.id, teacherId: 'teacher-1' })
			.mockResolvedValueOnce(assetState)
			.mockResolvedValueOnce({ ...assetState, bannerAlt: 'Updated description' });
		await updateCourseAssetAlt(assetState.id, 'BANNER', { altText: 'Updated description' }, teacher);
		expect(courseUpdateMany.mock.calls[0]![0].data).toEqual({ bannerAlt: 'Updated description' });
		expect(r2Head).not.toHaveBeenCalled();
		expect(r2Delete).not.toHaveBeenCalled();
	});

	it('deletes the newly uploaded object instead of overwriting a concurrent replacement', async () => {
		courseFindUnique
			.mockResolvedValueOnce({ id: assetState.id, teacherId: 'teacher-1' })
			.mockResolvedValueOnce(assetState);
		courseUpdateMany.mockResolvedValueOnce({ count: 0 });
		const key = `courses/${assetState.id}/banner/stale.png`;
		await expect(confirmCourseAsset(assetState.id, { kind: 'BANNER', key }, teacher))
			.rejects.toMatchObject({ code: 'COURSE_ASSET_CHANGED', statusCode: 409 });
		expect(r2Delete).toHaveBeenCalledWith(key, 'public');
	});
});

describe('teacher class visibility', () => {
	it('scopes the class list to the acting teacher', async () => {
		await listClasses({}, { userId: 'teacher-1', role: Role.TEACHER });

		expect(courseFindMany.mock.calls[0]![0].where).toMatchObject({
			teacherId: 'teacher-1',
			isActive: true,
		});
	});

	it('rejects direct access to another teacher\'s class', async () => {
		courseFindFirst.mockResolvedValueOnce({
			id: 'course-2',
			teacherId: 'teacher-2',
			isActive: true,
		});

		await expect(
			getClassById('course-2', { userId: 'teacher-1', role: Role.TEACHER }),
		).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
	});
});

describe('listPublicClasses — public marketing-page course listing', () => {
	it('only returns active courses, regardless of query filters', async () => {
		await listPublicClasses({});

		const call = courseFindMany.mock.calls[0]![0];
		expect(call.where.isActive).toBe(true);
	});

	it('never selects PII (email/phone/NIC) or enrollment data', async () => {
		await listPublicClasses({});

		const call = courseFindMany.mock.calls[0]![0];
		expect(call.select).toMatchObject({
			id: true,
			name: true,
			year: true,
			description: true,
			monthlyFee: true,
			bannerUrl: true,
			backdropUrl: true,
		});
		expect(call.select).not.toHaveProperty('enrollments');
		expect(call.select.teacher).toEqual({ select: { name: true } });
	});

	it('applies search and year filters when provided', async () => {
		await listPublicClasses({ search: 'physics', year: 2027 });

		const call = courseFindMany.mock.calls[0]![0];
		expect(call.where.year).toBe(2027);
		expect(call.where.OR).toEqual([
			{ name: { contains: 'physics', mode: 'insensitive' } },
			{ description: { contains: 'physics', mode: 'insensitive' } },
		]);
	});
});
