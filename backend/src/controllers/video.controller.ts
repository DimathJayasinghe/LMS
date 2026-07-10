import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { logger } from '@/config/logger';
import { env } from '@/config/env';
import * as VideoService from '@/services/video.service';
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
    if (!env.BUNNY_WEBHOOK_SECRET || req.query.secret !== env.BUNNY_WEBHOOK_SECRET) {
      res.status(401).json({ status: 'error', message: 'Invalid webhook secret.' });
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

    res.status(200).json({
      status: 'success',
      data: null,
      message: 'Video recording removed.',
    });
  },
);

// ─── GET /api/videos/class/:classId ──────────────────────────
// List all videos for a course (any authenticated user)
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
// Get a single video's metadata (any authenticated user)
export const getVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = videoIdParamSchema.parse(req.params);
    const video = await VideoService.getVideoById(id);

    res.status(200).json({
      status: 'success',
      data: video,
    });
  },
);

// ─── GET /api/videos/:id/stream ──────────────────────────────
// Student requests an IP-bound signed stream URL
// The client IP from req.ip is embedded in the Bunny token signature,
// so sharing the URL externally results in a 403 from Bunny's CDN.
export const getStreamUrl = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = videoIdParamSchema.parse(req.params);

    // req.ip is set by Express from the X-Forwarded-For header
    // (when trust proxy is enabled) or from the TCP socket directly.
    const clientIp = req.ip ?? '0.0.0.0';

    const { video, streamUrl, embedUrl, expiresAt } = await VideoService.generateStreamUrl(
      id,
      clientIp,
      req.user!,
    );

    res.status(200).json({
      status: 'success',
      data: {
        videoId: video.id,
        title: video.title,
        durationSeconds: video.durationSeconds,
        streamUrl,   // HLS playlist URL (for custom player)
        embedUrl,    // Bunny-hosted iframe player URL
        expiresAt,   // Unix timestamp — client can show expiry warning
      },
      message: 'Stream URL generated. URL is IP-bound and expires automatically.',
    });
  },
);
