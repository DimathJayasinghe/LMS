import { Role, type Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION, DEFAULT_ORGANIZATION_ID } from '@/utils/constants';
import { reassignCourseTeacher } from '@/services/class.service';
import { listHandoverDependencies, listOrphanedClasses, type OrphanedGroup } from '@/services/handover-dependencies.service';
import { findSlotConflicts, type SlotRow } from '@/services/handover-conflicts';
import { logInTransaction } from '@/services/audit.service';
import { createSettingsReader, organizationForUser } from '@/services/settings.service';
import type { HandoverOrphanedInput } from '@/schemas/user.schema';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { AuditContext } from '@/types/audit.types';

export interface HandoverRequest {
  /** One new teacher per class. */
  handover?: { courseId: string; toTeacherId: string }[];
  /** One new teacher for every class; an entry in `handover` for a class wins over it. */
  handoverAllTo?: string;
}

export interface HandoverMove {
  courseId: string;
  courseName: string;
  toTeacherId: string;
}

export interface HandoverOptions {
  lookaheadDays: number;
  now: Date;
  /** The organization setting `identity.staffDeactivate.requireHandover`; off lets an account leave its classes behind. */
  required: boolean;
  /** A marker with open marking is refused; off for the hand-over of an account that already left. */
  refuseOpenMarking: boolean;
}

const slotSelect = { id: true, courseId: true, dayOfWeek: true, startTime: true, durationMinutes: true } as const;

/** Which new teacher takes each class; a class nobody was named for stops the whole thing. */
const planMoves = (courses: { id: string; name: string }[], request: HandoverRequest): HandoverMove[] => {
  const owned = new Set(courses.map((course) => course.id));
  const named = new Map<string, string>();
  for (const entry of request.handover ?? []) {
    if (!owned.has(entry.courseId)) {
      throw new AppError('HANDOVER_COURSE_NOT_OWNED', 400, 'A class in the hand-over does not belong to this account.');
    }
    named.set(entry.courseId, entry.toTeacherId);
  }
  return courses.flatMap((course) => {
    const toTeacherId = named.get(course.id) ?? request.handoverAllTo;
    return toTeacherId ? [{ courseId: course.id, courseName: course.name, toTeacherId }] : [];
  });
};

const assertReceivers = async (tx: Prisma.TransactionClient, leaver: { id: string; organizationId: string }, moves: HandoverMove[]): Promise<void> => {
  const ids = [...new Set(moves.map((move) => move.toTeacherId))];
  const found = ids.includes(leaver.id)
    ? []
    : await tx.user.findMany({ where: { id: { in: ids }, role: Role.TEACHER, deletedAt: null, organizationId: leaver.organizationId }, select: { id: true } });
  if (found.length !== ids.length) {
    throw new AppError('INVALID_HANDOVER_TARGET', 400, 'Choose active teachers of this organization, other than the one leaving.');
  }
};

const assertNoClashes = async (tx: Prisma.TransactionClient, moves: HandoverMove[]): Promise<void> => {
  const moved = moves.map((move) => move.courseId);
  const receivers = [...new Set(moves.map((move) => move.toTeacherId))];
  const [moving, receiving] = await Promise.all([
    tx.timetableSlot.findMany({ where: { isActive: true, courseId: { in: moved } }, select: { ...slotSelect, course: { select: { name: true } } } }),
    tx.timetableSlot.findMany({ where: { isActive: true, course: { teacherId: { in: receivers }, id: { notIn: moved } } }, select: { ...slotSelect, course: { select: { name: true, teacherId: true } } } }),
  ]);
  const row = (slot: (typeof moving)[number]): SlotRow => ({ ...slot, courseName: slot.course.name });
  const conflicts = findSlotConflicts(
    moves,
    moving.map(row),
    receiving.map((slot) => ({ ...row(slot), teacherId: slot.course.teacherId })),
  );
  if (conflicts.length > 0) {
    throw new AppError('HANDOVER_SLOT_CONFLICT', 409, 'The new teacher already teaches at one of these times. Choose another teacher or change the timetable first.', { conflicts });
  }
};

