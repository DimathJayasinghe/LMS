import { ExamType, Prisma, Role, SubmissionSource, SubmissionStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { withAdvisoryLock } from '@/utils/advisory-lock';
import { hasPrismaCode } from '@/utils/prisma-error';
import { AUDIT_ACTION, DEFAULT_ORGANIZATION_ID } from '@/utils/constants';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { AuditContext } from '@/types/audit.types';
import type { HallMarksInput } from '@/schemas/hall-marks.schema';
import { assertCourseAccess } from '@/services/class.service';
import { assertMarkerAssignedToExam, getMarkerGrantedAudienceIds } from '@/services/access.service';
import { logInTransaction } from '@/services/audit.service';
import { createSettingsReader } from '@/services/settings.service';

// ─── Types ────────────────────────────────────────────────

export type HallMarkRowStatus =
  | 'OK'
  | 'WILL_CHANGE'
  | 'UNKNOWN_INDEX'
  | 'NOT_ELIGIBLE'
  | 'NOT_ASSIGNED'
  | 'DUPLICATE_IN_BATCH'
  | 'OUT_OF_RANGE'
  | 'ONLINE_SUBMISSION_EXISTS'
  | 'MARKS_SET_BY_TEACHER';

export interface HallMarkRowResult {
  /** 1-based position in the pasted list, so the screen can point at the row to fix. */
  line: number;
  indexNumber: number;
  marks: number;
  status: HallMarkRowStatus;
  before?: number | null;
  after?: number;
  /** Teacher and owner only; markers see index numbers and statuses. */
  name?: string;
}

export interface HallMarksResult {
  dryRun: boolean;
  /** True only when a real run wrote its rows. A dry run and a rejected run write nothing. */
  applied: boolean;
  counts: { total: number; changed: number; unchanged: number; rejected: number };
  rows: HallMarkRowResult[];
}

interface ExamForHallMarks {
  id: string;
  courseId: string;
  type: ExamType;
  totalMarks: number;
  isPublished: boolean;
  deletedAt: Date | null;
  paperRevisionId: string | null;
  organizationId: string | null;
}

interface PendingWrite {
  userId: string;
  indexNumber: number;
  marks: number;
  before: number | null;
}

type Reader = Pick<Prisma.TransactionClient, 'user' | 'submission'>;

const HALL_MARKS_LOCK_NAMESPACE = 'hall-marks';
// 500 serializable upserts take seconds, and Prisma's default of 5 seconds would end the batch half-way.
const HALL_MARKS_TX_TIMEOUT_MS = 60_000;
const HALL_MARKS_TX_MAX_WAIT_MS = 10_000;

// ─── Checks ───────────────────────────────────────────────

const loadExam = async (examId: string): Promise<ExamForHallMarks> => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true, courseId: true, type: true, totalMarks: true, isPublished: true,
      deletedAt: true, paperRevisionId: true, organizationId: true,
    },
  });
  if (!exam || exam.deletedAt) {
    throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
  }
  return exam;
};

/** Same grading authority as entering marks one at a time: the owning teacher, the owner, an assigned marker. */
const assertMayEnter = async (exam: ExamForHallMarks, actor: AuthenticatedUser): Promise<void> => {
  if (actor.role === Role.SUPER_ADMIN) return;
  if (actor.role === Role.TEACHER) {
    await assertCourseAccess(exam.courseId, actor);
    return;
  }
  if (actor.role === Role.MARKER) {
    await assertMarkerAssignedToExam(actor.userId, exam.id);
    return;
  }
  throw new AppError('FORBIDDEN', 403, 'You cannot enter marks for this exam.');
};

const isScoped = (exam: ExamForHallMarks): boolean => exam.paperRevisionId !== null;

const assertNotPublished = (exam: Pick<ExamForHallMarks, 'isPublished'>): void => {
  if (exam.isPublished) {
    throw new AppError(
      'RESULTS_ALREADY_PUBLISHED',
      409,
      'Results are already published. Ask the course teacher to record a correction.',
    );
  }
};

