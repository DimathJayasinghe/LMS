import { Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { generateBunnyStreamUrl, getBunnyEmbedUrl } from '@/utils/bunny';
import type { AuthenticatedUser } from '@/types/auth.types';
import { assertCourseAccess } from '@/services/class.service';
import { assertStudentContentAccess } from '@/services/access.service';
import type {
  CreateVideoInput,
  UpdateVideoInput,
  VideoListQuery,
} from '@/schemas/video.schema';

// ─── Shared Select Shape ─────────────────────────────────────

const videoSelect = {
  id: true,
  title: true,
  bunnyVideoId: true,
  durationSeconds: true,
  classSessionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VideoRecordingSelect;

const videoWithSessionSelect = {
  ...videoSelect,
  classSession: {
    select: {
      id: true,
      title: true,
      date: true,
      courseId: true,
    },
  },
} satisfies Prisma.VideoRecordingSelect;

// ─── Return Types ─────────────────────────────────────────────

export interface VideoRecord {
  id: string;
  title: string;
  bunnyVideoId: string;
  durationSeconds: number | null;
  classSessionId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoRecordWithSession extends VideoRecord {
  classSession: {
    id: string;
    title: string;
    date: Date;
    courseId: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Ensures the class session exists and has NOT been soft-deleted.
 * Videos cannot be attached to deleted sessions.
 */
const ensureSessionExists = async (
  sessionId: string,
): Promise<{ id: string; courseId: string }> => {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, courseId: true, deletedAt: true },
  });

  if (!session || session.deletedAt) {
    throw new AppError(
      'CLASS_SESSION_NOT_FOUND',
      404,
      'Class session not found or has been deleted.',
    );
  }

  return session;
};

// ─── Create Recording ────────────────────────────────────────
// Super Admin attaches a Bunny Stream video to a class session.

export const createVideoRecording = async (
  input: CreateVideoInput,
  actor: AuthenticatedUser,
): Promise<VideoRecordWithSession> => {
  const session = await ensureSessionExists(input.classSessionId);
  await assertCourseAccess(session.courseId, actor);

  return prisma.videoRecording.create({
    data: {
      title: input.title,
      bunnyVideoId: input.bunnyVideoId,
      durationSeconds: input.durationSeconds ?? null,
      classSessionId: input.classSessionId,
    },
    select: videoWithSessionSelect,
  });
};

// ─── Update Recording ─────────────────────────────────────────
// Super Admin can update a recording's title or duration metadata.

export const updateVideoRecording = async (
  videoId: string,
  input: UpdateVideoInput,
  actor: AuthenticatedUser,
): Promise<VideoRecord> => {
  const video = await prisma.videoRecording.findUnique({
    where: { id: videoId },
    select: { id: true, classSession: { select: { courseId: true } } },
  });

  if (!video) {
    throw new AppError('VIDEO_NOT_FOUND', 404, 'Video recording not found.');
  }

  await assertCourseAccess(video.classSession.courseId, actor);

  return prisma.videoRecording.update({
    where: { id: videoId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.durationSeconds !== undefined && { durationSeconds: input.durationSeconds }),
    },
    select: videoSelect,
  });
};

// ─── Delete Recording ─────────────────────────────────────────
// Permanently removes the DB record (NOT the Bunny asset).
// VideoRecording has no child relations so hard delete is safe.

export const deleteVideoRecording = async (
  videoId: string,
  actor: AuthenticatedUser,
): Promise<void> => {
  const video = await prisma.videoRecording.findUnique({
    where: { id: videoId },
    select: { id: true, classSession: { select: { courseId: true } } },
  });

  if (!video) {
    throw new AppError('VIDEO_NOT_FOUND', 404, 'Video recording not found.');
  }

  await assertCourseAccess(video.classSession.courseId, actor);

  await prisma.videoRecording.delete({ where: { id: videoId } });
};

// ─── List Videos for a Class ─────────────────────────────────
// Any authenticated user can list videos for a course.
// Returns paginated results ordered newest-first.

export const listVideosByClass = async (
  courseId: string,
  query: VideoListQuery,
  actor: AuthenticatedUser,
): Promise<{ records: VideoRecordWithSession[]; total: number }> => {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });

  if (!course) {
    throw new AppError('CLASS_NOT_FOUND', 404, 'Class (course) not found.');
  }

  // Students must be enrolled to see a course's video list.
  await assertStudentContentAccess(actor, courseId, { requirePaid: false });

  const where: Prisma.VideoRecordingWhereInput = {
    classSession: {
      courseId,
      deletedAt: null, // Never return videos for deleted sessions
    },
  };

  const [records, total] = await Promise.all([
    prisma.videoRecording.findMany({
      where,
      select: videoWithSessionSelect,
      orderBy: { classSession: { date: 'desc' } },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.videoRecording.count({ where }),
  ]);

  return { records, total };
};

// ─── Get Single Video ─────────────────────────────────────────
// Used before generating the stream URL to verify the video exists.

export const getVideoById = async (videoId: string): Promise<VideoRecordWithSession> => {
  const video = await prisma.videoRecording.findUnique({
    where: { id: videoId },
    select: videoWithSessionSelect,
  });

  if (!video) {
    throw new AppError('VIDEO_NOT_FOUND', 404, 'Video recording not found.');
  }

  return video;
};

// ─── Generate Stream URL (IP-Bound) ──────────────────────────
// Generates a signed, IP-bound Bunny.net stream URL for a student.
//
// Security:
//  - Token is bound to req.ip (plan §13 — The Telegram Pirate fix)
//  - Token expires after BUNNY_TOKEN_TTL_SECONDS
//  - If the link is shared, Bunny rejects it with 403 because the
//    viewer's IP won't match the embedded IP in the token signature.

export const generateStreamUrl = async (
  videoId: string,
  clientIp: string,
  actor: AuthenticatedUser,
): Promise<{
  video: VideoRecordWithSession;
  streamUrl: string;
  embedUrl: string;
  expiresAt: number;
}> => {
  const video = await getVideoById(videoId);

  // Gate: a student must be enrolled AND have paid the current month before we
  // ever mint an IP-bound Bunny token (architecture §7.1 — content protection).
  await assertStudentContentAccess(actor, video.classSession.courseId, { requirePaid: true });

  const { streamUrl, expiresAt } = generateBunnyStreamUrl(video.bunnyVideoId, clientIp);
  const embedUrl = getBunnyEmbedUrl(video.bunnyVideoId);

  return { video, streamUrl, embedUrl, expiresAt };
};