/**
 * The hand-over inside the caller's transaction, so the account change and the new owners of its classes commit together
 * or not at all. Without a hand-over for every running class the answer is 409 TEACHER_HAS_CLASSES with the full list;
 * the checks (who receives, timetable clashes) all run before the first class moves. Sessions, exams and marking follow a
 * class because they belong to it, so the old teacher stops having access at the same instant.
 */
export const applyHandover = async (
  tx: Prisma.TransactionClient,
  leaver: { id: string; organizationId: string },
  request: HandoverRequest,
  options: HandoverOptions,
): Promise<HandoverMove[]> => {
  if (!options.required) return [];

  const dependencies = await listHandoverDependencies(tx, leaver.id, { lookaheadDays: options.lookaheadDays, now: options.now });
  if (options.refuseOpenMarking && dependencies.markerAllocations.length > 0) {
    throw new AppError('MARKER_HAS_ALLOCATIONS', 409, 'This marker still has marking to do. Release or reassign it first.', dependencies);
  }
  if (dependencies.courses.length === 0) return [];

  const moves = planMoves(dependencies.courses, request);
  if (moves.length < dependencies.courses.length) {
    throw new AppError('TEACHER_HAS_CLASSES', 409, 'This teacher still has classes. Choose who takes them over.', dependencies);
  }

  await assertReceivers(tx, leaver, moves);
  await assertNoClashes(tx, moves);
  for (const move of moves) await reassignCourseTeacher(tx, move.courseId, move.toTeacherId);
  return moves;
};

const assertOwner = (actor: AuthenticatedUser): void => {
  if (actor.role !== Role.SUPER_ADMIN) throw new AppError('FORBIDDEN', 403, 'Only the owner can hand over classes.');
};

/** Active classes whose teacher left (deactivated before the hand-over rule existed, or moved to another role). */
export const getOrphanedClasses = async (actor: AuthenticatedUser): Promise<OrphanedGroup[]> => {
  assertOwner(actor);
  return listOrphanedClasses(await organizationForUser(actor.userId));
};

/**
 * Hands the classes of an account that already left to working teachers: the one-click fix for classes left behind
 * before a leaving teacher had to hand over. Refuses an account that is still an active teacher, since the way to move
 * those is the deactivation or role change itself.
 */
export const handOverOrphaned = async (
  id: string,
  input: HandoverOrphanedInput,
  actor: AuthenticatedUser,
  context: AuditContext,
): Promise<{ handedOver: HandoverMove[] }> => {
  assertOwner(actor);
  const leaver = await prisma.user.findUnique({ where: { id }, select: { role: true, deletedAt: true, organizationId: true } });
  if (!leaver) throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
  if (leaver.deletedAt === null && leaver.role === Role.TEACHER) {
    throw new AppError('TEACHER_STILL_ACTIVE', 409, 'This teacher is still working. Hand the classes over when you deactivate the account or change its role.');
  }

  const organizationId = leaver.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const setting = createSettingsReader(organizationId);
  const [lookaheadDays, defaultMonth] = await Promise.all([setting('identity.handoverLookaheadDays'), setting('handover.defaultEffectiveMonth')]);

  return prisma.$transaction(async (tx) => {
    const handedOver = await applyHandover(tx, { id, organizationId }, input, { lookaheadDays, now: new Date(), required: true, refuseOpenMarking: false });
    if (handedOver.length > 0) {
      await logInTransaction(tx, {
        action: AUDIT_ACTION.CLASSES_HANDED_OVER,
        description: 'Classes handed over from an account that left',
        targetType: 'User',
        targetId: id,
        organizationId,
        metadata: { handedOver: handedOver.map(({ courseId, courseName, toTeacherId }) => ({ courseId, courseName, toTeacherId })), effectiveMonth: input.effectiveMonth ?? defaultMonth },
        context,
      });
    }
    return { handedOver };
  });
};
