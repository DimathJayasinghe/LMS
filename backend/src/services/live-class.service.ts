import { ClassType, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { AppError } from '@/utils/app-error';
import { hasPrismaCode } from '@/utils/prisma-error';
import {
  createZoomMeeting,
  generateMeetingSdkSignature,
  getZoomHostZak,
} from '@/utils/zoom';
import { ZOOM_JOIN_TOKEN_THROTTLE_SECONDS } from '@/utils/constants';
import type { AuthenticatedUser } from '@/types/auth.types';
import { assertCourseAccess } from '@/services/class.service';
import { assertStudentContentAccess } from '@/services/access.service';

// ─── Types ────────────────────────────────────────────────────

interface LiveSessionRow {
  id: string;
  title: string | null;
  classType: ClassType | null;
  date: Date;
  durationMinutes: number;
  courseId: string;
  zoomMeetingId: string | null;
  zoomLink: string | null;
  zoomPassword: string | null;
  deletedAt: Date | null;
}

export interface ScheduleResult {
  sessionId: string;
  liveScheduled: true;
}

export interface LiveClassToken {
  signature: string;
  sdkKey: string;
  meetingNumber: string;
  password: string;
  role: 0 | 1;
  userName: string;
  /** Only present for the host (role 1) — required by the SDK to START the meeting. */
  zak?: string;
  expiresAt: number;
}

// ─── Helpers ─────────────────────────────────────────────────

const getSessionOrThrow = async (sessionId: string): Promise<LiveSessionRow> => {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      classType: true,
      date: true,
      durationMinutes: true,
      courseId: true,
      zoomMeetingId: true,
      zoomLink: true,
      zoomPassword: true,
      deletedAt: true,
    },
  });

  if (!session || session.deletedAt) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found or has been deleted.');
  }

  return session;
};

// ─── Schedule ───────────────────────────────────────────────
// Teacher/Super Admin turns a session into a real, hosted Zoom meeting —
// replacing the old "paste your own Zoom link" step with an actual API call.

export const scheduleLiveClass = async (
  sessionId: string,
  actor: AuthenticatedUser,
): Promise<ScheduleResult> => {
  const session = await getSessionOrThrow(sessionId);
  await assertCourseAccess(session.courseId, actor);

  if (session.classType === ClassType.PHYSICAL) {
    throw new AppError('SESSION_NOT_ONLINE', 400, 'Hall-only sessions cannot be scheduled as a live class.');
  }
  if (session.zoomMeetingId) {
    throw new AppError('ALREADY_SCHEDULED', 409, 'This session already has a live class scheduled.');
  }

  const meeting = await createZoomMeeting(
    session.title ?? 'Class session',
    session.date,
    session.durationMinutes,
  );

  // The meeting is stored only while the session is still unscheduled and not hall only, so a concurrent mode change
  // or a second scheduling request cannot leave a hall-only session holding a meeting.
  try {
    await prisma.classSession.update({
      where: { id: sessionId, zoomMeetingId: null, OR: [{ classType: null }, { classType: ClassType.ONLINE }] },
      data: {
        zoomMeetingId: meeting.meetingId,
        zoomLink: meeting.joinUrl,
        zoomPassword: meeting.password,
      },
    });
  } catch (error) {
    if (hasPrismaCode(error, 'P2025')) {
      throw new AppError('SESSION_CHANGED', 409, 'The session changed while the live class was being created. Check its mode and try again.');
    }
    throw error;
  }

  return { sessionId, liveScheduled: true };
};

// ─── Issue Join/Host Token ────────────────────────────────────
// Mints a fresh, short-lived Meeting SDK JWT. Students go through the same
// enrolled+paid gate as recorded video (architecture §7.1 — live is premium
// content too); staff (course owner or Super Admin) get a host token + ZAK.

export const issueLiveClassToken = async (
  sessionId: string,
  actor: AuthenticatedUser,
): Promise<LiveClassToken> => {
  const session = await getSessionOrThrow(sessionId);

  if (
    actor.role !== Role.SUPER_ADMIN &&
    actor.role !== Role.TEACHER &&
    actor.role !== Role.STUDENT
  ) {
    throw new AppError('FORBIDDEN', 403, 'This role cannot join live classes.');
  }

  if (!session.zoomMeetingId) {
    throw new AppError('LIVE_CLASS_NOT_SCHEDULED', 404, 'This session has no live class scheduled yet.');
  }

  // Throttle: block rapid repeat issuance for the same (session, user) — a
  // lightweight deterrent against casually handing a fresh link/token to
  // someone else seconds apart, without punishing a genuine reconnect.
  const lockKey = `live:token:${sessionId}:${actor.userId}`;
  const acquired = await redis.set(lockKey, '1', 'EX', ZOOM_JOIN_TOKEN_THROTTLE_SECONDS, 'NX');
  if (acquired !== 'OK') {
    throw new AppError(
      'TOKEN_RATE_LIMITED',
      429,
      'A join link was just issued for this session — please wait a few seconds and try again.',
    );
  }

  const isHost = actor.role === Role.SUPER_ADMIN || actor.role === Role.TEACHER;

  if (isHost) {
    await assertCourseAccess(session.courseId, actor);
  } else {
    // Students must be enrolled + paid, same as VOD.
    await assertStudentContentAccess(actor, session.courseId, { requirePaid: true });
  }

  // The watermark's whole point is traceability — the name shown in the
  // meeting (and burned into the overlay) MUST come from our own DB, never
  // from client input, or a student could simply claim to be someone else.
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true, indexNumber: true },
  });
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
  }
  const userName = isHost ? user.name : `${user.name} (#${user.indexNumber})`;

  const role: 0 | 1 = isHost ? 1 : 0;
  const { signature, sdkKey, expiresAt } = generateMeetingSdkSignature(session.zoomMeetingId, role);
  const zak = role === 1 ? await getZoomHostZak() : undefined;

  return {
    signature,
    sdkKey,
    meetingNumber: session.zoomMeetingId,
    password: session.zoomPassword ?? '',
    role,
    userName,
    zak,
    expiresAt,
  };
};
