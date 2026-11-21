import { Router } from 'express';
import { Role } from '@prisma/client';
import * as VideoController from '@/controllers/video.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import {
  createVideoSchema,
  updateVideoSchema,
  videoIdParamSchema,
  classIdParamSchema,
  videoListQuerySchema,
  initiateVideoUploadSchema,
} from '@/schemas/video.schema';

export const videoRoutes = Router();

// Who may open recordings at all; the service narrows to enrolled / owning (video.service.ts).
const RECORDING_READER_ROLES = [Role.STUDENT, Role.TEACHER, Role.SUPER_ADMIN];

// ─── POST /api/videos/uploads ──────────────────────────────────
// Teacher/Super Admin starts a direct-to-Bunny upload (TUS). Registered
// before the other literal/`:id` routes for clarity; no path conflict exists
// since there is no other POST on a literal `/uploads` segment.
videoRoutes.post(
  '/uploads',
  verifyToken,
  requireRole(Role.SUPER_ADMIN, Role.TEACHER),
  validateBody(initiateVideoUploadSchema),
  checkIdempotency,
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
  checkIdempotency,
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
// Enrolled students, the owning teacher and the owner list a course's videos
// (front desk and markers are refused; see D-ACCESS-8). The service re-checks.
// MUST be registered before /:id to prevent route conflict
videoRoutes.get(
  '/class/:classId',
  verifyToken,
  requireRole(...RECORDING_READER_ROLES),
  validateParams(classIdParamSchema),
  validateQuery(videoListQuerySchema),
  VideoController.listVideosForClass,
);

// ─── GET /api/videos/:id/stream ──────────────────────────────
// Enrolled and paid student, owning teacher or owner requests a signed Bunny
// embed URL (token-authenticated, 4-hour TTL, not IP-bound)
// MUST be registered before /:id to avoid /:id matching "stream"
videoRoutes.get(
  '/:id/stream',
  verifyToken,
  requireRole(...RECORDING_READER_ROLES),
  validateParams(videoIdParamSchema),
  VideoController.getStreamUrl,
);

// ─── GET /api/videos/:id ─────────────────────────────────────
// Enrolled student, owning teacher or owner fetches video metadata (no stream URL)
videoRoutes.get(
  '/:id',
  verifyToken,
  requireRole(...RECORDING_READER_ROLES),
  validateParams(videoIdParamSchema),
  VideoController.getVideo,
);