// ─── Classification ───────────────────────────────────────
// One pass over the pasted rows that reads the roster and the existing submissions in two queries. Used by the
// dry run and, again under the lock, by the real run, so what is written is what was judged at that moment.

const classifyRows = async (
  db: Reader,
  exam: ExamForHallMarks,
  rows: HallMarksInput['rows'],
  actor: AuthenticatedUser,
): Promise<{ results: HallMarkRowResult[]; writes: PendingWrite[] }> => {
  const showNames = actor.role !== Role.MARKER;
  const scoped = isScoped(exam);
  const indexNumbers = [...new Set(rows.map((row) => row.indexNumber))];

  const [students, grantedAudiences] = await Promise.all([
    db.user.findMany({
      where: {
        indexNumber: { in: indexNumbers },
        role: Role.STUDENT,
        deletedAt: null,
        enrollments: { some: { courseId: exam.courseId, isActive: true } },
      },
      select: {
        id: true,
        indexNumber: true,
        ...(showNames ? { name: true } : {}),
        examParticipants: {
          where: { examId: exam.id },
          select: { audienceId: true, audience: { select: { deliveryMode: true } } },
        },
      },
    }),
    // A legacy exam's marker assignment covers the whole exam; only a scoped exam grants per audience.
    actor.role === Role.MARKER && scoped ? getMarkerGrantedAudienceIds(actor.userId, exam.id) : Promise.resolve(null),
  ]);

  const submissions = await db.submission.findMany({
    where: { examId: exam.id, userId: { in: students.map((student) => student.id) } },
    select: { userId: true, source: true, status: true, marks: true, gradedBy: { select: { role: true } } },
  });

  const byIndex = new Map(students.map((student) => [student.indexNumber, student]));
  const byUser = new Map(submissions.map((submission) => [submission.userId, submission]));
  const seen = new Set<number>();
  const results: HallMarkRowResult[] = [];
  const writes: PendingWrite[] = [];

  rows.forEach((row, position) => {
    const base = { line: position + 1, indexNumber: row.indexNumber, marks: row.marks };
    const reject = (status: HallMarkRowStatus, name?: string): void => {
      results.push({ ...base, status, ...(name !== undefined ? { name } : {}) });
    };

    if (seen.has(row.indexNumber)) return reject('DUPLICATE_IN_BATCH');
    seen.add(row.indexNumber);

    const student = byIndex.get(row.indexNumber);
    if (!student) return reject('UNKNOWN_INDEX');
    const name = showNames && 'name' in student ? student.name : undefined;

    const participant = student.examParticipants[0];
    if (scoped && participant?.audience.deliveryMode !== 'PHYSICAL') return reject('NOT_ELIGIBLE', name);
    if (grantedAudiences && !(participant && grantedAudiences.has(participant.audienceId))) return reject('NOT_ASSIGNED', name);

    const prior = byUser.get(student.id);
    if (prior?.source === SubmissionSource.ONLINE) return reject('ONLINE_SUBMISSION_EXISTS', name);
    // Marks are stored as integers, so a decimal is refused rather than rounded, whatever the owner's decimal setting says.
    if (!Number.isInteger(row.marks) || row.marks < 0 || row.marks > exam.totalMarks) return reject('OUT_OF_RANGE', name);

    const before = prior?.marks ?? null;
    if (before === row.marks) {
      results.push({ ...base, status: 'OK', before, after: row.marks, ...(name !== undefined ? { name } : {}) });
      return;
    }
    if (actor.role === Role.MARKER && (prior?.gradedBy?.role === Role.TEACHER || prior?.gradedBy?.role === Role.SUPER_ADMIN)) {
      return reject('MARKS_SET_BY_TEACHER', name);
    }

    results.push({ ...base, status: 'WILL_CHANGE', before, after: row.marks, ...(name !== undefined ? { name } : {}) });
    writes.push({ userId: student.id, indexNumber: row.indexNumber, marks: row.marks, before });
  });

  return { results, writes };
};

