import { Prisma, Role, VideoStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import {
  createBunnyVideo,
  generateBunnyTusUpload,
  getSignedBunnyEmbedUrl,
  resolveBunnyWebhookStatus,
  type BunnyTusUpload,
} from '@/utils/bunny';
import type { AuthenticatedUser } from '@/types/auth.types';
import { assertCourseAccess } from '@/services/class.service';
import { assertStudentContentAccess } from '@/services/access.service';
import type {
  BunnyWebhookInput,
  CreateVideoInput,
  InitiateVideoUploadInput,
  UpdateVideoInput,
  VideoListQuery,
} from '@/schemas/video.schema';

// ─── Shared Select Shape ─────────────────────────────────────

const videoSelect = {
  id: true,
  title: true,
  bunnyVideoId: true,
  durationSeconds: true,
  status: true,
  classSessionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VideoRecordingSelect;

const videoSessionRelation = {
  select: {
    id: true,
    title: true,
    date: true,
    courseId: true,
  },
} as const;

const videoWithSessionSelect = {
  ...videoSelect,
  classSession: videoSessionRelation,
} satisfies Prisma.VideoRecordingSelect;

// Student-facing records omit the provider's video id as a metadata field; the
// signed embed URL from generateStreamUrl (which contains it) is what a viewer uses.
const { bunnyVideoId: _omitProviderId, ...studentVideoFields } = videoSelect;
void _omitProviderId;
const studentVideoWithSessionSelect = {
  ...studentVideoFields,
  classSession: videoSessionRelation,
} satisfies Prisma.VideoRecordingSelect;

// ─── Return Types ─────────────────────────────────────────────

export interface VideoRecord {
  id: string;
  title: string;
  bunnyVideoId: string;
  durationSeconds: number | null;
  status: VideoStatus;
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

/** What a student may see of a recording: no provider video id. */
export type StudentVideoRecordWithSession = Omit<VideoRecordWithSession, 'bunnyVideoId'>;

// ─── Recording read access ───────────────────────────────────

/** Roles that may open recordings at all: enrolled students, the owning teacher, the owner. */
const RECORDING_READER_ROLES: Role[] = [Role.STUDENT, Role.TEACHER, Role.SUPER_ADMIN];

/**
 * Role gate for every recording read. Runs BEFORE any lookup so a refused role
 * cannot learn whether a video or course exists (D-ACCESS-8).
 */
const assertRecordingReaderRole = (actor: AuthenticatedUser): void => {
  if (!RECORDING_READER_ROLES.includes(actor.role)) {
    throw new AppError('FORBIDDEN_ROLE', 403, 'Recordings are available to students and the class teacher.');
  }
};

/**
 * One access function for the list, metadata and stream paths. Owner passes; a
 * teacher must own the course; a student must be enrolled (and, for a stream,
 * be covered for the billing month: enrollment is checked before coverage).
 */
const assertRecordingAccess = async (
  actor: AuthenticatedUser,
  courseId: string,
  opts: { requirePaid: boolean },
): Promise<void> => {
  assertRecordingReaderRole(actor);
  await assertCourseAccess(courseId, actor);
  await assertStudentContentAccess(actor, courseId, opts);
};

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

// ─── Create Recording (legacy manual attach) ──────────────────
// Attaches an already-on-Bunny video (uploaded via the Bunny dashboard, or
// migrated from elsewhere) to a class session. Since the asset is assumed to
// already be processed, this goes straight to READY — unlike the direct
// upload flow below, which starts UPLOADING until Bunny's webhook confirms.

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
      status: VideoStatus.READY,
    },
    select: videoWithSessionSelect,
  });
};

// ─── Initiate Direct Upload ────────────────────────────────────
// Teacher/Super Admin starts a direct-to-Bunny upload: we create the Bunny
// video entry + a DB row (status UPLOADING), then hand the browser a signed
// TUS upload target. The file bytes go straight from the browser to Bunny —
// they never pass through our server (architecture §5.6). Bunny's webhook
// (see handleBunnyWebhook) flips the row to READY once processing finishes,
// so the upload survives the teacher going offline right after the transfer
// completes — completion is confirmed by Bunny, not by the client.

