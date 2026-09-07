import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
const h = vi.hoisted(() => ({ course: vi.fn(), paper: vi.fn(), paperFind: vi.fn(), revision: vi.fn(), tx: vi.fn(), audit: vi.fn(), lock: vi.fn() }));
const tx = { examPaper: { create: h.paper, findUnique: h.paperFind }, examPaperRevision: { create: h.revision }, auditLog: { create: h.audit }, $executeRaw: h.lock };
vi.mock('@/config/database', () => ({ prisma: { course: { findUnique: h.course }, examPaper: { findUnique: h.paperFind }, $transaction: h.tx } }));
import { createExamPaper, createExamPaperRevision } from './exam-paper.service';
const owner = { userId: 'teacher-1', role: Role.TEACHER }, other = { userId: 'teacher-2', role: Role.TEACHER };
const revision = { type: 'HYBRID' as const, totalMarks: 100, paperPdfUrl: null, mcqPayload: null, allowTypedAnswers: true, allowPdfUpload: true };
beforeEach(() => { vi.resetAllMocks(); h.tx.mockImplementation(async (cb: (x: typeof tx) => unknown) => cb(tx)); h.course.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }); h.paper.mockResolvedValue({ id: 'paper-1' }); h.paperFind.mockResolvedValue({ id: 'paper-1', courseId: 'course-1', course: { teacherId: 'teacher-1' }, _count: { revisions: 1 } }); h.revision.mockResolvedValue({ id: 'revision-1' }); h.audit.mockResolvedValue({ id: 'audit-1' }); });
describe('exam paper revisions', () => {
	it('creates an owner paper with the first immutable revision and durable evidence', async () => { await createExamPaper({ courseId: 'course-1', title: 'Mock', revision }, owner); expect(h.paper).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ courseId: 'course-1', createdById: 'teacher-1' }) })); expect(h.revision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paperId: 'paper-1', version: 1, type: 'HYBRID', totalMarks: 100 }) })); expect(h.audit).toHaveBeenCalled(); });
	it('denies a cross-course teacher', async () => { await expect(createExamPaper({ courseId: 'course-1', title: 'Mock', revision }, other)).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 }); });
	it('appends rather than mutates a revision', async () => { await createExamPaperRevision('paper-1', revision, owner); expect(h.revision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paperId: 'paper-1', version: 2 }) })); });
	it('allocates a revision while holding the paper transaction lock', async () => { await createExamPaperRevision('paper-1', revision, owner); expect(h.lock).toHaveBeenCalled(); });
});
