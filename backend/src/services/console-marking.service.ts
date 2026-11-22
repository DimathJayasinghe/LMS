import { SubmissionSource, SubmissionStatus, type ExamType } from '@prisma/client';
import { prisma } from '@/config/database';
import { assertOwner } from '@/services/console-access';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { createSettingsReader } from '@/services/settings.service';
import type { AuthenticatedUser } from '@/types/auth.types';

const EXAMS_SHOWN = 20;
const DAY_MS = 86_400_000;

export interface MarkingExam {
  examId: string;
  title: string;
  courseName: string;
  type: ExamType;
  endedAt: Date;
  /** Finished submissions, online and hall-entered. */
  submitted: number;
  graded: number;
  ungraded: number;
  /** Uploads started but never completed. */
  incomplete: number;
  /** Finished submissions that came from hall mark entry. */
  hall: number;
}

export interface MarkingPanel {
  lookbackDays: number;
  /** Every exam waiting, not only the newest listed. */
  total: number;
  exams: MarkingExam[];
}

type CountRow = { examId: string; _count: { _all: number } };
const countsByExam = (rows: CountRow[]): Map<string, number> => new Map(rows.map((row) => [row.examId, row._count._all]));

/** Exams that have ended within the lookback and whose results are not published: where marking still has to happen. */
export const getMarkingPanel = async (actor: AuthenticatedUser): Promise<MarkingPanel> => {
  assertOwner(actor);
  const { organizationId } = await organizationClockForUser(actor.userId);
  const lookbackDays = await createSettingsReader(organizationId)('console.lookbackDays');
  const now = new Date();
  const where = {
    organizationId, deletedAt: null, isPublished: false,
    endTime: { gte: new Date(now.getTime() - lookbackDays * DAY_MS), lt: now },
  };

  const [exams, total] = await Promise.all([
    prisma.exam.findMany({
      where, orderBy: { endTime: 'desc' }, take: EXAMS_SHOWN,
      select: { id: true, title: true, type: true, endTime: true, course: { select: { name: true } } },
    }),
    prisma.exam.count({ where }),
  ]);
  if (exams.length === 0) return { lookbackDays, total, exams: [] };

  const examId = { in: exams.map((exam) => exam.id) };
  const [byStatus, ungradedRows, hallRows] = await Promise.all([
    prisma.submission.groupBy({ by: ['examId', 'status'], where: { examId }, _count: { _all: true } }),
    prisma.submission.groupBy({ by: ['examId'], where: { examId, status: SubmissionStatus.COMPLETED, marks: null }, _count: { _all: true } }),
    prisma.submission.groupBy({ by: ['examId'], where: { examId, status: SubmissionStatus.COMPLETED, source: SubmissionSource.HALL }, _count: { _all: true } }),
  ]);
  const completed = countsByExam(byStatus.filter((row) => row.status === SubmissionStatus.COMPLETED));
  const incomplete = countsByExam(byStatus.filter((row) => row.status === SubmissionStatus.UPLOADING));
  const ungraded = countsByExam(ungradedRows);
  const hall = countsByExam(hallRows);

  return {
    lookbackDays,
    total,
    exams: exams.map((exam) => {
      const submitted = completed.get(exam.id) ?? 0;
      const waiting = ungraded.get(exam.id) ?? 0;
      return {
        examId: exam.id, title: exam.title, courseName: exam.course.name, type: exam.type, endedAt: exam.endTime,
        submitted, graded: submitted - waiting, ungraded: waiting, incomplete: incomplete.get(exam.id) ?? 0, hall: hall.get(exam.id) ?? 0,
      };
    }),
  };
};
