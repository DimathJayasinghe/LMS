import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/utils/async-handler';
import { logger } from '@/config/logger';
import { extractAuditContext } from '@/utils/audit-context';
import * as VideoService from '@/services/video.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import { verifyBunnyWebhookSignature } from '@/utils/bunny';
import {
  createVideoSchema,
  updateVideoSchema,
  videoIdParamSchema,
  classIdParamSchema,
  videoListQuerySchema,
  initiateVideoUploadSchema,
  bunnyWebhookSchema,
} from '@/schemas/video.schema';

// ─── POST /api/videos/uploads ─────────────────────────────────
// Teacher/Super Admin starts a direct-to-Bunny upload. Returns a signed TUS
// target the browser uploads the file into — the file never touches this server.
export const initiateUpload = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input = initiateVideoUploadSchema.parse(req.body);
    const { video, upload } = await VideoService.initiateVideoUpload(input, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.VIDEO_UPLOAD_INITIATED,
      description: `Recording upload initiated for "${video.title}"`,
      targetType: 'VideoRecording',
      targetId: video.id,
      metadata: { classSessionId: video.classSessionId },
      context: extractAuditContext(req),
    });

    res.status(201).json({
      status: 'success',
      data: { video, upload },
      message: 'Upload authorized. Upload the file directly to Bunny.',
    });
  },
);

// ─── POST /api/videos/bunny-webhook ────────────────────────────
// Bunny calls this when a video finishes processing (or fails) — the source
// of truth for "upload complete", independent of the teacher's connection.
// No user session: verified by a shared secret query param instead (Bunny's
// library webhook has no per-request signature to check).
export const bunnyWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // Verify Bunny's HMAC-SHA256 signature over the RAW body (read-only key),
    // per https://docs.bunny.net/stream/webhooks — never the parsed/re-serialized body.
    const signature = req.header('X-BunnyStream-Signature');
    if (!verifyBunnyWebhookSignature(req.rawBody ?? '', signature)) {
      res.status(401).json({ status: 'error', message: 'Invalid webhook signature.' });
      return;
    }

    const parsed = bunnyWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      // Don't 400 — an unrecognized payload shouldn't make Bunny retry forever.
      logger.warn({ errors: parsed.error.issues }, 'Invalid Bunny webhook payload — ignoring.');
      res.status(200).json({ status: 'success', message: 'Payload ignored.' });
      return;
    }

    await VideoService.handleBunnyWebhook(parsed.data);

    res.status(200).json({ status: 'success', message: 'Webhook processed.' });
  },
);

// ─── POST /api/videos ─────────────────────────────────────────
// Super Admin attaches a Bunny Stream video to a class session
export const createVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input = createVideoSchema.parse(req.body);
    const video = await VideoService.createVideoRecording(input, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.VIDEO_ATTACHED,
      description: `Recording "${video.title}" attached`,
      targetType: 'VideoRecording',
      targetId: video.id,
      metadata: { classSessionId: video.classSessionId },
      context: extractAuditContext(req),
    });

    res.status(201).json({
      status: 'success',
      data: video,
      message: 'Video recording attached successfully.',
    });
  },
);

// ─── PATCH /api/videos/:id ────────────────────────────────────
// Super Admin updates video metadata (title, duration)
export const updateVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = videoIdParamSchema.parse(req.params);
    const input = updateVideoSchema.parse(req.body);
    const video = await VideoService.updateVideoRecording(id, input, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.VIDEO_UPDATED,
      targetType: 'VideoRecording',
      targetId: id,
      metadata: { changedFields: Object.keys(input) },
      context: extractAuditContext(req),
    });

    res.status(200).json({
      status: 'success',
      data: video,
      message: 'Video recording updated.',
    });
  },
);

// ─── DELETE /api/videos/:id ───────────────────────────────────
// Super Admin removes a video record (DB only — Bunny asset untouched)
export const deleteVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = videoIdParamSchema.parse(req.params);
    await VideoService.deleteVideoRecording(id, req.user!);

    void AuditService.log({
      action: AUDIT_ACTION.VIDEO_DELETED,
      targetType: 'VideoRecording',
      targetId: id,
      context: extractAuditContext(req),
    });

    res.status(200).json({
      status: 'success',
      data: null,
      message: 'Video recording removed.',
    });
  },
);

// ─── GET /api/videos/class/:classId ──────────────────────────
// List a course's videos (enrolled student, owning teacher or owner)
export const listVideosForClass = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { classId } = classIdParamSchema.parse(req.params);
    const query = videoListQuerySchema.parse(req.query);
    const { records, total } = await VideoService.listVideosByClass(classId, query, req.user!);

    res.status(200).json({
      status: 'success',
      data: records,
      count: total,
      page: query.page,
      limit: query.limit,
    });
  },
);

// ─── GET /api/videos/:id ──────────────────────────────────────
// Get a single video's metadata (enrolled student, owning teacher or owner)
export const getVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = videoIdParamSchema.parse(req.params);
    const video = await VideoService.getVideoById(id, req.user!);

    res.status(200).json({
      status: 'success',
      data: video,
    });
  },
);

// ─── GET /api/videos/:id/stream ──────────────────────────────
// Student, owning teacher or owner requests a signed embed URL. The URL is
// token-authenticated with a 4-hour TTL and is NOT bound to the viewer's IP.
// Staff opens (teacher, owner) are audited; student opens are not.
export const getStreamUrl = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = videoIdParamSchema.parse(req.params);

    const { video, embedUrl, watermark, expiresAt } = await VideoService.generateStreamUrl(
      id,
      req.user!,
    );

    if (req.user!.role !== Role.STUDENT) {
      void AuditService.log({
        action: AUDIT_ACTION.RECORDING_STREAM_STAFF,
        description: 'Staff opened a recording',
        targetType: 'VideoRecording',
        targetId: video.id,
        context: extractAuditContext(req),
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        videoId: video.id,
        title: video.title,
        durationSeconds: video.durationSeconds,
        embedUrl,    // token-authenticated Bunny iframe (DRM enforced by Bunny)
        watermark,   // per-viewer overlay text the client renders over the player
        expiresAt,   // Unix timestamp — client can show expiry warning
      },
      message: 'Signed embed URL generated. Token expires automatically.',
    });
  },
);
