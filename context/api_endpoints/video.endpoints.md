# Video Recordings API Endpoints

This document describes all video recording endpoints in the LMS backend.

## Base URL

```
http://localhost:5000/api/videos
```

## Authentication

All endpoints require the standard `access_token` HTTP-only cookie (except where noted as public — there are none; all video routes require authentication).

## Content gate (2026-07-09)

- **`GET /:id/stream`** — a student must be **enrolled AND have paid the current month** before a token-authenticated Bunny embed is issued (`403 NOT_ENROLLED` / `402 PAYMENT_REQUIRED`). Privileged roles bypass. Additionally rate-limited (30/min/IP).
- **`GET /class/:classId`** (list) — requires an **active enrollment** for students.
- **Manage videos** (create/update/delete) — `SUPER_ADMIN` or the course's **`TEACHER`** (older tables say `ADMIN`).

## Direct-to-Bunny upload (2026-07-10)

Teachers upload the recording file **straight from the browser to Bunny.net** — it never passes through our
server (architecture §5.6, same principle as R2 presigned uploads). This is a two-step, webhook-confirmed flow:

1. **`POST /uploads`** (TEACHER/SUPER_ADMIN) — creates the Bunny video entry + a `VideoRecording` row with
   `status: UPLOADING`, and returns a signed **TUS** (resumable upload) authorization. Use with
   [`tus-js-client`](https://github.com/tus/tus-js-client) directly against Bunny — set these headers on the
   upload: `AuthorizationSignature`, `AuthorizationExpire`, `VideoId`, `LibraryId` (all returned in `upload`).
2. The browser uploads the file to `upload.endpoint` via TUS. **Reaching 100% here does *not* mean the video
   is ready** — Bunny still needs to transcode it.
3. **`POST /bunny-webhook`** — Bunny calls this server-to-server the moment processing finishes (or fails),
   flipping the row to `READY` (or `FAILED`). **This is the only thing that marks a video ready** — so even
   if the teacher's browser goes offline the instant the transfer finishes, the video is never lost or stuck:
   completion is confirmed by Bunny, not by the client. Configure this URL in the Bunny dashboard under
   *Stream → library → Webhook* as `https://<public-host>/api/videos/bunny-webhook` (dev: an `ngrok http 80`
   tunnel — Bunny can't reach `localhost`). **Verification is Bunny's HMAC-SHA256 signature**
   (`X-BunnyStream-Signature`) over the **raw body**, keyed by the library's **Read-Only API key**
   (`BUNNY_READ_ONLY_API_KEY`), constant-time compared (`verifyBunnyWebhookSignature`) — per
   <https://docs.bunny.net/stream/webhooks>. `Status` mapping: **`3` (Finished) or `4` (Resolution
   finished) → `READY`; `5` (Failed) or `8` (PresignedUploadFailed) → `FAILED`;** everything else is
   mid-flight and ignored (note `6` = *PresignedUploadStarted*, **not** a failure). Idempotent
   (`updateMany`, safe to receive twice or for an unknown video).
- Until `READY`, a video is **hidden from students** in `GET /class/:classId` (staff still see it, with its
  status, so they can monitor progress) and `GET /:id/stream` returns `409 VIDEO_NOT_READY`.
- The older **`POST /`** (manual attach — paste an already-uploaded `bunnyVideoId`) still exists for
  dashboard-uploaded or migrated videos; those go straight to `READY`.

## Video Record Shape

Returned by most endpoints:

```json
{
  "id": "uuid",
  "title": "Week 1 — Introduction to Algebra",
  "bunnyVideoId": "abc123-bunny-stream-id",
  "durationSeconds": 5400,
  "status": "READY",
  "classSessionId": "uuid",
  "createdAt": "2026-05-18T09:00:00.000Z",
  "updatedAt": "2026-05-18T09:00:00.000Z",
  "classSession": {
    "id": "uuid",
    "title": "Session Title",
    "date": "2026-05-18T09:00:00.000Z",
    "courseId": "uuid"
  }
}
```

> **Note:** `classSession` relation is included on create and list responses. It is omitted on update responses (metadata-only). `status` is one of `UPLOADING` | `READY` | `FAILED`.

---

## Endpoints Summary

| Method | Path | Auth Roles | Description |
|--------|------|------------|-------------|
| `POST` | `/uploads` | `TEACHER`, `SUPER_ADMIN` | Start a direct-to-Bunny upload; returns a signed TUS target. |
| `POST` | `/bunny-webhook` | None (HMAC signature, read-only key) | Bunny's processing-complete/failed callback. |
| `POST` | `/` | `ADMIN` | Attach an already-on-Bunny video to a class session (legacy manual flow). |
| `PATCH` | `/:id` | `ADMIN` | Update video title or duration metadata. |
| `DELETE` | `/:id` | `ADMIN` | Remove the video DB record (Bunny asset untouched). |
| `GET` | `/class/:classId` | Any authenticated | List videos for a course (paginated); students see only `READY`. |
| `GET` | `/:id` | Any authenticated | Get single video metadata. |
| `GET` | `/:id/stream` | Any authenticated | Get token-authenticated signed embed URL (+ watermark). `409 VIDEO_NOT_READY` if not yet processed. |

---

## Endpoint Details

### `POST /`

Attaches a Bunny Stream video to a class session. The Bunny video must be uploaded to Bunny Stream separately (via the Bunny dashboard or API). This endpoint only records the association in the database.

**Roles:** `ADMIN` only

**Request Body**

```json
{
  "title": "Week 1 — Introduction to Algebra",
  "bunnyVideoId": "abc123-bunny-stream-video-id",
  "classSessionId": "uuid",
  "durationSeconds": 5400
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | `string` | ✅ | 2–200 characters |
| `bunnyVideoId` | `string` | ✅ | Bunny Stream video identifier |
| `classSessionId` | `string (UUID)` | ✅ | Must reference a non-deleted session |
| `durationSeconds` | `number (int)` | ❌ | For UI display only |

**Success (201)**

```json
{
  "status": "success",
  "data": { "...videoRecordWithSession" },
  "message": "Video recording attached successfully."
}
```

**Errors**

| Status | Code | Cause |
|--------|------|-------|
| 400 | — | Zod validation failure |
| 401 | — | Not authenticated |
| 403 | — | Not `ADMIN` |
| 404 | `CLASS_SESSION_NOT_FOUND` | Session deleted or does not exist |

---

### `PATCH /:id`

Updates a video recording's display metadata. Does **not** touch the Bunny Stream asset.

**Roles:** `ADMIN` only

**Request Body** (all fields optional — send only what changes)

```json
{
  "title": "Week 1 — Introduction to Algebra (Revised)",
  "durationSeconds": 5500
}
```

**Success (200)**

```json
{
  "status": "success",
  "data": { "...videoRecord" },
  "message": "Video recording updated."
}
```

**Errors**

| Status | Code | Cause |
|--------|------|-------|
| 400 | — | Zod validation failure |
| 401 | — | Not authenticated |
| 403 | — | Not `ADMIN` |
| 404 | `VIDEO_NOT_FOUND` | Video does not exist |

---

### `DELETE /:id`

Removes the `VideoRecording` row from the database. **Does not delete the video from Bunny Stream.** The Bunny asset must be removed manually from the Bunny dashboard if desired.

**Roles:** `ADMIN` only

**Success (200)**

```json
{
  "status": "success",
  "data": null,
  "message": "Video recording removed."
}
```

**Errors**

| Status | Code | Cause |
|--------|------|-------|
| 401 | — | Not authenticated |
| 403 | — | Not `ADMIN` |
| 404 | `VIDEO_NOT_FOUND` | Video does not exist |

---

### `GET /class/:classId`

Lists all video recordings attached to sessions belonging to a specific course. Sessions that have been soft-deleted are **excluded** automatically.

**Roles:** Any authenticated user

**Path Parameter:** `classId` — UUID of the Course

**Query Parameters**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | `number` | `1` | — | Page number |
| `limit` | `number` | `20` | `50` | Results per page |

**Success (200)**

```json
{
  "status": "success",
  "data": [
    { "...videoRecordWithSession" }
  ],
  "count": 12,
  "page": 1,
  "limit": 20
}
```

Results are ordered by class session date (newest first).

**Errors**

| Status | Code | Cause |
|--------|------|-------|
| 401 | — | Not authenticated |
| 404 | `CLASS_NOT_FOUND` | Course does not exist |

---

### `GET /:id`

Fetches metadata for a single video recording. Does **not** generate a stream URL.

**Roles:** Any authenticated user

**Success (200)**

```json
{
  "status": "success",
  "data": { "...videoRecordWithSession" }
}
```

**Errors**

| Status | Code | Cause |
|--------|------|-------|
| 401 | — | Not authenticated |
| 404 | `VIDEO_NOT_FOUND` | Video does not exist |

---

### `GET /:id/stream`

Issues a **token-authenticated Bunny embed URL** (time-limited) for a video, only after the
enrolled-AND-paid gate. Playback protection is Bunny's own: **Embed View Token Authentication**
(+ optional **MediaCage DRM** — Widevine/FairPlay) enabled on the library; we additionally overlay a
per-student watermark client-side.

**Roles:** Any authenticated user (student path runs the enrolled+paid gate)

**Security model**

- The library must have **Embed View Token Authentication** enabled (Stream → library → Security), and
  its **Token Authentication Key** set as `BUNNY_TOKEN_KEY`. Direct-play is off, so an unsigned URL
  won't play.
- Embed token = `SHA256_HEX(BUNNY_TOKEN_KEY + videoId + expires)`, appended as `?token=…&expires=…`
  (`generateBunnyEmbedToken`) — signed **server-side only**.
- Token lifetime: **4 hours** (`BUNNY_TOKEN_TTL_SECONDS`). DRM (if enabled) blocks download/capture in
  the browser; the moving watermark deters phone-camera capture.

**Response Shape**

```json
{
  "status": "success",
  "data": {
    "videoId": "uuid",
    "title": "Week 1 — Introduction to Algebra",
    "durationSeconds": 5400,
    "embedUrl": "https://iframe.mediadelivery.net/embed/123456/abc123?token=<hex>&expires=1234567890&autoplay=false&preload=false",
    "watermark": "Nimal Perera · #42",
    "expiresAt": 1234567890
  },
  "message": "Signed embed URL generated. Token expires automatically."
}
```

| Field | Description |
|-------|-------------|
| `embedUrl` | Token-authenticated Bunny iframe player — the frontend renders it in an `<iframe allow="encrypted-media …">` (DRM enforced by Bunny) |
| `watermark` | Per-viewer text (`name · #index`) the client overlays over the player |
| `expiresAt` | Unix timestamp when the token expires — use for client-side expiry countdown |

**Black Screen Detection (plan §9)**

If a student using an external monitor sees a black screen while audio plays, instruct them to:
1. Disconnect external monitors, or
2. Disable "Hardware Acceleration" in Chrome settings

This is an HDCP triggering issue with their hardware — the DRM is working as intended.

**Errors**

| Status | Code | Cause |
|--------|------|-------|
| 401 | — | Not authenticated |
| 404 | `VIDEO_NOT_FOUND` | Video does not exist |

---

## Running the Test Script

```bash
# Server must be running:
npm run dev

# In a separate terminal:
npx tsx src/scripts/test-videos.ts
```

### Environment Variables Required

| Variable | Example | Description |
|----------|---------|-------------|
| `LMS_ADMIN_EMAIL` | `admin@lms.com` | Existing Admin account email |
| `LMS_ADMIN_PASSWORD` | `adminpassword123` | Admin account password |
| `BUNNY_API_KEY` | `abc123...` | Bunny Stream library API key |
| `BUNNY_LIBRARY_ID` | `123456` | Bunny Stream library ID |
| `BUNNY_CDN_HOSTNAME` | `https://vz-xxx.b-cdn.net` | Pull-zone CDN hostname |
| `TEST_BUNNY_VIDEO_ID` | `abc-video-id` | Optional: a real Bunny video ID for richer tests |

> **Note:** The test creates real database records (Course + ClassSession) and cleans up the VideoRecording. The Course and Session are printed at teardown for manual cleanup if needed.
