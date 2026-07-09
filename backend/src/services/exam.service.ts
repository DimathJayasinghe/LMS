import { ExamType, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import { assertCourseAccess } from '@/services/class.service';
import { assertStudentContentAccess } from '@/services/access.service';
import { EXAM_PDF_KEY_PREFIX, EXAM_PDF_URL_TTL_SECONDS } from '@/utils/constants';
import { createR2PresignedGetUrl, createR2PresignedPutUrl } from '@/utils/r2';
import {
	mcqPayloadSchema,
	type AssignMarkersInput,
	type CreateExamInput,
	type ExamUploadUrlInput,
	type ListExamsQuery,
	type UpdateExamInput,
} from '@/schemas/exam.schema';
import * as StreamService from '@/services/stream.service';

// ─── Types ────────────────────────────────────────────────

type McqPayload = Prisma.JsonObject & {
	questions: Array<{
		id: string;
		text: string;
		order: number;
		marks: number;
		options: Array<{ id: string; text: string; isCorrect: boolean }>;
	}>;
};

type StudentMcqPayload = Prisma.JsonObject & {
	questions: Array<{
		id: string;
		text: string;
		order: number;
		marks: number;
		options: Array<{ id: string; text: string }>;
	}>;
};

interface ExamListItem {
	id: string;
	title: string;
	type: ExamType;
	startTime: Date;
	endTime: Date;
	totalMarks: number;
	isPublished: boolean;
	courseId: string;
	deletedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

interface ExamDetail extends ExamListItem {
	paperPdfUrl: string | null;
	mcqPayload: McqPayload | StudentMcqPayload | null;
}

interface UploadUrlResult {
	uploadUrl: string;
	paperKey: string;
	expiresAt: Date;
}

interface MarkerAssignmentResult {
	examId: string;
	assignedMarkerIds: string[];
	assignedCount: number;
}

const examListSelect = {
	id: true,
	title: true,
	type: true,
	startTime: true,
	endTime: true,
	totalMarks: true,
	isPublished: true,
	courseId: true,
	deletedAt: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.ExamSelect;

const examDetailSelect = {
	...examListSelect,
	paperPdfUrl: true,
	mcqPayload: true,
} satisfies Prisma.ExamSelect;

const normalizeExamDetail = (
	exam: Prisma.ExamGetPayload<{ select: typeof examDetailSelect }>,
): ExamDetail => ({
	...exam,
	mcqPayload: exam.mcqPayload ? (exam.mcqPayload as McqPayload) : null,
});

// ─── Helpers ───────────────────────────────────────────────

const ensureCourseExists = async (courseId: string): Promise<void> => {
	const course = await prisma.course.findUnique({ where: { id: courseId } });
	if (!course) {
		throw new AppError('CLASS_NOT_FOUND', 404, 'Class (course) not found.');
	}
};

const ensureExamExists = async (examId: string): Promise<Prisma.ExamGetPayload<{
	select: typeof examDetailSelect;
}>> => {
	const exam = await prisma.exam.findUnique({ where: { id: examId }, select: examDetailSelect });
	if (!exam) {
		throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
	}
	return exam;
};

const validateExamWindow = (startTime: Date, endTime: Date): void => {
	if (startTime >= endTime) {
		throw new AppError('INVALID_EXAM_TIME', 400, 'End time must be after start time.');
	}
};

const validateMcqPayload = (payload: unknown): McqPayload => {
	const parsed = mcqPayloadSchema.safeParse(payload);
	if (!parsed.success) {
		throw new AppError('INVALID_MCQ_PAYLOAD', 400, 'MCQ payload is invalid.');
	}

	const parsedPayload = parsed.data as McqPayload;
	const missingCorrect = parsedPayload.questions.find(
		(question) => !question.options.some((option) => option.isCorrect),
	);

	if (missingCorrect) {
		throw new AppError(
			'MCQ_MISSING_CORRECT',
			400,
			'Each MCQ question must have at least one correct option.',
		);
	}

	return parsedPayload;
};

const resolveMcqPayload = (
	examType: ExamType,
	payload: unknown | null | undefined,
): McqPayload | null => {
	const requiresMcq = examType === ExamType.MCQ || examType === ExamType.HYBRID;

	if (payload === null || payload === undefined) {
		if (requiresMcq) {
			throw new AppError('MCQ_REQUIRED', 400, 'MCQ payload is required for this exam type.');
		}
		return null;
	}

	if (!requiresMcq) {
		throw new AppError('MCQ_NOT_ALLOWED', 400, 'MCQ payload is not allowed for this exam type.');
	}

	return validateMcqPayload(payload);
};

const resolvePaperKey = (
	examType: ExamType,
	paperPdfUrl: string | null | undefined,
): string | null => {
	const allowsPaper =
		examType === ExamType.WRITTEN || examType === ExamType.HYBRID || examType === ExamType.INCLASS;

	if (paperPdfUrl && !allowsPaper) {
		throw new AppError('PAPER_NOT_ALLOWED', 400, 'Paper uploads are not allowed for this exam type.');
	}

	return paperPdfUrl ?? null;
};

const stripMcqAnswers = (payload: McqPayload): StudentMcqPayload => ({
	questions: payload.questions.map((question) => ({
		id: question.id,
		text: question.text,
		order: question.order,
		marks: question.marks,
		options: question.options.map((option) => ({
			id: option.id,
			text: option.text,
		})),
	})),
});

// ─── CRUD ──────────────────────────────────────────────────

export const createExam = async (
	input: CreateExamInput,
	actor: AuthenticatedUser,
): Promise<ExamDetail> => {
	// Enforces course existence AND teacher ownership in one gate.
	await assertCourseAccess(input.courseId, actor);

	validateExamWindow(input.startTime, input.endTime);

	const mcqPayload = resolveMcqPayload(input.type, input.mcqPayload);
	const paperPdfUrl = resolvePaperKey(input.type, input.paperPdfUrl);

	const created = await prisma.exam.create({
		data: {
			title: input.title,
			type: input.type,
			courseId: input.courseId,
			startTime: input.startTime,
			endTime: input.endTime,
			totalMarks: input.totalMarks,
			paperPdfUrl,
			mcqPayload: mcqPayload ?? Prisma.JsonNull,
			allowTypedAnswers: input.allowTypedAnswers,
			allowPdfUpload: input.allowPdfUpload,
		},
		select: examDetailSelect,
	});

	return normalizeExamDetail(created);
};

export const listExams = async (
	query: ListExamsQuery,
	actor: AuthenticatedUser,
): Promise<ExamListItem[]> => {
	const role = actor.role;
	const now = new Date();

	const timeFilter: Prisma.ExamWhereInput =
		query.status === 'upcoming'
			? { startTime: { gt: now } }
			: query.status === 'active'
				? { startTime: { lte: now }, endTime: { gte: now } }
				: query.status === 'ended'
					? { endTime: { lt: now } }
					: {};

	const where: Prisma.ExamWhereInput = {
		...(query.courseId ? { courseId: query.courseId } : {}),
		...(query.type ? { type: query.type } : {}),
		...(role === Role.SUPER_ADMIN ? {} : { deletedAt: null }),
		// Students only see exams for courses they are actively enrolled in.
		...(role === Role.STUDENT
			? { course: { enrollments: { some: { userId: actor.userId, isActive: true } } } }
			: {}),
		...timeFilter,
	};

	return prisma.exam.findMany({
		where,
		select: examListSelect,
		orderBy: { startTime: 'desc' },
	});
};

export const getExamById = async (
	examId: string,
	actor: AuthenticatedUser,
): Promise<ExamDetail> => {
	const role = actor.role;
	const exam = await ensureExamExists(examId);

	if (exam.deletedAt && role !== Role.SUPER_ADMIN) {
		throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
	}

	// Students may only read exams for courses they are enrolled in.
	await assertStudentContentAccess(actor, exam.courseId, { requirePaid: false });

	const now = new Date();
	const isWithinWindow = now >= exam.startTime && now <= exam.endTime;
	const allowPaper = role !== Role.STUDENT || isWithinWindow;

	const paperPdfUrl = exam.paperPdfUrl && allowPaper
		? await createR2PresignedGetUrl(exam.paperPdfUrl, EXAM_PDF_URL_TTL_SECONDS)
		: null;

	let mcqPayload: McqPayload | StudentMcqPayload | null = null;
	if (exam.mcqPayload) {
		const parsed = validateMcqPayload(exam.mcqPayload);

		if (role === Role.STUDENT && !isWithinWindow) {
			mcqPayload = null;
		} else {
			mcqPayload = role === Role.STUDENT ? stripMcqAnswers(parsed) : parsed;
		}
	}

	return {
		...exam,
		paperPdfUrl,
		mcqPayload,
	};
};

export const updateExam = async (
	examId: string,
	input: UpdateExamInput,
	actor: AuthenticatedUser,
): Promise<ExamDetail> => {
	const existing = await ensureExamExists(examId);
	await assertCourseAccess(existing.courseId, actor);
	if (input.courseId && input.courseId !== existing.courseId) {
		await assertCourseAccess(input.courseId, actor);
	}

	if (existing.deletedAt) {
		throw new AppError('EXAM_DELETED', 400, 'Deleted exams cannot be updated.');
	}

	const nextType = input.type ?? existing.type;
	const nextStartTime = input.startTime ?? existing.startTime;
	const nextEndTime = input.endTime ?? existing.endTime;
	const nextMcqPayload = input.mcqPayload === undefined ? existing.mcqPayload : input.mcqPayload;
	const nextPaperPdfUrl =
		input.paperPdfUrl === undefined ? existing.paperPdfUrl : input.paperPdfUrl;

	validateExamWindow(nextStartTime, nextEndTime);

	const mcqPayload = resolveMcqPayload(nextType, nextMcqPayload);
	const paperPdfUrl = resolvePaperKey(nextType, nextPaperPdfUrl);

	const updated = await prisma.exam.update({
		where: { id: examId },
		data: {
			title: input.title,
			type: input.type,
			courseId: input.courseId,
			startTime: input.startTime,
			endTime: input.endTime,
			totalMarks: input.totalMarks,
			paperPdfUrl,
			mcqPayload: mcqPayload ?? Prisma.JsonNull,
			allowTypedAnswers: input.allowTypedAnswers,
			allowPdfUpload: input.allowPdfUpload,
		},
		select: examDetailSelect,
	});

	const normalized = normalizeExamDetail(updated);

	const timeChanged =
		(input.startTime !== undefined && input.startTime.getTime() !== existing.startTime.getTime()) ||
		(input.endTime !== undefined && input.endTime.getTime() !== existing.endTime.getTime());

	await StreamService.broadcastExamControl({
		examId,
		courseId: normalized.courseId,
		action: timeChanged ? 'time_changed' : 'updated',
		startTime: normalized.startTime.toISOString(),
		endTime: normalized.endTime.toISOString(),
	});

	return normalized;
};

export const deleteExam = async (
	examId: string,
	actor: AuthenticatedUser,
): Promise<ExamDetail> => {
	const existing = await ensureExamExists(examId);
	await assertCourseAccess(existing.courseId, actor);

	if (existing.deletedAt) {
		return normalizeExamDetail(existing);
	}

	const deleted = await prisma.exam.update({
		where: { id: examId },
		data: { deletedAt: new Date() },
		select: examDetailSelect,
	});

	const normalized = normalizeExamDetail(deleted);

	await StreamService.broadcastExamControl({
		examId,
		courseId: normalized.courseId,
		action: 'deleted',
	});

	return normalized;
};

// ─── Paper Upload URL ──────────────────────────────────────

export const generateExamPaperUploadUrl = async (
	examId: string,
	input: ExamUploadUrlInput,
	actor: AuthenticatedUser,
): Promise<UploadUrlResult> => {
	const exam = await ensureExamExists(examId);
	await assertCourseAccess(exam.courseId, actor);

	if (exam.deletedAt) {
		throw new AppError('EXAM_DELETED', 400, 'Deleted exams cannot accept uploads.');
	}

	if (exam.type === ExamType.MCQ) {
		throw new AppError('PAPER_NOT_ALLOWED', 400, 'MCQ exams do not accept paper uploads.');
	}

	const paperKey = `${EXAM_PDF_KEY_PREFIX}/${examId}/${input.fileName}`;

	const uploadUrl = await createR2PresignedPutUrl(
		paperKey,
		input.contentType,
		EXAM_PDF_URL_TTL_SECONDS,
	);

	await prisma.exam.update({
		where: { id: examId },
		data: { paperPdfUrl: paperKey },
	});

	return {
		uploadUrl,
		paperKey,
		expiresAt: new Date(Date.now() + EXAM_PDF_URL_TTL_SECONDS * 1000),
	};
};

// ─── Marker Assignment ─────────────────────────────────────

export const assignMarkersToExam = async (
	examId: string,
	input: AssignMarkersInput,
	actor: AuthenticatedUser,
): Promise<MarkerAssignmentResult> => {
	const exam = await ensureExamExists(examId);
	await assertCourseAccess(exam.courseId, actor);

	if (exam.deletedAt) {
		throw new AppError('EXAM_DELETED', 400, 'Cannot assign markers to a deleted exam.');
	}

	const uniqueMarkerIds = Array.from(new Set(input.markerIds));

	const markers = await prisma.user.findMany({
		where: {
			id: { in: uniqueMarkerIds },
			role: Role.MARKER,
			deletedAt: null,
		},
		select: { id: true },
	});

	if (markers.length !== uniqueMarkerIds.length) {
		throw new AppError(
			'INVALID_MARKER_IDS',
			400,
			'Some markers are missing, inactive, or not assigned the MARKER role.',
		);
	}

	await prisma.markerAssignment.createMany({
		data: markers.map((marker) => ({
			markerId: marker.id,
			examId,
		})),
		skipDuplicates: true,
	});

	const assignments = await prisma.markerAssignment.findMany({
		where: { examId, markerId: { in: uniqueMarkerIds } },
		select: { markerId: true },
	});

	return {
		examId,
		assignedMarkerIds: assignments.map((assignment) => assignment.markerId),
		assignedCount: assignments.length,
	};
};
