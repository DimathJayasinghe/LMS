import { createHash } from 'node:crypto';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { assertCourseAccess } from '@/services/class.service';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { ConfirmMarkerAllocationsInput, PreviewMarkerAllocationsInput } from '@/schemas/exam.schema';

type Db = Prisma.TransactionClient;
type Source = { type: 'DIRECT' | 'GROUP'; id: string; allAudiences: boolean; audienceIds: string[] };
type Grant = { markerId: string; audienceIds: string[]; allAudiences: boolean; sources: Source[] };
const canonical = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
};
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const uniqueSources = (sources: Source[]): Source[] => [...new Map(sources.map((source) => [JSON.stringify(source), source])).values()]
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const authorize = async (db: Db, examId: string, actor: AuthenticatedUser) => {
  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: { id: true, courseId: true, paperRevisionId: true, paperRevision: { select: { id: true, version: true } }, audienceRevision: true, rosterRevision: true, deletedAt: true, audiences: { select: { id: true, updatedAt: true } } },
  });
  if (!exam || exam.deletedAt) throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
  await assertCourseAccess(exam.courseId, actor, db);
  if (!exam.paperRevisionId) throw new AppError('SCOPED_MARKER_ALLOCATIONS_REQUIRED', 409, 'Legacy exams retain their whole-exam marker assignments.');
  return exam;
};

const resolve = async (db: Db, exam: Awaited<ReturnType<typeof authorize>>, input: PreviewMarkerAllocationsInput, actor: AuthenticatedUser) => {
  const audienceIds = new Set(exam.audiences.map((audience) => audience.id));
  if (!audienceIds.size && input.allocations.length) throw new AppError('EXAM_AUDIENCE_REQUIRED', 409, 'Configure exam audiences before allocating markers.');
  const groupIds = [...new Set(input.allocations.flatMap((allocation) => allocation.groupIds))];
  const groups = groupIds.length ? await db.markerGroup.findMany({
    where: { id: { in: groupIds }, deletedAt: null, isActive: true, ...(actor.role === Role.SUPER_ADMIN ? {} : { scope: 'COURSE', courseId: exam.courseId, course: { teacherId: actor.userId } }) },
    select: { id: true, revision: true, updatedAt: true, members: { where: { removedAt: null }, select: { markerId: true, addedAt: true, marker: { select: { id: true, role: true, deletedAt: true, updatedAt: true } } } } },
  }) : [];
  if (groups.length !== groupIds.length) throw new AppError('INVALID_MARKER_GROUP_IDS', 400, 'One or more marker groups are unavailable for this exam.');
  const requested = new Map<string, Grant>();
  const add = (markerId: string, source: Source, selected: string[]) => {
    const grant = requested.get(markerId) ?? { markerId, audienceIds: [], allAudiences: false, sources: [] };
    grant.audienceIds = [...new Set([...grant.audienceIds, ...selected])].sort();
    grant.allAudiences ||= source.allAudiences;
    grant.sources.push(source);
    requested.set(markerId, grant);
  };
  for (const allocation of input.allocations) {
    const selected = [...new Set(allocation.allAudiences ? audienceIds : allocation.audienceIds)].sort();
    if (!selected.length || selected.some((id) => !audienceIds.has(id)) || (allocation.allAudiences && allocation.audienceIds.length)) {
      throw new AppError('INVALID_EXAM_AUDIENCE_IDS', 400, 'Every allocation audience must belong to this exam.');
    }
    for (const id of allocation.markerIds) add(id, { type: 'DIRECT', id, allAudiences: allocation.allAudiences, audienceIds: [...allocation.audienceIds].sort() }, selected);
    for (const id of allocation.groupIds) {
      for (const member of groups.find((group) => group.id === id)!.members) {
        add(member.markerId, { type: 'GROUP', id, allAudiences: allocation.allAudiences, audienceIds: [...allocation.audienceIds].sort() }, selected);
      }
    }
  }
  const markerIds = [...requested.keys()];
  const markers = markerIds.length ? await db.user.findMany({ where: { id: { in: markerIds }, role: Role.MARKER, deletedAt: null }, select: { id: true, name: true, role: true, deletedAt: true, updatedAt: true } }) : [];
  if ((input.allocations.length && !markerIds.length) || markers.length !== markerIds.length) throw new AppError('INVALID_MARKER_IDS', 400, 'Some markers are missing, inactive, or not assigned the MARKER role.');
  const proposed = [...requested.values()].map((grant) => ({ ...grant, sources: uniqueSources(grant.sources) })).sort((a, b) => a.markerId.localeCompare(b.markerId));
  const existing = await db.markerAssignment.findMany({ where: { examId: exam.id }, select: { markerId: true, allAudiences: true, audienceGrants: { select: { audienceId: true, source: true } } } });
  const current: Grant[] = existing.map((assignment) => ({
    markerId: assignment.markerId, allAudiences: assignment.allAudiences,
    audienceIds: assignment.audienceGrants.map((grant) => grant.audienceId).sort(),
    sources: uniqueSources(assignment.audienceGrants.flatMap((grant) => Array.isArray(grant.source) ? grant.source as unknown as Source[] : [])),
  })).sort((a, b) => a.markerId.localeCompare(b.markerId));
  const evidence = {
    examId: exam.id, paperRevision: exam.paperRevision!, audienceRevision: exam.audienceRevision,
    rosterRevision: exam.rosterRevision, allocationRevision: await db.markerAllocationRevision.count({ where: { examId: exam.id } }),
    audiences: [...exam.audiences].sort(byId),
    groups: groups.sort(byId).map((group) => ({ ...group, members: [...group.members].sort((a, b) => a.markerId.localeCompare(b.markerId)) })),
    markers: markers.sort(byId), sourceSelections: input.allocations,
    diff: { current, proposed },
  };
  return { evidence, markers, grants: proposed, digest: hash(evidence) };
};

