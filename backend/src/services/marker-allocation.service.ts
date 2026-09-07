import { createHash } from 'node:crypto';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { assertCourseAccess } from '@/services/class.service';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { ConfirmMarkerAllocationsInput, PreviewMarkerAllocationsInput } from '@/schemas/exam.schema';

type EffectiveGrant = { markerId: string; audienceIds: string[] };
type ScopeState = { audienceRevision: number; rosterRevision: number; allocationRevision: number; grants: EffectiveGrant[] };

const digest = (state: ScopeState): string => createHash('sha256').update(JSON.stringify(state)).digest('hex');

const allocationWhere = (actor: AuthenticatedUser, courseId: string) => actor.role === Role.SUPER_ADMIN
  ? { deletedAt: null, isActive: true }
  : { deletedAt: null, isActive: true, scope: 'COURSE' as const, courseId, course: { teacherId: actor.userId } };

const resolve = async (db: Prisma.TransactionClient | typeof prisma, examId: string, input: PreviewMarkerAllocationsInput, actor: AuthenticatedUser) => {
  const exam = await db.exam.findUnique({ where: { id: examId }, select: { id: true, courseId: true, paperRevisionId: true, audienceRevision: true, rosterRevision: true, deletedAt: true, audiences: { select: { id: true } } } });
  if (!exam || exam.deletedAt) throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
  await assertCourseAccess(exam.courseId, actor);
  if (!exam.paperRevisionId) throw new AppError('SCOPED_MARKER_ALLOCATIONS_REQUIRED', 409, 'Legacy exams retain their whole-exam marker assignments.');
  const audienceIds = new Set(exam.audiences.map((audience) => audience.id));
  if (!audienceIds.size) throw new AppError('EXAM_AUDIENCE_REQUIRED', 409, 'Configure exam audiences before allocating markers.');
  const groupIds = [...new Set(input.allocations.flatMap((allocation) => allocation.groupIds))];
  const groups = groupIds.length ? await db.markerGroup.findMany({ where: { id: { in: groupIds }, ...allocationWhere(actor, exam.courseId) }, select: { id: true, revision: true, members: { where: { removedAt: null }, select: { markerId: true } } } }) : [];
  if (groups.length !== groupIds.length) throw new AppError('INVALID_MARKER_GROUP_IDS', 400, 'One or more marker groups are unavailable for this exam.');
  const members = new Map(groups.map((group) => [group.id, group.members.map((member) => member.markerId)]));
  const requested = new Map<string, Set<string>>();
  for (const allocation of input.allocations) {
    const selected = allocation.allAudiences ? [...audienceIds] : allocation.audienceIds;
    if (!selected.length || selected.some((id) => !audienceIds.has(id))) throw new AppError('INVALID_EXAM_AUDIENCE_IDS', 400, 'Every allocation audience must belong to this exam.');
    const markerIds = new Set([...allocation.markerIds, ...allocation.groupIds.flatMap((groupId) => members.get(groupId) ?? [])]);
    for (const markerId of markerIds) {
      const grants = requested.get(markerId) ?? new Set<string>();
      selected.forEach((audienceId) => grants.add(audienceId));
      requested.set(markerId, grants);
    }
  }
  const markerIds = [...requested.keys()];
  const active = markerIds.length ? await db.user.findMany({ where: { id: { in: markerIds }, role: Role.MARKER, deletedAt: null }, select: { id: true } }) : [];
  if (!markerIds.length || active.length !== markerIds.length) throw new AppError('INVALID_MARKER_IDS', 400, 'Some markers are missing, inactive, or not assigned the MARKER role.');
  const revision = await db.markerAllocationRevision.count({ where: { examId } });
  const grants = [...requested.entries()].map(([markerId, ids]) => ({ markerId, audienceIds: [...ids].sort() })).sort((a, b) => a.markerId.localeCompare(b.markerId));
  return { exam, groups, state: { audienceRevision: exam.audienceRevision, rosterRevision: exam.rosterRevision, allocationRevision: revision, grants } satisfies ScopeState };
};

export const previewMarkerAllocations = async (examId: string, input: PreviewMarkerAllocationsInput, actor: AuthenticatedUser) => {
  const resolved = await resolve(prisma, examId, input, actor);
  return { ...resolved.state, digest: digest(resolved.state), groupRevisions: resolved.groups.map((group) => ({ id: group.id, revision: group.revision })) };
};

export const confirmMarkerAllocations = async (examId: string, input: ConfirmMarkerAllocationsInput, actor: AuthenticatedUser) => prisma.$transaction(async (tx) => {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${examId}, 0))`);
  const resolved = await resolve(tx, examId, input, actor);
  const current = resolved.state;
  if (current.audienceRevision !== input.expectedAudienceRevision || current.rosterRevision !== input.expectedRosterRevision || current.allocationRevision !== input.expectedAllocationRevision || digest(current) !== input.digest) {
    throw new AppError('MARKER_ALLOCATION_STALE', 409, 'Marker allocation preview is stale. Refresh and try again.');
  }
  const existing = await tx.markerAssignment.findMany({ where: { examId }, select: { markerId: true, audienceGrants: { select: { audienceId: true } } } });
  const beforeState = existing.map((assignment) => ({ markerId: assignment.markerId, audienceIds: assignment.audienceGrants.map((grant) => grant.audienceId).sort() })).sort((a, b) => a.markerId.localeCompare(b.markerId));
  await tx.markerAssignmentAudience.deleteMany({ where: { examId } });
  await tx.markerAssignment.deleteMany({ where: { examId } });
  await tx.markerAssignment.createMany({ data: current.grants.map((grant) => ({ markerId: grant.markerId, examId })) });
  const assignments = await tx.markerAssignment.findMany({ where: { examId }, select: { id: true, markerId: true } });
  await tx.markerAssignmentAudience.createMany({ data: assignments.flatMap((assignment) => (current.grants.find((grant) => grant.markerId === assignment.markerId)?.audienceIds ?? []).map((audienceId) => ({ assignmentId: assignment.id, examId, audienceId }))) });
  await tx.markerAllocationRevision.create({ data: { examId, revision: current.allocationRevision + 1, reason: input.reason, digest: input.digest, beforeState: beforeState as Prisma.InputJsonValue, afterState: current.grants as Prisma.InputJsonValue, actorId: actor.userId } });
  await tx.auditLog.create({ data: { action: 'MARKER_ALLOCATIONS_CONFIRMED', targetType: 'Exam', targetId: examId, metadata: { reason: input.reason, digest: input.digest, before: beforeState, after: current.grants }, ip: null, userAgent: null, actorId: actor.userId, actorRole: actor.role } });
  return { ...current, allocationRevision: current.allocationRevision + 1, digest: digest({ ...current, allocationRevision: current.allocationRevision + 1 }) };
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
