# Video Recordings API Endpoints

This document describes all video recording endpoints in the LMS backend.

## Base URL

```
http://localhost:5000/api/videos
```

## Authentication

All endpoints require the standard `access_token` HTTP-only cookie (except where noted as public — there are none; all video routes require authentication).

## Video Record Shape

Returned by most endpoints:

```json
{
  "id": "uuid",
  "title": "Week 1 — Introduction to Algebra",
  "bunnyVideoId": "abc123-bunny-stream-id",
  "durationSeconds": 5400,
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

> **Note:** `classSession` relation is included on create and list responses. It is omitted on update responses (metadata-only).

---

## Endpoints Summary

| Method | Path | Auth Roles | Description |
|--------|------|------------|-------------|
| `POST` | `/` | `ADMIN` | Attach a Bunny Stream video to a class session. |
| `PATCH` | `/:id` | `ADMIN` | Update video title or duration metadata. |
| `DELETE` | `/:id` | `ADMIN` | Remove the video DB record (Bunny asset untouched). |
| `GET` | `/class/:classId` | Any authenticated | List all videos for a course (paginated). |
| `GET` | `/:id` | Any authenticated | Get single video metadata. |
| `GET` | `/:id/stream` | Any authenticated | Get IP-bound signed stream URL. |

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

Generates an **IP-bound**, time-limited signed URL for streaming a video directly from Bunny's CDN. This is the primary DRM mechanism.

**Roles:** Any authenticated user

**Security Model (plan §13 — The Telegram Pirate Fix)**

The returned `streamUrl` is signed using the student's current IP address (`req.ip`) embedded in the HMAC-SHA256 signature. If the URL is shared externally (e.g. posted in Telegram), Bunny.net's CDN rejects the request with `403 Forbidden` because the viewer's IP does not match the IP embedded in the token.

- Token lifetime: **4 hours** (configurable via `BUNNY_TOKEN_TTL_SECONDS`)
- Token algorithm: `HMAC-SHA256(securityKey, signaturePath + expires + signingData + clientIp)`
- Token format: `HS256-` prefix + Base64 URL-safe encoded digest

**Response Shape**

```json
{
  "status": "success",
  "data": {
    "videoId": "uuid",
    "title": "Week 1 — Introduction to Algebra",
    "durationSeconds": 5400,
    "streamUrl": "https://vz-example.b-cdn.net/123456/abc123/playlist.m3u8?token=HS256-xxxxx&expires=1234567890",
    "embedUrl": "https://iframe.mediadelivery.net/embed/123456/abc123",
    "expiresAt": 1234567890
  },
  "message": "Stream URL generated. URL is IP-bound and expires automatically."
}
```

| Field | Description |
|-------|-------------|
| `streamUrl` | HLS M3U8 playlist URL — use with HLS.js or a native `<video>` player |
| `embedUrl` | Bunny-hosted iframe player — use when you want Bunny's built-in player UI |
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
