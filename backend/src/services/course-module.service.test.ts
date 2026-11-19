import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseModuleStatus, Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
	moduleFindMany: vi.fn(),
	moduleFindFirst: vi.fn(),
	moduleCreate: vi.fn(),
	moduleUpdate: vi.fn(),
	moduleAggregate: vi.fn(),
	materialFindUnique: vi.fn(),
	materialFindFirst: vi.fn(),
	materialCreate: vi.fn(),
	materialUpdate: vi.fn(),
	materialUpdateMany: vi.fn(),
	materialAggregate: vi.fn(),
	transaction: vi.fn(),
	assertCourseAccess: vi.fn(),
	assertStudentAccess: vi.fn(),
	presignPut: vi.fn(),
	presignGet: vi.fn(),
	head: vi.fn(),
	getBytes: vi.fn(),
	deleteObject: vi.fn(),
	readImage: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		courseModule: {
			findMany: mocks.moduleFindMany,
			findFirst: mocks.moduleFindFirst,
			create: mocks.moduleCreate,
			update: mocks.moduleUpdate,
			aggregate: mocks.moduleAggregate,
		},
		courseMaterial: {
			findUnique: mocks.materialFindUnique,
			findFirst: mocks.materialFindFirst,
			create: mocks.materialCreate,
			update: mocks.materialUpdate,
			updateMany: mocks.materialUpdateMany,
			aggregate: mocks.materialAggregate,
		},
		$transaction: mocks.transaction,
	},
}));
vi.mock('@/config/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess: mocks.assertCourseAccess }));
vi.mock('@/services/access.service', () => ({ assertStudentContentAccess: mocks.assertStudentAccess }));
vi.mock('@/utils/r2', () => ({
	createR2PresignedPutUrl: mocks.presignPut,
	createR2PresignedGetUrl: mocks.presignGet,
	r2HeadObject: mocks.head,
	r2GetObjectBytes: mocks.getBytes,
	deleteR2Object: mocks.deleteObject,
}));
vi.mock('@/utils/image-metadata', () => ({ readImageMetadata: mocks.readImage }));

import {
	confirmCourseMaterial,
	generateCourseMaterialUploadUrl,
	getCourseMaterialDownload,
	listCourseModules,
} from './course-module.service';

const classId = '11111111-1111-4111-8111-111111111111';
const moduleId = '22222222-2222-4222-8222-222222222222';
const materialId = '33333333-3333-4333-8333-333333333333';
const teacher = { userId: 'teacher-1', role: Role.TEACHER };
const student = { userId: 'student-1', role: Role.STUDENT };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.assertCourseAccess.mockResolvedValue({ id: classId, teacherId: teacher.userId });
	mocks.assertStudentAccess.mockResolvedValue(undefined);
	mocks.moduleFindMany.mockResolvedValue([]);
	mocks.moduleFindFirst.mockResolvedValue({ id: moduleId, courseId: classId, deletedAt: null });
	mocks.materialFindUnique.mockResolvedValue(null);
	mocks.materialAggregate.mockResolvedValue({ _max: { position: null } });
	mocks.presignPut.mockResolvedValue('https://signed-upload.example');
	mocks.presignGet.mockResolvedValue('https://signed-download.example');
	mocks.head.mockResolvedValue({ exists: true, size: 30, contentType: 'application/pdf' });
	mocks.getBytes.mockResolvedValue(Buffer.from('%PDF-1.7\nbody\n%%EOF'));
	mocks.deleteObject.mockResolvedValue(undefined);
	mocks.materialCreate.mockImplementation(async ({ data }: { data: object }) => ({ id: materialId, ...data }));
});