export const previewMarkerAllocations = async (examId: string, input: PreviewMarkerAllocationsInput, actor: AuthenticatedUser) => prisma.$transaction(async (tx) => {
  const resolved = await resolve(tx, await authorize(tx, examId, actor), input, actor);
  const { evidence } = resolved;
  const markers = await Promise.all(resolved.grants.map(async (grant) => ({
    id: grant.markerId, name: resolved.markers.find((marker) => marker.id === grant.markerId)!.name,
    audienceIds: grant.audienceIds, allAudiences: grant.allAudiences,
    ungradedCount: await tx.submission.count({ where: { examId, status: 'COMPLETED', marks: null, user: { examParticipants: { some: { examId, audienceId: { in: grant.audienceIds } } } } } }),
  })));
  // Account and group/member version evidence stays server-side; staff receive
  // only the identity and allocation fields needed to review this change.
  return { paperRevision: evidence.paperRevision, audienceRevision: evidence.audienceRevision, rosterRevision: evidence.rosterRevision, allocationRevision: evidence.allocationRevision, markers, diff: evidence.diff, digest: resolved.digest };
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

export const confirmMarkerAllocations = async (examId: string, input: ConfirmMarkerAllocationsInput, actor: AuthenticatedUser, idempotencyKey?: string) => prisma.$transaction(async (tx) => {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${examId}, 0))`);
  const exam = await authorize(tx, examId, actor);
  // Keys (or a consumed digest for internal callers) are scoped to exam + actor.
  // Replaying reports its original result without reapplying removed grants.
  const previous = await tx.markerAllocationRevision.findFirst({ where: { examId, actorId: actor.userId, ...(idempotencyKey ? { idempotencyKey } : { digest: input.digest }) } });
  if (previous) {
    if (hash(previous.requestState) !== hash(json(input))) throw new AppError('MARKER_ALLOCATION_STALE', 409, 'This preview was confirmed with a different request.');
    return { allocationRevision: previous.revision, digest: previous.digest, grants: previous.afterState };
  }
  const resolved = await resolve(tx, exam, input, actor);
  const { evidence } = resolved;
  if (evidence.audienceRevision !== input.expectedAudienceRevision || evidence.rosterRevision !== input.expectedRosterRevision || evidence.allocationRevision !== input.expectedAllocationRevision || resolved.digest !== input.digest) {
    throw new AppError('MARKER_ALLOCATION_STALE', 409, 'Marker allocation preview is stale. Refresh and try again.');
  }
  await tx.markerAssignmentAudience.deleteMany({ where: { examId } });
  await tx.markerAssignment.deleteMany({ where: { examId } });
  if (resolved.grants.length) {
    await tx.markerAssignment.createMany({ data: resolved.grants.map((grant) => ({ markerId: grant.markerId, examId, allAudiences: grant.allAudiences })) });
    const assignments = await tx.markerAssignment.findMany({ where: { examId }, select: { id: true, markerId: true } });
    await tx.markerAssignmentAudience.createMany({ data: assignments.flatMap((assignment) => {
      const grant = resolved.grants.find((item) => item.markerId === assignment.markerId)!;
      return grant.audienceIds.map((audienceId) => ({ assignmentId: assignment.id, examId, audienceId, source: json(grant.sources) }));
    }) });
  }
  const revision = evidence.allocationRevision + 1;
  await tx.markerAllocationRevision.create({ data: { examId, revision, reason: input.reason, digest: input.digest, idempotencyKey, beforeState: json(evidence.diff.current), afterState: json(evidence.diff.proposed), sourceState: json(input.allocations), evidenceState: json(evidence), requestState: json(input), actorId: actor.userId } });
  await tx.auditLog.create({ data: { action: 'MARKER_ALLOCATIONS_CONFIRMED', targetType: 'Exam', targetId: examId, metadata: json({ reason: input.reason, digest: input.digest, diff: evidence.diff }), ip: null, userAgent: null, actorId: actor.userId, actorRole: actor.role } });
  return { allocationRevision: revision, digest: input.digest, grants: json(evidence.diff.proposed) };
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

export const listMarkerAllocationHistory = async (examId: string, actor: AuthenticatedUser) => {
  await authorize(prisma, examId, actor);
  return prisma.markerAllocationRevision.findMany({ where: { examId }, select: { id: true, revision: true, reason: true, digest: true, sourceState: true, beforeState: true, afterState: true, createdAt: true, actor: { select: { id: true, name: true } } }, orderBy: { revision: 'desc' } });
};