export const initiateVideoUpload = async (
  input: InitiateVideoUploadInput,
  actor: AuthenticatedUser,
): Promise<{ video: VideoRecordWithSession; upload: BunnyTusUpload }> => {
  const session = await ensureSessionExists(input.classSessionId);
  await assertCourseAccess(session.courseId, actor);

  const { bunnyVideoId } = await createBunnyVideo(input.title);

  const video = await prisma.videoRecording.create({
    data: {
      title: input.title,
      bunnyVideoId,
      classSessionId: input.classSessionId,
      status: VideoStatus.UPLOADING,
    },
    select: videoWithSessionSelect,
  });

  const upload = generateBunnyTusUpload(bunnyVideoId);

  return { video, upload };
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
// Enrolled students, the owning teacher and the owner can list a course's videos.
// Returns paginated results ordered newest-first.

export const listVideosByClass = async (
  courseId: string,
  query: VideoListQuery,
  actor: AuthenticatedUser,
): Promise<{ records: Array<VideoRecordWithSession | StudentVideoRecordWithSession>; total: number }> => {
  // Role first: a refused role must not learn whether the course exists.
  assertRecordingReaderRole(actor);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });

  if (!course) {
    throw new AppError('CLASS_NOT_FOUND', 404, 'Class (course) not found.');
  }

  // Students must be enrolled; teachers must own the course.
  await assertRecordingAccess(actor, courseId, { requirePaid: false });

  const where: Prisma.VideoRecordingWhereInput = {
    classSession: {
      courseId,
      deletedAt: null, // Never return videos for deleted sessions
    },
    // Students only ever see finished recordings; staff (who need to monitor
    // upload/processing progress) see UPLOADING and FAILED rows too.
    ...(actor.role === Role.STUDENT ? { status: VideoStatus.READY } : {}),
  };

  const [records, total] = await Promise.all([
    prisma.videoRecording.findMany({
      where,
      select: actor.role === Role.STUDENT ? studentVideoWithSessionSelect : videoWithSessionSelect,
      orderBy: { classSession: { date: 'desc' } },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.videoRecording.count({ where }),
  ]);

  return { records, total };
};

// ─── Get Single Video ─────────────────────────────────────────
// Metadata only (no stream URL). Students get the shape without the provider id.

export const getVideoById = async (
  videoId: string,
  actor: AuthenticatedUser,
): Promise<VideoRecordWithSession | StudentVideoRecordWithSession> => {
  // Role first: a refused role must not learn whether the video exists.
  assertRecordingReaderRole(actor);

  const video = await prisma.videoRecording.findUnique({
    where: { id: videoId },
    select: actor.role === Role.STUDENT ? studentVideoWithSessionSelect : videoWithSessionSelect,
  });

  if (!video) {
    throw new AppError('VIDEO_NOT_FOUND', 404, 'Video recording not found.');
  }

  await assertRecordingAccess(actor, video.classSession.courseId, { requirePaid: false });

  // Students only ever see finished recordings (as in the list); an unfinished one
  // reads as not found. Checked after access so an unenrolled student learns nothing.
  if (actor.role === Role.STUDENT && video.status !== VideoStatus.READY) {
    throw new AppError('VIDEO_NOT_FOUND', 404, 'Video recording not found.');
  }

  return video;
};

// ─── Generate Stream URL ─────────────────────────────────────
// Generates a signed Bunny.net embed URL for an enrolled, paid student, the
// owning teacher or the owner.
//
// Security:
//  - Token-authenticated (signed URL), expires after BUNNY_TOKEN_TTL_SECONDS
//    (4 hours). It is not bound to the viewer's IP.
//  - Only the roles in RECORDING_READER_ROLES reach this point; front-desk and
//    marker accounts are refused before the video is even looked up.

export const generateStreamUrl = async (
  videoId: string,
  actor: AuthenticatedUser,
): Promise<{
  video: StudentVideoRecordWithSession;
  embedUrl: string;
  watermark: string;
  expiresAt: number;
}> => {
  assertRecordingReaderRole(actor);

  // The provider id is needed here to sign the URL, for every role; the returned
  // `video` omits it.
  const stored = await prisma.videoRecording.findUnique({
    where: { id: videoId },
    select: videoWithSessionSelect,
  });

  if (!stored) {
    throw new AppError('VIDEO_NOT_FOUND', 404, 'Video recording not found.');
  }

  // Gate: a student must be enrolled and covered for the billing month before we
  // ever mint a signed Bunny embed token (architecture §7.1 — content protection).
  await assertRecordingAccess(actor, stored.classSession.courseId, { requirePaid: true });

  const { bunnyVideoId, ...video } = stored;

  if (video.status !== VideoStatus.READY) {
    throw new AppError(
      'VIDEO_NOT_READY',
      409,
      video.status === VideoStatus.FAILED
        ? 'This recording failed to process. Please contact your teacher.'
        : 'This recording is still processing. Please check back shortly.',
    );
  }

  // Token-authenticated Bunny iframe (DRM enforced by Bunny's player) + a
  // per-viewer watermark string the client overlays to deter screen capture.
  const { embedUrl, expiresAt } = getSignedBunnyEmbedUrl(bunnyVideoId);

  const viewer = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true, indexNumber: true },
  });
  const watermark = viewer ? `${viewer.name} · #${viewer.indexNumber}` : `#${actor.userId.slice(0, 8)}`;

  return { video, embedUrl, watermark, expiresAt };
};

// ─── Bunny Webhook (Upload/Processing Status) ─────────────────
// Bunny calls this the moment a video finishes processing (or fails) —
// independent of whether the teacher's browser is still connected. This is
// the ONLY thing that ever flips a video to READY; the client's TUS upload
// reaching 100% only means the bytes arrived, not that Bunny has finished
// transcoding. Idempotent by design: `updateMany` on `bunnyVideoId` is a
// no-op if the video is unknown or already in that status (architecture §5.8).

export const handleBunnyWebhook = async (input: BunnyWebhookInput): Promise<void> => {
  const nextStatus = resolveBunnyWebhookStatus(input.Status);
  if (!nextStatus) return; // mid-flight status (created/uploaded/processing) — nothing to do yet

  await prisma.videoRecording.updateMany({
    where: { bunnyVideoId: input.VideoGuid },
    data: { status: nextStatus },
  });
};
