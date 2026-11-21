import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { Role } from '@prisma/client';

const { db, signed, cache } = vi.hoisted(() => ({
  db: {
    exam: { findUnique: vi.fn() }, course: { findUnique: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() }, markerGroup: { findMany: vi.fn() },
    markerAssignment: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    markerAssignmentAudience: { createMany: vi.fn(), deleteMany: vi.fn() },
    markerAllocationRevision: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    submission: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() }, idempotencyRecord: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(), $executeRaw: vi.fn(),
  },
  signed: vi.fn(), cache: new Map<string, unknown>(),
}));
vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/config/env', () => ({ env: { JWT_ACCESS_SECRET: 'http-test-secret', NODE_ENV: 'test' } }));
vi.mock('@/config/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/services/audit.service', () => ({ log: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/stream.service', () => ({ broadcastResultsPublished: vi.fn() }));
vi.mock('@/services/notification.service', () => ({ dispatch: vi.fn() }));
vi.mock('@/services/sms-notification.service', () => ({ sendResultsPublishedNotification: vi.fn() }));
vi.mock('@/utils/r2', () => ({ createR2PresignedGetUrl: signed }));

import { examRoutes } from './exam.routes';
import { submissionRoutes } from './submission.routes';
import { errorHandler } from '@/middleware/error.middleware';
import { COOKIE_ACCESS_TOKEN } from '@/utils/constants';

const ids = {
  exam: '10000000-0000-4000-8000-000000000001',
  teacher: '10000000-0000-4000-8000-000000000002',
  marker: '10000000-0000-4000-8000-000000000003',
  otherTeacher: '10000000-0000-4000-8000-000000000004',
  a: '20000000-0000-4000-8000-000000000001',
  b: '20000000-0000-4000-8000-000000000002',
  online: '20000000-0000-4000-8000-000000000003',
};
const date = new Date('2026-09-01');
let server: Server;
let base: string;
let allowed: string[];
let scoped: boolean;
let revisions: Record<string, unknown>[];
let assignments: { id: string; markerId: string; allAudiences: boolean; audienceGrants: { audienceId: string; source: unknown }[] }[];
const examRow = () => ({
  id: ids.exam, courseId: 'course', title: 'Shared exam', type: 'MCQ', totalMarks: 100,
  paperRevisionId: scoped ? 'paper' : null, paperRevision: { id: 'paper', version: 1 },
  audienceRevision: 1, rosterRevision: 1, deletedAt: null, isPublished: false,
  startTime: date, endTime: new Date('2027-01-01'), paperPdfUrl: null,
  allowTypedAnswers: true, allowPdfUpload: true,
  mcqPayload: { questions: [{ id: 'q1', text: 'Question', order: 1, marks: 1, options: [{ id: 'o1', text: 'Yes', isCorrect: true }, { id: 'o2', text: 'No', isCorrect: false }] }] },
  audiences: [ids.a, ids.b, ids.online].map((id) => ({ id, updatedAt: date })),
});
const rows = () => [ids.a, ids.b, ids.online].map((audienceId, i) => ({
  id: `30000000-0000-4000-8000-00000000000${i + 1}`, examId: ids.exam, userId: `student-${i}`,
  status: 'COMPLETED', answerPdfUrl: `answer-${audienceId}.pdf`, answers: { q1: 'o1' },
  writtenAnswers: null, marks: null, feedback: null, submittedAt: date, gradedAt: null, updatedAt: date,
  user: { id: `student-${i}`, name: `Student ${i}`, email: `student${i}@example.invalid`, indexNumber: i + 1, examParticipants: [{ examId: ids.exam, audienceId }] },
  exam: examRow(),
}));
const allocation = (audienceIds: string[]) => ({ markerIds: [ids.marker], groupIds: [], audienceIds, allAudiences: false });

beforeEach(async () => {
  vi.clearAllMocks(); cache.clear(); allowed = [ids.a]; scoped = true; revisions = [];
  assignments = [{ id: 'assignment', markerId: ids.marker, allAudiences: false, audienceGrants: [{ audienceId: ids.a, source: [] }] }];
  db.$transaction.mockImplementation((callback) => callback(db));
  db.exam.findUnique.mockImplementation(async ({ where }) => where.id === ids.exam ? examRow() : null);
  db.course.findUnique.mockResolvedValue({ id: 'course', teacherId: ids.teacher });
  db.markerAssignment.findFirst.mockImplementation(async ({ where }) => where.markerId === ids.marker && where.examId === ids.exam && allowed.some((id) => !where.audienceGrants.some.audienceId || id === where.audienceGrants.some.audienceId) ? { id: 'assignment' } : null);
  db.markerAssignment.findUnique.mockImplementation(async () => ({ id: 'assignment', marker: { role: Role.MARKER, deletedAt: null } }));
  db.markerAssignment.findMany.mockImplementation(async () => structuredClone(assignments));
  db.markerAssignment.deleteMany.mockImplementation(async () => { assignments = []; });
  db.markerAssignmentAudience.deleteMany.mockImplementation(async () => { allowed = []; });
  db.markerAssignment.createMany.mockImplementation(async ({ data }) => { assignments = data.map((item: object) => ({ ...item, id: 'assignment', audienceGrants: [] })); });
  db.markerAssignmentAudience.createMany.mockImplementation(async ({ data }) => { allowed = data.map((row: { audienceId: string }) => row.audienceId); assignments[0]!.audienceGrants = data; });
  db.user.findMany.mockImplementation(async ({ where }) => where.id.in.map((id: string) => ({ id, name: 'Marker', role: Role.MARKER, deletedAt: null, updatedAt: date })));
  db.markerGroup.findMany.mockResolvedValue([]);
  db.markerAllocationRevision.findFirst.mockImplementation(async ({ where }) => revisions.find((row) => (where.idempotencyKey ? row.idempotencyKey === where.idempotencyKey : row.digest === where.digest) && row.actorId === where.actorId) ?? null);
  db.markerAllocationRevision.count.mockImplementation(async () => revisions.length);
  db.markerAllocationRevision.create.mockImplementation(async ({ data }) => { revisions.push(data); return data; });
  db.markerAllocationRevision.findMany.mockImplementation(async () => structuredClone(revisions).reverse());
  db.submission.findMany.mockImplementation(async ({ where }) => {
    if (where.userId) return rows().map((row) => ({ ...row, marks: 92, feedback: 'Unpublished feedback', gradedAt: date }));
    const predicate = where.user?.examParticipants?.some;
    const visible = predicate?.audience?.markerAssignmentAudiences?.some;
    return rows().filter((row) => !visible || (predicate.examId === ids.exam && visible.examId === ids.exam && visible.assignment.markerId === ids.marker && allowed.includes(row.user.examParticipants[0]!.audienceId)));
  });
  db.submission.findUnique.mockImplementation(async ({ where }) => rows().find((row) => row.id === where.id) ?? null);
  db.submission.count.mockImplementation(async ({ where }) => rows().filter((row) => where.user.examParticipants.some.audienceId.in.includes(row.user.examParticipants[0]!.audienceId)).length);
  db.submission.update.mockImplementation(async ({ where, data }) => ({ ...rows().find((row) => row.id === where.id), ...data }));
  db.idempotencyRecord.findUnique.mockImplementation(async ({ where }) => cache.get(where.key) ?? null);
  db.idempotencyRecord.create.mockImplementation(async ({ data }) => { cache.set(data.key, data); return data; });
  signed.mockImplementation(async (key) => `https://signed.example/${key}`);
  const app = express(); app.use(express.json(), cookieParser());
  app.use('/api/exams', examRoutes); app.use('/api/submissions', submissionRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });

const request = async (path: string, role: Role, method = 'GET', body?: unknown, key?: string, userId = role === Role.MARKER ? ids.marker : ids.teacher) => {
  const token = jwt.sign({ userId, role }, 'http-test-secret');
  db.user.findUnique.mockResolvedValue({ role, deletedAt: null, tokenVersion: 0, mustChangePassword: false });
  const response = await fetch(`${base}${path}`, { method, headers: { Cookie: `${COOKIE_ACCESS_TOKEN}=${token}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() as { data: { [key: string]: unknown } & Array<{ id: string; marks: unknown; feedback: unknown; gradedAt: unknown }>; count: number } };
};
const markerPath = `/api/exams/${ids.exam}/markers`;

describe('scoped marker allocation HTTP contract and answer privacy', () => {
  it('supports preview, scoped PUT, history and a durable retry without a generic response cache', async () => {
    const selections = { allocations: [allocation([ids.b])] };
    const preview = await request(`${markerPath}/preview`, Role.TEACHER, 'POST', selections);
    expect(preview.status).toBe(200);
    expect(preview.body.data.markers).toEqual([{ id: ids.marker, name: 'Marker', audienceIds: [ids.b], allAudiences: false, ungradedCount: 1 }]);
    const data = preview.body.data;
    const input = { ...selections, digest: data.digest, expectedAudienceRevision: data.audienceRevision, expectedRosterRevision: data.rosterRevision, expectedAllocationRevision: data.allocationRevision, reason: 'Move to center B' };
    const key = '40000000-0000-4000-8000-000000000005';
    expect((await request(markerPath, Role.TEACHER, 'PUT', input)).status).toBe(400);
    const confirmed = await request(markerPath, Role.TEACHER, 'PUT', input, key);
    expect(confirmed.status).toBe(200);
    expect((await request(markerPath, Role.TEACHER, 'PUT', input, key)).body).toEqual(confirmed.body);
    expect((await request(markerPath, Role.TEACHER, 'PUT', { ...input, reason: 'Changed input' }, key)).status).toBe(409);
    expect(revisions).toHaveLength(1);
    const after = await request(`/api/submissions/exam/${ids.exam}`, Role.MARKER);
    expect(after.body.count).toBe(1);
    expect(after.body.data.map((row) => row.id)).toEqual([rows()[1]!.id]);
    expect((await request(`/api/submissions/${rows()[0]!.id}/marks`, Role.MARKER, 'PATCH', { marks: 80 }, ids.a)).status).toBe(403);
    expect((await request(`${markerPath}/history`, Role.TEACHER)).body.count).toBe(1);
    expect((await request(`${markerPath}/history`, Role.TEACHER, 'GET', undefined, undefined, ids.otherTeacher)).status).toBe(403);
    expect((await request(`${markerPath}/preview`, Role.MARKER, 'POST', selections)).status).toBe(403);
    expect((await request(markerPath, Role.TEACHER, 'PUT', input, key, ids.otherTeacher)).status).toBe(403);
  });

  it('denies legacy replacement for scoped exams while preserving legacy replacement', async () => {
    const key = '40000000-0000-4000-8000-000000000001';
    cache.set(key, { responseCode: 200, responseBody: { status: 'success', data: 'old legacy response' } });
    expect((await request(markerPath, Role.TEACHER, 'PUT', { markerIds: [ids.marker] }, key)).status).toBe(409);
    scoped = false;
    expect((await request(markerPath, Role.TEACHER, 'PUT', { markerIds: [ids.marker] }, '40000000-0000-4000-8000-000000000002')).status).toBe(200);
  });

  it('lists, counts and signs only the assigned center and denies direct grading of another center or online audience', async () => {
    const result = await request(`/api/submissions/exam/${ids.exam}`, Role.MARKER);
    expect(result.status).toBe(200); expect(result.body.count).toBe(1);
    expect(result.body.data.map((row: { id: string }) => row.id)).toEqual([rows()[0]!.id]);
    expect(signed.mock.calls).toEqual([[`answer-${ids.a}.pdf`, expect.any(Number)]]);
    for (const row of rows().slice(1)) {
      expect((await request(`/api/submissions/${row.id}/marks`, Role.MARKER, 'PATCH', { marks: 80 }, row.id)).status).toBe(403);
    }
    expect(db.submission.update).not.toHaveBeenCalled();
  });

  it('denies fresh list/downloads and cached grade retries immediately after grant revocation', async () => {
    const row = rows()[0]!;
    const key = '40000000-0000-4000-8000-000000000003';
    expect((await request(`/api/submissions/${row.id}/marks`, Role.MARKER, 'PATCH', { marks: 80 }, key)).status).toBe(200);
    allowed = [];
    expect((await request(`/api/submissions/exam/${ids.exam}`, Role.MARKER)).status).toBe(403);
    expect((await request(`/api/submissions/${row.id}/marks`, Role.MARKER, 'PATCH', { marks: 80 }, key)).status).toBe(403);
    expect(signed).not.toHaveBeenCalled();
  });

  it('cannot replay another submission response by reusing its idempotency key on an authorized submission', async () => {
    const key = '40000000-0000-4000-8000-000000000004';
    allowed = [ids.b];
    expect((await request(`/api/submissions/${rows()[1]!.id}/marks`, Role.MARKER, 'PATCH', { marks: 80 }, key)).status).toBe(200);
    allowed = [ids.a];
    const result = await request(`/api/submissions/${rows()[0]!.id}/marks`, Role.MARKER, 'PATCH', { marks: 80 }, key);
    expect(result.status).toBe(200);
    expect(result.body.data.id).toBe(rows()[0]!.id);
  });

  it('retains marker answer-key and student unpublished-result redaction', async () => {
    const detail = await request(`/api/exams/${ids.exam}`, Role.MARKER);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body.data.mcqPayload)).not.toContain('isCorrect');
    const mine = await request('/api/submissions/mine', Role.STUDENT);
    expect(mine.status).toBe(200);
    expect(mine.body.data.every((row: { marks: unknown; feedback: unknown; gradedAt: unknown }) => row.marks === null && row.feedback === null && row.gradedAt === null)).toBe(true);
  });
});
