import { ExamType, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import { assertCourseAccess } from '@/services/class.service';
import { assertStudentContentAccess, assertMarkerAssignedToExam } from '@/services/access.service';
import { EXAM_PDF_KEY_PREFIX, EXAM_PDF_URL_TTL_SECONDS } from '@/utils/constants';
import { createR2PresignedGetUrl, createR2PresignedPutUrl, r2HeadObject } from '@/utils/r2';
import {
	mcqPayloadSchema,
	type AssignMarkersInput,
	type CreateExamInput,
	type ExamUploadUrlInput,
	type ExamPaperConfirmInput,
	type ListExamsQuery,
	type ReplaceMarkersInput,
	type UpdateExamInput,
} from '@/schemas/exam.schema';
import { resolveStudentExamAudience, studentAudienceSelect, toMyAudience, toStudentAudience, type MyAudience } from '@/services/exam-audience-access.service';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { createSettingsReader } from '@/services/settings.service';
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
	allowTypedAnswers: boolean;
	allowPdfUpload: boolean;
	courseId: string;
	deletedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	paperRevisionId: string | null;
	/** Students only: the student's own audience of a scoped exam, null for a course-wide exam. */
	myAudience?: MyAudience | null;
}

interface ExamDetail extends ExamListItem {
	/** Students only: how the browser should behave while sitting (the owner's settings). */
	sitting?: { autoSubmitLeadSeconds: number };
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
	allowTypedAnswers: true,
	allowPdfUpload: true,
	courseId: true,
	deletedAt: true,
	createdAt: true,
	updatedAt: true,
	paperRevisionId: true,
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

/** The browser submits typed work this long before the end, because the server refuses any start after it. */
const sittingFor = async (userId: string): Promise<{ autoSubmitLeadSeconds: number }> => {
	const { organizationId } = await organizationClockForUser(userId);
	return { autoSubmitLeadSeconds: await createSettingsReader(organizationId)('exams.autoSubmitLeadSeconds') };
};

// ─── CRUD ──────────────────────────────────────────────────

export const createExam = async (
	input: CreateExamInput,
	actor: AuthenticatedUser,
): Promise<ExamDetail> => {
	// Enforces course existence AND teacher ownership in one gate.
	await assertCourseAccess(input.courseId, actor);

	validateExamWindow(input.startTime, input.endTime);
	const pinnedRevision = input.paperRevisionId
		? await prisma.examPaperRevision.findUnique({ where: { id: input.paperRevisionId }, select: { id: true, paper: { select: { courseId: true } }, type: true, totalMarks: true, paperPdfUrl: true, mcqPayload: true, allowTypedAnswers: true, allowPdfUpload: true } })
		: null;
	if (input.paperRevisionId && (!pinnedRevision || pinnedRevision.paper.courseId !== input.courseId)) {
		throw new AppError('INVALID_PAPER_REVISION', 400, 'The paper revision must belong to this course.');
	}

	const sourceType = pinnedRevision?.type ?? input.type;
	const mcqPayload = resolveMcqPayload(sourceType, pinnedRevision?.mcqPayload ?? input.mcqPayload);
	const paperPdfUrl = resolvePaperKey(sourceType, pinnedRevision?.paperPdfUrl ?? input.paperPdfUrl);

	const created = await prisma.exam.create({
		data: {
			title: input.title,
			type: sourceType,
			courseId: input.courseId,
			startTime: input.startTime,
			endTime: input.endTime,
			totalMarks: pinnedRevision?.totalMarks ?? input.totalMarks,
			paperRevisionId: pinnedRevision?.id,
			paperPdfUrl,
			mcqPayload: mcqPayload ?? Prisma.JsonNull,
			allowTypedAnswers: pinnedRevision?.allowTypedAnswers ?? input.allowTypedAnswers,
			allowPdfUpload: pinnedRevision?.allowPdfUpload ?? input.allowPdfUpload,
		},
		select: examDetailSelect,
	});

	return normalizeExamDetail(created);
};

// Roles permitted to read exams at all. Front-desk ADMIN is intentionally
// excluded (non-academic role). A service-level default-deny so the check does
// not depend solely on the route's requireRole (13-system-assessment §4.1).
const EXAM_READER_ROLES: ReadonlySet<Role> = new Set([
	Role.SUPER_ADMIN,
	Role.TEACHER,
	Role.MARKER,
	Role.STUDENT,
]);

export const listExams = async (
	query: ListExamsQuery,
	actor: AuthenticatedUser,
): Promise<ExamListItem[]> => {
	const role = actor.role;
	if (!EXAM_READER_ROLES.has(role)) {
		throw new AppError('FORBIDDEN', 403, 'You do not have access to exam content.');
	}
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
			? {
				course: { enrollments: { some: { userId: actor.userId, isActive: true } } },
				// A scoped exam exists for a student only if the roster lists them.
				OR: [{ paperRevisionId: null }, { participants: { some: { userId: actor.userId } } }],
			}
			: {}),
		// Teachers only see exams for courses they teach — a list filter, not a
		// throw, mirroring the STUDENT scoping directly above.
		...(role === Role.TEACHER ? { course: { teacherId: actor.userId } } : {}),
		// Markers only see exams they are assigned to.
		...(role === Role.MARKER
			? { markerAssignments: { some: { markerId: actor.userId, OR: [{ exam: { paperRevisionId: null } }, { audienceGrants: { some: {} } }] } } }
			: {}),
		...timeFilter,
	};

	if (role === Role.STUDENT) {
		const rows = await prisma.exam.findMany({
			where,
			select: { ...examListSelect, participants: studentAudienceSelect(actor.userId) },
			orderBy: { startTime: 'desc' },
		});
		return rows.map(({ participants, ...exam }) => ({
			...exam,
			myAudience: participants[0] ? toMyAudience(toStudentAudience(participants[0].audience)) : null,
		}));
	}

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
	if (!EXAM_READER_ROLES.has(role)) {
		throw new AppError('FORBIDDEN', 403, 'You do not have access to exam content.');
	}
	const exam = await ensureExamExists(examId);

	if (exam.deletedAt && role !== Role.SUPER_ADMIN) {
		throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
	}

	// Markers may only read exams they are assigned to.
	if (role === Role.MARKER) {
		await assertMarkerAssignedToExam(actor.userId, examId);
	}

	// Teachers may only read exams for courses they teach.
	await assertCourseAccess(exam.courseId, actor);

	// Students may only read exams for courses they are enrolled in.
	await assertStudentContentAccess(actor, exam.courseId, { requirePaid: false });

	// A scoped exam is visible to a student only through the roster; a hall participant learns where, but gets no paper.
	const audience = role === Role.STUDENT && exam.paperRevisionId
		? await resolveStudentExamAudience(prisma, examId, actor.userId)
		: null;
	if (role === Role.STUDENT && exam.paperRevisionId && !audience) {
		throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
	}
	const sitsInHall = audience?.deliveryMode === 'PHYSICAL';

	const now = new Date();
	const isWithinWindow = now >= exam.startTime && now <= exam.endTime;
	const allowPaper = role !== Role.STUDENT || (isWithinWindow && !sitsInHall);

	const paperPdfUrl = exam.paperPdfUrl && allowPaper
		? await createR2PresignedGetUrl(exam.paperPdfUrl, EXAM_PDF_URL_TTL_SECONDS)
		: null;

	let mcqPayload: McqPayload | StudentMcqPayload | null = null;
	if (exam.mcqPayload) {
		const parsed = validateMcqPayload(exam.mcqPayload);

		if (role === Role.STUDENT && !allowPaper) {
			mcqPayload = null;
		} else {
			mcqPayload = (role === Role.STUDENT || role === Role.MARKER)
				? stripMcqAnswers(parsed)
				: parsed;
		}
	}

	return {
		...exam,
		paperPdfUrl,
		mcqPayload,
		...(role === Role.STUDENT
			? { myAudience: audience ? toMyAudience(audience) : null, sitting: await sittingFor(actor.userId) }
			: {}),
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
	if (existing.paperRevisionId && (
		input.type !== undefined || input.totalMarks !== undefined || input.paperPdfUrl !== undefined ||
		input.mcqPayload !== undefined || input.allowTypedAnswers !== undefined || input.allowPdfUpload !== undefined ||
		(input.courseId !== undefined && input.courseId !== existing.courseId)
	)) {
		throw new AppError('PINNED_PAPER_REVISION', 409, 'Scoped exam paper content is pinned to its revision.');
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
	if (exam.paperRevisionId) throw new AppError('PINNED_PAPER_REVISION', 409, 'Scoped exam paper content is pinned to its revision.');

	if (exam.type === ExamType.MCQ) {
		throw new AppError('PAPER_NOT_ALLOWED', 400, 'MCQ exams do not accept paper uploads.');
	}

	const paperKey = `${EXAM_PDF_KEY_PREFIX}/${examId}/${input.fileName}`;

	// Presign only — do NOT persist `paperPdfUrl` yet. The browser PUT can fail
	// (connection / R2 CORS) and eagerly writing the key marked a paper attached
	// that never landed. `confirmExamPaper` writes it once the object is verified.
	const uploadUrl = await createR2PresignedPutUrl(
		paperKey,
		input.contentType,
		EXAM_PDF_URL_TTL_SECONDS,
	);

	return {
		uploadUrl,
		paperKey,
		expiresAt: new Date(Date.now() + EXAM_PDF_URL_TTL_SECONDS * 1000),
	};
};

/**
 * Confirms the exam paper PDF actually reached R2 (HeadObject), then persists
 * `paperPdfUrl`. Re-applies the same access + type guards as the presign, and
 * validates the key belongs to this exam so a client can't attach an arbitrary
 * object. Idempotent.
 */
export const confirmExamPaper = async (
	examId: string,
	input: ExamPaperConfirmInput,
	actor: AuthenticatedUser,
): Promise<{ paperPdfUrl: string }> => {
	const exam = await ensureExamExists(examId);
	await assertCourseAccess(exam.courseId, actor);

	if (exam.deletedAt) {
		throw new AppError('EXAM_DELETED', 400, 'Deleted exams cannot accept uploads.');
	}
	if (exam.paperRevisionId) throw new AppError('PINNED_PAPER_REVISION', 409, 'Scoped exam paper content is pinned to its revision.');

	if (exam.type === ExamType.MCQ) {
		throw new AppError('PAPER_NOT_ALLOWED', 400, 'MCQ exams do not accept paper uploads.');
	}

	const expectedPrefix = `${EXAM_PDF_KEY_PREFIX}/${examId}/`;
	if (!input.key.startsWith(expectedPrefix)) {
		throw new AppError('FORBIDDEN_KEY', 403, 'That upload key does not belong to this exam.');
	}

	const { exists } = await r2HeadObject(input.key);
	if (!exists) {
		throw new AppError(
			'UPLOAD_NOT_FOUND',
			409,
			"We couldn't find the uploaded paper. Please try uploading it again.",
		);
	}

	await prisma.exam.update({
		where: { id: examId },
		data: { paperPdfUrl: input.key },
	});

	return { paperPdfUrl: input.key };
};

// ─── Marker Assignment ─────────────────────────────────────

export const assertLegacyMarkerMutationAllowed = async (examId: string, actor: AuthenticatedUser) => {
	const exam = await ensureExamExists(examId);
	await assertCourseAccess(exam.courseId, actor);
	if (exam.deletedAt) throw new AppError('EXAM_DELETED', 400, 'Cannot assign markers to a deleted exam.');
	if (exam.paperRevisionId) throw new AppError('SCOPED_MARKER_ALLOCATIONS_REQUIRED', 409, 'Use scoped marker allocations for this exam instance.');
};

export const assignMarkersToExam = async (
	examId: string,
	input: AssignMarkersInput,
	actor: AuthenticatedUser,
): Promise<MarkerAssignmentResult> => {
	await assertLegacyMarkerMutationAllowed(examId, actor);

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
			allAudiences: true,
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

const markerAssignmentSelect = {
	markerId: true,
	assignedAt: true,
	marker: { select: { id: true, name: true, role: true } },
} satisfies Prisma.MarkerAssignmentSelect;

export const listExamMarkers = async (examId: string, actor: AuthenticatedUser) => {
	const exam = await ensureExamExists(examId);
	await assertCourseAccess(exam.courseId, actor);

	return prisma.markerAssignment.findMany({
		where: { examId },
		select: markerAssignmentSelect,
		orderBy: { marker: { name: 'asc' } },
	});
};

export const replaceExamMarkers = async (
	examId: string,
	input: ReplaceMarkersInput,
	actor: AuthenticatedUser,
) => {
	await assertLegacyMarkerMutationAllowed(examId, actor);

	const markerIds = Array.from(new Set(input.markerIds));
	const markers = await prisma.user.findMany({
		where: { id: { in: markerIds }, role: Role.MARKER, deletedAt: null },
		select: { id: true },
	});
	if (markers.length !== markerIds.length) {
		throw new AppError(
			'INVALID_MARKER_IDS',
			400,
			'Some markers are missing, inactive, or not assigned the MARKER role.',
		);
	}

	await prisma.$transaction(async (tx) => {
		await tx.markerAssignment.deleteMany({
			where: {
				examId,
				...(markerIds.length > 0 ? { markerId: { notIn: markerIds } } : {}),
			},
		});
		if (markerIds.length > 0) {
			await tx.markerAssignment.createMany({
				data: markerIds.map((markerId) => ({ markerId, examId, allAudiences: true })),
				skipDuplicates: true,
			});
		}
	});

	return listExamMarkers(examId, actor);
};
