import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { CreateExamPaperInput, PaperRevisionInput } from '@/schemas/exam-paper.schema';

const assertPaperAuthor = async (courseId: string, actor: AuthenticatedUser) => {
	if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.TEACHER) throw new AppError('FORBIDDEN', 403, 'Only teachers can configure exam papers.');
	const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, teacherId: true } });
	if (!course) throw new AppError('CLASS_NOT_FOUND', 404, 'Class (course) not found.');
	if (actor.role === Role.TEACHER && course.teacherId !== actor.userId) throw new AppError('FORBIDDEN_COURSE', 403, 'You can only manage papers for your own courses.');
	return course;
};
const revisionData = (input: PaperRevisionInput) => ({ type: input.type, totalMarks: input.totalMarks, paperPdfUrl: input.paperPdfUrl ?? null, mcqPayload: input.mcqPayload ?? Prisma.JsonNull, allowTypedAnswers: input.allowTypedAnswers ?? true, allowPdfUpload: input.allowPdfUpload ?? true });
const evidence = (tx: Prisma.TransactionClient, actor: AuthenticatedUser, targetId: string, action: string) => tx.auditLog.create({ data: { action, targetType: 'ExamPaper', targetId, actorId: actor.userId, actorRole: actor.role } });
export const createExamPaper = async (input: CreateExamPaperInput, actor: AuthenticatedUser) => {
	await assertPaperAuthor(input.courseId, actor);
	return prisma.$transaction(async (tx) => { const paper = await tx.examPaper.create({ data: { courseId: input.courseId, title: input.title, createdById: actor.userId } }); await tx.examPaperRevision.create({ data: { paperId: paper.id, version: 1, ...revisionData(input.revision) } }); await evidence(tx, actor, paper.id, 'EXAM_PAPER_CREATED'); return paper; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};
export const createExamPaperRevision = async (paperId: string, input: PaperRevisionInput, actor: AuthenticatedUser) => {
	return prisma.$transaction(async (tx) => { await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${paperId}, 0))`); const paper = await tx.examPaper.findUnique({ where: { id: paperId }, select: { id: true, courseId: true, course: { select: { teacherId: true } }, _count: { select: { revisions: true } } } }); if (!paper) throw new AppError('EXAM_PAPER_NOT_FOUND', 404, 'Exam paper not found.'); if (actor.role !== Role.SUPER_ADMIN && (actor.role !== Role.TEACHER || paper.course.teacherId !== actor.userId)) throw new AppError('FORBIDDEN_COURSE', 403, 'You can only manage papers for your own courses.'); const revision = await tx.examPaperRevision.create({ data: { paperId, version: paper._count.revisions + 1, ...revisionData(input) } }); await evidence(tx, actor, paperId, 'EXAM_PAPER_REVISION_CREATED'); return revision; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};
