import { ExamAudienceDeliveryMode, Prisma } from '@prisma/client';
import { AppError } from '@/utils/app-error';

/**
 * A scoped exam gives each student exactly one participant row (unique on exam and student), so the student's
 * audience is derived from the roster and never chosen by the client.
 */
export interface StudentExamAudience {
  id: string;
  label: string;
  deliveryMode: ExamAudienceDeliveryMode;
  instituteName: string | null;
}

/** What a student is told about their own audience; the audience id stays server side. */
export interface MyAudience {
  label: string;
  deliveryMode: ExamAudienceDeliveryMode;
  instituteName: string | null;
}

const audienceSelect = {
  id: true, label: true, deliveryMode: true, institute: { select: { name: true } },
} satisfies Prisma.ExamAudienceSelect;
type AudienceRow = Prisma.ExamAudienceGetPayload<{ select: typeof audienceSelect }>;

/** The asking student's own participant row, for use inside a list query. */
export const studentAudienceSelect = (userId: string) => ({
  where: { userId }, take: 1, select: { audience: { select: audienceSelect } },
}) satisfies Prisma.Exam$participantsArgs;

export const toStudentAudience = (row: AudienceRow): StudentExamAudience => ({
  id: row.id, label: row.label, deliveryMode: row.deliveryMode, instituteName: row.institute?.name ?? null,
});

export const toMyAudience = ({ label, deliveryMode, instituteName }: StudentExamAudience): MyAudience => ({
  label, deliveryMode, instituteName,
});

/** `db` is the client in use, so a transaction reads its own snapshot. */
export const resolveStudentExamAudience = async (
  db: Pick<Prisma.TransactionClient, 'examParticipant'>,
  examId: string,
  userId: string,
): Promise<StudentExamAudience | null> => {
  const row = await db.examParticipant.findUnique({
    where: { examId_userId: { examId, userId } }, select: { audience: { select: audienceSelect } },
  });
  return row ? toStudentAudience(row.audience) : null;
};

/** Online start rule for a scoped exam. A body `audienceId` is optional and, if sent, must be the student's own. */
export const assertOnlineSittingAudience = (audience: StudentExamAudience | null, audienceId?: string): void => {
  if (!audience) throw new AppError('EXAM_PARTICIPANT_NOT_FOUND', 403, 'You are not on the list for this exam. Ask your teacher.');
  if (audience.deliveryMode === ExamAudienceDeliveryMode.PHYSICAL) {
    throw new AppError('EXAM_PHYSICAL_AUDIENCE', 409, 'Your paper is sat in the hall and cannot be submitted online.');
  }
  if (audienceId && audienceId !== audience.id) {
    throw new AppError('EXAM_AUDIENCE_MISMATCH', 400, 'That audience is not the one you are listed in.');
  }
};
