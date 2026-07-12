import { z } from 'zod';

// ─── Attach Video to Class Session (Super Admin) ─────────────
export const createVideoSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(200),
  bunnyVideoId: z.string().trim().min(1, 'Bunny Stream video ID is required.'),
  classSessionId: z.string().uuid('Invalid class session ID.'),
  // Optional UI display — fetched from Bunny API or entered manually
  durationSeconds: z.coerce.number().int().positive().optional(),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;

// ─── Direct-to-Bunny Upload (Teacher/Super Admin) ─────────────
// Initiates a video record + a signed TUS upload target. The browser then
// uploads the file straight to Bunny — our server never receives the bytes.
export const initiateVideoUploadSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(200),
  classSessionId: z.string().uuid('Invalid class session ID.'),
});

export type InitiateVideoUploadInput = z.infer<typeof initiateVideoUploadSchema>;

// ─── Bunny Webhook ─────────────────────────────────────────────
// Bunny's Video Library webhook payload (Library > Webhooks). No per-request
// signature is supported by Bunny for this webhook — verified instead via a
// shared secret query param (see routes + BUNNY_WEBHOOK_SECRET).
export const bunnyWebhookSchema = z.object({
  VideoLibraryId: z.coerce.number(),
  VideoGuid: z.string().min(1),
  Status: z.coerce.number(),
});

export type BunnyWebhookInput = z.infer<typeof bunnyWebhookSchema>;

// ─── Update Video Metadata ────────────────────────────────────
export const updateVideoSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  durationSeconds: z.coerce.number().int().positive().optional(),
});

export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;

// ─── URL Params ───────────────────────────────────────────────
export const videoIdParamSchema = z.object({
  id: z.string().uuid('Invalid video ID.'),
});

export const classIdParamSchema = z.object({
  classId: z.string().uuid('Invalid class ID.'),
});

// ─── Query ────────────────────────────────────────────────────
export const videoListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type VideoListQuery = z.infer<typeof videoListQuerySchema>;
