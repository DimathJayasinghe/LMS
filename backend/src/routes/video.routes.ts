import { Router } from 'express';
import { Role } from '@prisma/client';
import * as VideoController from '@/controllers/video.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
  createVideoSchema,
  updateVideoSchema,
  videoIdParamSchema,
  classIdParamSchema,
  videoListQuerySchema,
  initiateVideoUploadSchema,
} from '@/schemas/video.schema';

export const videoRoutes = Router();

// ─── POST /api/videos/uploads ──────────────────────────────────
// Teacher/Super Admin starts a direct-to-Bunny upload (TUS). Registered
// before the other literal/`:id` routes for clarity; no path conflict exists
// since there is no other POST on a literal `/uploads` segment.
videoRoutes.post(
  '/uploads',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER),
  validateBody(initiateVideoUploadSchema),
  VideoController.initiateUpload,
);

// ─── POST /api/videos/bunny-webhook ────────────────────────────
// Bunny's server-to-server callback — no user session, verified by a shared
// secret query param (see VideoController.bunnyWebhook).
videoRoutes.post('/bunny-webhook', VideoController.bunnyWebhook);

// ─── POST /api/videos ─────────────────────────────────────────
// Super Admin attaches a Bunny Stream video to a class session
videoRoutes.post(
  '/',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER),
  validateBody(createVideoSchema),
  VideoController.createVideo,
);

// ─── PATCH /api/videos/:id ────────────────────────────────────
// Super Admin updates title / duration metadata
videoRoutes.patch(
  '/:id',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER),
  validateParams(videoIdParamSchema),
  validateBody(updateVideoSchema),
  VideoController.updateVideo,
);

// ─── DELETE /api/videos/:id ───────────────────────────────────
// Super Admin removes the DB record (Bunny asset is NOT deleted)
videoRoutes.delete(
  '/:id',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER),
  validateParams(videoIdParamSchema),
  VideoController.deleteVideo,
);

// ─── GET /api/videos/class/:classId ──────────────────────────
// Any authenticated user lists all videos for a course
// MUST be registered before /:id to prevent route conflict
videoRoutes.get(
  '/class/:classId',
  verifyToken,
  validateParams(classIdParamSchema),
  validateQuery(videoListQuerySchema),
  VideoController.listVideosForClass,
);

// ─── GET /api/videos/:id/stream ──────────────────────────────
// Student requests an IP-bound signed Bunny stream URL
// MUST be registered before /:id to avoid /:id matching "stream"
videoRoutes.get(
  '/:id/stream',
  verifyToken,
  requireRole(Role.STUDENT, Role.SUPER_ADMIN, Role.ADMIN, Role.MARKER, Role.TEACHER),
  validateParams(videoIdParamSchema),
  VideoController.getStreamUrl,
);

// ─── GET /api/videos/:id ─────────────────────────────────────
// Any authenticated user fetches video metadata (no stream URL)
videoRoutes.get(
  '/:id',
  verifyToken,
  validateParams(videoIdParamSchema),
  VideoController.getVideo,
);
