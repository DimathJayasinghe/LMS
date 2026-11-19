import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import { previewMarkerAllocationsSchema } from '@/schemas/exam.schema';

const { db, courseAccess } = vi.hoisted(() => ({
  db: {
    exam: { findUnique: vi.fn() },
    markerGroup: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    submission: { count: vi.fn() },
    markerAssignment: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    markerAssignmentAudience: { createMany: vi.fn(), deleteMany: vi.fn() },
    markerAllocationRevision: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(), $executeRaw: vi.fn(),
  },
  courseAccess: vi.fn(),
}));
vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess: courseAccess }));
import { confirmMarkerAllocations, listMarkerAllocationHistory, previewMarkerAllocations } from './marker-allocation.service';

const actor = { userId: 'teacher', role: Role.TEACHER };
const time = new Date('2026-09-01');
const marker = (id: string) => ({ id, name: id, role: Role.MARKER, deletedAt: null, updatedAt: time });
const selection = (overrides = {}) => ({ markerIds: ['m1'], groupIds: [], audienceIds: ['a'], allAudiences: false, ...overrides });
let exam: { id: string; courseId: string; paperRevisionId: string; paperRevision: { id: string; version: number }; audienceRevision: number; rosterRevision: number; deletedAt: null; audiences: { id: string; updatedAt: Date }[] };
let groups: { id: string; revision: number; updatedAt: Date; members: { markerId: string; addedAt: Date; marker: ReturnType<typeof marker> }[] }[];
let assignments: { id: string; markerId: string; allAudiences: boolean; audienceGrants: { audienceId: string; allAudiences: boolean; source: unknown[] }[] }[];
let revisions: Record<string, unknown>[];

beforeEach(() => {
  vi.resetAllMocks();
  exam = { id: 'exam', courseId: 'course', paperRevisionId: 'paper', paperRevision: { id: 'paper', version: 1 }, audienceRevision: 1, rosterRevision: 2, deletedAt: null, audiences: [{ id: 'a', updatedAt: time }, { id: 'b', updatedAt: time }, { id: 'online', updatedAt: time }] };
  groups = [{ id: 'group', revision: 1, updatedAt: time, members: ['m1', 'm2'].map((id) => ({ markerId: id, addedAt: time, marker: marker(id) })) }];
  assignments = []; revisions = [];
  db.$transaction.mockImplementation((callback) => callback(db));
  db.exam.findUnique.mockImplementation(async () => structuredClone(exam));
  db.markerGroup.findMany.mockImplementation(async () => structuredClone(groups));
  db.user.findMany.mockImplementation(async ({ where }) => where.id.in.map(marker));
  db.submission.count.mockImplementation(async ({ where }) => where.user.examParticipants.some.audienceId.in.length * 2);
  db.markerAllocationRevision.count.mockImplementation(async () => revisions.length);
  db.markerAllocationRevision.findFirst.mockImplementation(async ({ where }) => revisions.find((row) => row.digest === where.digest && row.actorId === where.actorId) ?? null);
  db.markerAllocationRevision.findMany.mockImplementation(async () => structuredClone(revisions).reverse());
  db.markerAllocationRevision.create.mockImplementation(async ({ data }) => { const row = structuredClone(data); revisions.push(row); return row; });
  db.markerAssignment.findMany.mockImplementation(async () => structuredClone(assignments));
  db.markerAssignment.deleteMany.mockImplementation(async () => { assignments = []; });
  db.markerAssignment.createMany.mockImplementation(async ({ data }) => { assignments = data.map((item: object, index: number) => ({ ...item, id: `assignment-${index}`, audienceGrants: [] })); });
  db.markerAssignmentAudience.createMany.mockImplementation(async ({ data }) => {
    for (const row of data) assignments.find((item) => item.id === row.assignmentId)!.audienceGrants.push(row);
  });
});

const confirmInput = async (allocations = [selection()]) => {
  const preview = await previewMarkerAllocations('exam', { allocations }, actor);
  return { allocations, digest: preview.digest, expectedAudienceRevision: preview.audienceRevision, expectedRosterRevision: preview.rosterRevision, expectedAllocationRevision: preview.allocationRevision, reason: 'Split marking' };
};