describe('course module authorization and visibility', () => {
	it('shows students only released published modules after enrollment', async () => {
		await listCourseModules(classId, student);
		expect(mocks.assertStudentAccess).toHaveBeenCalledWith(student, classId, { requirePaid: false });
		expect(mocks.moduleFindMany.mock.calls[0]![0].where).toMatchObject({
			courseId: classId,
			status: CourseModuleStatus.PUBLISHED,
			deletedAt: null,
		});
	});

	it('denies ADMIN material visibility instead of applying a privileged bypass', async () => {
		await expect(listCourseModules(classId, { userId: 'admin-1', role: Role.ADMIN }))
			.rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(mocks.moduleFindMany).not.toHaveBeenCalled();
	});

	it('scopes teacher upload authorization to course ownership', async () => {
		const result = await generateCourseMaterialUploadUrl(classId, moduleId, {
			fileName: 'lesson.pdf', contentType: 'application/pdf', fileSizeBytes: 100,
		}, teacher);
		expect(mocks.assertCourseAccess).toHaveBeenCalledWith(classId, teacher);
		expect(result.key).toMatch(new RegExp(`^course-materials/${classId}/${moduleId}/.+\\.pdf$`));
	});
});

describe('private material confirmation and download', () => {
	it('rejects a key outside the module before reading storage', async () => {
		await expect(confirmCourseMaterial(classId, moduleId, {
			key: 'course-materials/other/other/file.pdf', title: 'Notes', fileName: 'notes.pdf',
		}, teacher)).rejects.toMatchObject({ code: 'FORBIDDEN_KEY', statusCode: 403 });
		expect(mocks.head).not.toHaveBeenCalled();
	});

	it('deletes a malformed PDF and never persists it', async () => {
		mocks.getBytes.mockResolvedValueOnce(Buffer.from('%PDF-1.7\nmissing trailer'));
		const key = `course-materials/${classId}/${moduleId}/file.pdf`;
		await expect(confirmCourseMaterial(classId, moduleId, {
			key, title: 'Notes', fileName: 'notes.pdf',
		}, teacher)).rejects.toMatchObject({ code: 'INVALID_MATERIAL_CONTENT', statusCode: 422 });
		expect(mocks.deleteObject).toHaveBeenCalledWith(key);
		expect(mocks.materialCreate).not.toHaveBeenCalled();
	});

	it('persists verified content with a safe server-normalized filename', async () => {
		const key = `course-materials/${classId}/${moduleId}/file.pdf`;
		await confirmCourseMaterial(classId, moduleId, {
			key, title: 'Lesson notes', fileName: '../../notes.exe',
		}, teacher);
		expect(mocks.materialCreate.mock.calls[0]![0].data).toMatchObject({
			objectKey: key,
			fileName: 'notes.pdf',
			contentType: 'application/pdf',
		});
	});

	it('requires current payment before issuing a student download URL', async () => {
		mocks.materialFindFirst.mockResolvedValueOnce({
			id: materialId,
			downloadable: true,
			objectKey: 'course-materials/file.pdf',
			fileName: 'notes.pdf',
			module: { status: CourseModuleStatus.PUBLISHED, releaseAt: null, courseId: classId },
		});
		const result = await getCourseMaterialDownload(classId, moduleId, materialId, student);
		expect(mocks.assertStudentAccess).toHaveBeenCalledWith(student, classId, { requirePaid: true });
		expect(mocks.presignGet).toHaveBeenCalledWith('course-materials/file.pdf', 900, 'notes.pdf');
		expect(result.url).toBe('https://signed-download.example');
	});

	it('hides draft material from students without issuing a URL', async () => {
		mocks.materialFindFirst.mockResolvedValueOnce({
			id: materialId,
			downloadable: true,
			objectKey: 'course-materials/file.pdf',
			fileName: 'notes.pdf',
			module: { status: CourseModuleStatus.DRAFT, releaseAt: null, courseId: classId },
		});
		await expect(getCourseMaterialDownload(classId, moduleId, materialId, student))
			.rejects.toMatchObject({ code: 'COURSE_MATERIAL_NOT_FOUND', statusCode: 404 });
		expect(mocks.presignGet).not.toHaveBeenCalled();
	});
});