const summarize = (dryRun: boolean, applied: boolean, rows: HallMarkRowResult[]): HallMarksResult => {
  const changed = rows.filter((row) => row.status === 'WILL_CHANGE').length;
  const unchanged = rows.filter((row) => row.status === 'OK').length;
  return {
    dryRun,
    applied,
    counts: { total: rows.length, changed, unchanged, rejected: rows.length - changed - unchanged },
    rows,
  };
};

// ─── Enter Hall Marks ─────────────────────────────────────
// Paper exams sat in the hall have no online submission, so the marks are typed in by index number. A dry run judges
// every row and writes nothing; a real run writes all rows or none, with its audit row in the same transaction.

export const enterHallMarks = async (
  examId: string,
  input: HallMarksInput,
  actor: AuthenticatedUser,
  context: AuditContext,
): Promise<HallMarksResult> => {
  const exam = await loadExam(examId);
  await assertMayEnter(exam, actor);
  assertNotPublished(exam);

  if (!isScoped(exam) && exam.type !== ExamType.INCLASS) {
    throw new AppError(
      'EXAM_NOT_HALL_ELIGIBLE',
      400,
      'Hall marks can be entered for in-class papers and for physical audiences of scoped exams only.',
    );
  }

  const organizationId = exam.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const maxRows = await createSettingsReader(organizationId)('exams.hallMarks.maxRowsPerBatch');
  if (input.rows.length > maxRows) {
    throw new AppError('TOO_MANY_ROWS', 400, `A batch can have at most ${maxRows} rows.`);
  }

  if (input.dryRun) {
    const { results } = await classifyRows(prisma, exam, input.rows, actor);
    return summarize(true, false, results);
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        await withAdvisoryLock(tx, HALL_MARKS_LOCK_NAMESPACE, organizationId, exam.id);

        // Holding the exam row stops a publish from landing between this check and the writes below.
        const [current] = await tx.$queryRaw<{ isPublished: boolean; deletedAt: Date | null }[]>(
          Prisma.sql`SELECT "isPublished", "deletedAt" FROM "Exam" WHERE "id" = ${exam.id} FOR SHARE`,
        );
        if (!current || current.deletedAt) throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
        assertNotPublished(current);

        const { results, writes } = await classifyRows(tx, exam, input.rows, actor);
        const summary = summarize(false, true, results);
        if (summary.counts.rejected > 0) return { ...summary, applied: false };

        const gradedAt = new Date();
        for (const write of writes) {
          await tx.submission.upsert({
            where: { userId_examId: { userId: write.userId, examId: exam.id } },
            create: {
              userId: write.userId,
              examId: exam.id,
              status: SubmissionStatus.COMPLETED,
              source: SubmissionSource.HALL,
              marks: write.marks,
              gradedAt,
              gradedById: actor.userId,
              organizationId,
            },
            update: { marks: write.marks, gradedAt, gradedById: actor.userId },
          });
        }

        if (writes.length > 0) {
          await logInTransaction(tx, {
            action: AUDIT_ACTION.HALL_MARKS_ENTERED,
            description: `Hall marks entered: ${summary.counts.changed} changed, ${summary.counts.unchanged} unchanged`,
            targetType: 'Exam',
            targetId: exam.id,
            organizationId,
            metadata: {
              total: summary.counts.total,
              changed: summary.counts.changed,
              unchanged: summary.counts.unchanged,
              changes: writes.map((write) => ({ indexNumber: write.indexNumber, before: write.before, after: write.marks })),
            },
            context,
          });
        }

        return summary;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: HALL_MARKS_TX_TIMEOUT_MS,
        maxWait: HALL_MARKS_TX_MAX_WAIT_MS,
      },
    );
  } catch (error) {
    if (hasPrismaCode(error, 'P2034')) {
      throw new AppError('HALL_MARKS_CONFLICT', 409, 'Another change to this exam ran at the same time. Check the list and try again.');
    }
    throw error;
  }
};