describe('scoped marker allocation evidence and replacement', () => {
  it('deduplicates overlapping direct/group membership and returns minimal identities and scoped work counts', async () => {
    const result = await previewMarkerAllocations('exam', { allocations: [selection(), selection({ markerIds: [], groupIds: ['group'], audienceIds: ['b'] })] }, actor);
    expect(result.markers).toEqual([
      { id: 'm1', name: 'm1', audienceIds: ['a', 'b'], allAudiences: false, ungradedCount: 4 },
      { id: 'm2', name: 'm2', audienceIds: ['b'], allAudiences: false, ungradedCount: 2 },
    ]);
  });

  it('persists broad intent, selected sources, immutable evidence and the explicit before/after diff', async () => {
    const input = await confirmInput([selection({ audienceIds: [], allAudiences: true }), selection({ markerIds: [], groupIds: ['group'] })]);
    const result = await confirmMarkerAllocations('exam', input, actor);
    expect(result.allocationRevision).toBe(1);
    expect(assignments.find((item) => item.markerId === 'm1')?.allAudiences).toBe(true);
    expect(revisions[0]!).toMatchObject({ sourceState: input.allocations, beforeState: [], afterState: expect.arrayContaining([expect.objectContaining({ markerId: 'm1', allAudiences: true, audienceIds: ['a', 'b', 'online'] })]), evidenceState: { diff: { current: [], proposed: expect.any(Array) }, paperRevision: { id: 'paper', version: 1 }, rosterRevision: 2 } });
  });

  it('freezes group resolution after confirmation and retains historical sources on removal', async () => {
    await confirmMarkerAllocations('exam', await confirmInput([selection({ markerIds: [], groupIds: ['group'] })]), actor);
    groups[0]!.members = [];
    expect(assignments.map((item) => item.markerId)).toEqual(['m1', 'm2']);
    const input = await confirmInput([selection({ markerIds: ['m2'] })]);
    await confirmMarkerAllocations('exam', input, actor);
    expect(assignments.map((item) => item.markerId)).toEqual(['m2']);
    const history = await listMarkerAllocationHistory('exam', actor);
    expect(history).toHaveLength(2);
    expect(revisions[0]!.sourceState).toEqual([selection({ markerIds: [], groupIds: ['group'] })]);
    expect(revisions[1]!.beforeState).toEqual(expect.arrayContaining([expect.objectContaining({ markerId: 'm1', sources: expect.arrayContaining([expect.objectContaining({ type: 'GROUP', id: 'group' })]) })]));
  });

  it('allows explicit remove-all while rejecting an empty restricted audience', async () => {
    expect(previewMarkerAllocationsSchema.safeParse({ allocations: [] }).success).toBe(true);
    await confirmMarkerAllocations('exam', await confirmInput(), actor);
    await confirmMarkerAllocations('exam', await confirmInput([]), actor);
    expect(assignments).toEqual([]);
    await expect(previewMarkerAllocations('exam', { allocations: [selection({ audienceIds: [] })] }, actor)).rejects.toMatchObject({ code: 'INVALID_EXAM_AUDIENCE_IDS' });
  });

  it.each(['foreign-exam-audience', 'other-teacher-audience'])('rejects injected audience %s', async (audienceId) => {
    await expect(previewMarkerAllocations('exam', { allocations: [selection({ audienceIds: [audienceId] })] }, actor)).rejects.toMatchObject({ code: 'INVALID_EXAM_AUDIENCE_IDS' });
  });

  it('rejects unavailable teacher groups and inactive markers', async () => {
    groups = [];
    await expect(previewMarkerAllocations('exam', { allocations: [selection({ groupIds: ['foreign'] })] }, actor)).rejects.toMatchObject({ code: 'INVALID_MARKER_GROUP_IDS' });
    db.user.findMany.mockResolvedValue([]);
    await expect(previewMarkerAllocations('exam', { allocations: [selection()] }, actor)).rejects.toMatchObject({ code: 'INVALID_MARKER_IDS' });
  });

  it.each(['paper', 'audience', 'roster', 'group', 'member', 'marker', 'current', 'source', 'broad'])('invalidates preview when %s state changes', async (change) => {
    const input = await confirmInput([selection({ groupIds: ['group'] })]);
    if (change === 'paper') exam.paperRevision.version++;
    if (change === 'audience') exam.audiences[0]!.updatedAt = new Date('2026-09-02');
    if (change === 'roster') exam.rosterRevision++;
    if (change === 'group') groups[0]!.revision++;
    if (change === 'member') groups[0]!.members[0]!.addedAt = new Date('2026-09-02');
    if (change === 'marker') db.user.findMany.mockImplementation(async ({ where }) => where.id.in.map((id: string) => ({ ...marker(id), updatedAt: new Date('2026-09-02') })));
    if (change === 'current') assignments.push({ id: 'unexpected', markerId: 'm3', allAudiences: false, audienceGrants: [{ audienceId: 'b', allAudiences: false, source: [] }] });
    if (change === 'source') input.allocations.push(selection({ markerIds: [], groupIds: ['group'], audienceIds: ['a'] }));
    if (change === 'broad') { input.allocations[0]!.allAudiences = true; input.allocations[0]!.audienceIds = []; }
    await expect(confirmMarkerAllocations('exam', input, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect(revisions).toHaveLength(0);
  });

  it('binds an empty group source selection even when it produces no grants', async () => {
    groups[0]!.members = [];
    const withGroup = await previewMarkerAllocations('exam', { allocations: [selection(), selection({ markerIds: [], groupIds: ['group'] })] }, actor);
    const changed = await previewMarkerAllocations('exam', { allocations: [selection(), selection({ markerIds: [], groupIds: ['group'], audienceIds: ['b'] })] }, actor);
    expect(changed.digest).not.toBe(withGroup.digest);
  });

  it('replays the same confirmed request durably without adding a revision or restoring revoked grants', async () => {
    const input = await confirmInput();
    const original = await confirmMarkerAllocations('exam', input, actor);
    // PostgreSQL JSONB does not preserve insertion order of object keys.
    revisions[0]!.requestState = Object.fromEntries(Object.entries(revisions[0]!.requestState as object).reverse());
    await confirmMarkerAllocations('exam', await confirmInput([selection({ markerIds: ['m2'] })]), actor);
    const retry = await confirmMarkerAllocations('exam', input, actor);
    expect(retry).toEqual(original);
    expect(revisions).toHaveLength(2);
    expect(assignments.map((item) => item.markerId)).toEqual(['m2']);
    await expect(confirmMarkerAllocations('exam', { ...input, reason: 'Changed request' }, actor)).rejects.toMatchObject({ statusCode: 409 });
  });
});
