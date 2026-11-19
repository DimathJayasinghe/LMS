import { AttendanceSource, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { assertCourseAccess } from '@/services/class.service';
import { AppError } from '@/utils/app-error';
import {
  buildReconciliationPreview,
  collectParticipantIdentifiers,
  type ReconciledParticipant,
  type UnmatchedParticipant,
} from '@/utils/attendance-reconciliation';
import { listPastMeetingParticipants } from '@/utils/zoom-attendance';
import type { AuthenticatedUser } from '@/types/auth.types';

export interface AttendanceReconciliation {
  sessionId: string;
  zoomMeetingId: string;
  summary: {
    zoomRows: number;
    matchedStudents: number;
    alreadyRecorded: number;
    missing: number;
    unmatched: number;
    ignored: number;
  };
  participants: ReconciledParticipant[];
  unmatched: UnmatchedParticipant[];
}

const loadPreview = async (
  sessionId: string,
  actor: AuthenticatedUser,
): Promise<AttendanceReconciliation> => {
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.TEACHER) {
    throw new AppError('FORBIDDEN', 403, 'Only course teachers can reconcile Zoom attendance.');
  }

  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, courseId: true, zoomMeetingId: true, deletedAt: true },
  });
  if (!session || session.deletedAt) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found or has been deleted.');
  }
  await assertCourseAccess(session.courseId, actor);
  if (!session.zoomMeetingId) {
    throw new AppError('LIVE_CLASS_NOT_SCHEDULED', 409, 'This session has no Zoom meeting to reconcile.');
  }

  const zoomRows = await listPastMeetingParticipants(session.zoomMeetingId);
  const { emails, indexNumbers } = collectParticipantIdentifiers(zoomRows);
  const identityFilters: Prisma.UserWhereInput[] = [
    ...(emails.length > 0 ? [{ email: { in: emails, mode: 'insensitive' as const } }] : []),
    ...(indexNumbers.length > 0 ? [{ indexNumber: { in: indexNumbers } }] : []),
  ];

  const [users, recorded] = await Promise.all([
    identityFilters.length > 0
      ? prisma.user.findMany({
          where: { deletedAt: null, OR: identityFilters },
          select: {
            id: true,
            name: true,
            email: true,
            indexNumber: true,
            role: true,
            enrollments: {
              where: { courseId: session.courseId, isActive: true },
              select: { id: true },
              take: 1,
            },
          },
        })
      : [],
    prisma.attendance.findMany({ where: { classSessionId: sessionId }, select: { userId: true } }),
  ]);
  const preview = buildReconciliationPreview(
    zoomRows,
    users.map(({ enrollments, ...user }) => ({
      ...user,
      isEnrolled: enrollments.length > 0,
    })),
    new Set(recorded.map((row) => row.userId)),
  );
  const alreadyRecorded = preview.participants.filter((row) => row.status === 'RECORDED').length;

  return {
    sessionId,
    zoomMeetingId: session.zoomMeetingId,
    summary: {
      zoomRows: zoomRows.length,
      matchedStudents: preview.participants.length,
      alreadyRecorded,
      missing: preview.participants.length - alreadyRecorded,
      unmatched: preview.unmatched.length,
      ignored: preview.ignored,
    },
    participants: preview.participants,
    unmatched: preview.unmatched,
  };
};

export const previewZoomAttendance = loadPreview;

export const reconcileZoomAttendance = async (
  sessionId: string,
  actor: AuthenticatedUser,
): Promise<AttendanceReconciliation & { applied: number }> => {
  const preview = await loadPreview(sessionId, actor);
  const missing = preview.participants.filter((row) => row.status === 'MISSING');
  const applied = missing.length > 0
    ? (await prisma.attendance.createMany({
        data: missing.map((row) => ({
          userId: row.userId,
          classSessionId: sessionId,
          source: AttendanceSource.ZOOM_WEBHOOK,
          scannedAt: row.firstJoinAt,
          lastSeenAt: row.lastLeaveAt,
        })),
        skipDuplicates: true,
      })).count
    : 0;

  return { ...preview, applied };
};
