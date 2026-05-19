import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as VideoService from '@/services/video.service';
import {
  createVideoSchema,
  updateVideoSchema,
  videoIdParamSchema,
  classIdParamSchema,
  videoListQuerySchema,
} from '@/schemas/video.schema';

// ─── POST /api/videos ─────────────────────────────────────────
// Super Admin attaches a Bunny Stream video to a class session
export const createVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input = createVideoSchema.parse(req.body);
    const video = await VideoService.createVideoRecording(input);

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
    const video = await VideoService.updateVideoRecording(id, input);

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
    await VideoService.deleteVideoRecording(id);

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
    const { records, total } = await VideoService.listVideosByClass(classId, query);

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
