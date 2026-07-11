# Bunny Stream video — secure playback (token + DRM), webhook, end-to-end — Design

_Date: 2026-07-11 · Branch: `feature/bunny-video-drm` (off `dev`)_

## 1. Goal

Make recorded-video **upload → processing → playback** work correctly and securely against the real
Bunny Stream library, using Bunny's **token-authenticated iframe embed player** (real MediaCage DRM +
Bunny protection) with a **per-student watermark overlay**. Fix the two real bugs found (webhook
status codes; insecure webhook auth) and the broken playback token. Uploads stay **direct-to-Bunny**
(bytes never touch our server); completion is confirmed by **Bunny's webhook**, server-to-server.

## 2. What's broken today (diagnosis)

1. **Webhook status codes wrong** (`utils/bunny.ts` `resolveBunnyWebhookStatus`): treats `6`
   (*PresignedUploadStarted*) as a failure and never handles `3` (*Finished*). Per
   <https://docs.bunny.net/stream/webhooks>: `0` Queued, `1` Processing, `2` Encoding, **`3` Finished**,
   **`4` Resolution finished (playable)**, **`5` Failed**, `6` PresignedUploadStarted, `7`
   PresignedUploadFinished, **`8` PresignedUploadFailed**, `9`/`10` captions/metadata.
2. **Webhook auth is the legacy `?secret=` query param.** Bunny now signs webhooks: HMAC-SHA256 over
   the **raw body**, secret = the **Read-Only API key**, in header `X-BunnyStream-Signature`
   (`X-BunnyStream-Signature-Version: v1`, `-Algorithm: hmac-sha256`). Constant-time compare.
3. **Playback token wrong**: signed with `BUNNY_API_KEY` + an `HS256-` HMAC. Bunny embed token is
   `SHA256_HEX(tokenKey + videoId + expiration)` with the **library Token Authentication Key**
   (`BUNNY_TOKEN_KEY`, currently empty).
4. **No videos in the library yet** + player uses raw HLS (no DRM, no real watermark).

## 3. Dashboard prerequisites (owner — done before implementation)

- **Stream → library 702267 → Security:** enable **Token Authentication** (embed), enable **DRM
  (MediaCage)** if the plan allows, optionally enable Bunny's watermark. Copy the **Token
  Authentication Key** → `BUNNY_TOKEN_KEY` in `backend/.env`.
- **Stream → library → Webhook:** set URL to `https://<public-host>/api/videos/bunny-webhook`
  (dev: `ngrok http 80` → the tunnel URL). No `?secret=` needed (signature-verified).
- Recreate the backend so it picks up `BUNNY_TOKEN_KEY` (`docker compose up -d backend`).

## 4. Backend changes

### 4.1 `utils/bunny.ts`
- **`resolveBunnyWebhookStatus`**: `3 || 4 → READY`; `5 || 8 → FAILED`; else `null`. Replace the
  wrong `6`-as-failure constant.
- **`generateBunnyEmbedToken(videoId, expires)`**: `SHA256_HEX(env.BUNNY_TOKEN_KEY + videoId + expires)`.
  Require `BUNNY_TOKEN_KEY` (throw `BUNNY_NOT_CONFIGURED` if empty).
- **`getSignedBunnyEmbedUrl(videoId)`**: returns
  `https://iframe.mediadelivery.net/embed/{lib}/{videoId}?token=…&expires=…` plus a few player params
  (`autoplay=false`). Keep TUS upload + `createBunnyVideo` as-is (upload path already correct;
  re-verify the TUS signature format live).
- **`verifyBunnyWebhookSignature(rawBody, signatureHeader)`**: `HMAC_SHA256(readOnlyKey, rawBody)` hex,
  `crypto.timingSafeEqual`. Keep the `?secret=` check as an optional extra layer only if present.

### 4.2 Webhook raw body
The signature needs the **exact raw bytes**. Add a raw-body capture for `POST /api/videos/bunny-webhook`
(an `express.json({ verify })` stash of `req.rawBody`, or `express.raw` on that route) — parsing then
re-serializing would break the HMAC.

### 4.3 `video.service.generateStreamUrl` + controller + `StreamData`
Return a **signed embed URL** + **watermark identity** instead of the raw HLS URL:
`{ videoId, title, durationSeconds, embedUrl (signed), watermark: "<name> · #<index>", expiresAt }`.
Gate unchanged (enrolled + current-month paid → `assertStudentContentAccess(requirePaid:true)`), and
still requires `status === READY`. Drop the IP-bound HLS `streamUrl` (Bunny's embed token +
DRM replace it). `durationSeconds`/status flow unchanged.

## 5. Frontend changes (`VideoPlayer.tsx`)

- Fetch `GET /videos/:id/stream` (browser-side — unchanged gating/errors: `VIDEO_NOT_READY`,
  `PAYMENT_REQUIRED`, `NOT_ENROLLED`).
- Render Bunny's **iframe** (`src = data.embedUrl`, `allow="encrypted-media; fullscreen; picture-in-picture"`,
  `allowfullscreen`) inside an `aspect-video` frame — **remove hls.js** and the `<video>`/`streamUrl` path.
- **Per-student watermark overlay**: an absolutely-positioned, `pointer-events-none`, low-opacity div
  over the iframe showing `data.watermark`, repositioning on an interval (deters phone-camera capture;
  DRM/Bunny handles download/screen-capture at the browser level).
- Drop `hls.js` dependency usage here.

## 6. Upload flow (verify, likely unchanged)

`POST /videos/uploads` → `createBunnyVideo` (management API, server-side, AccessKey) → DB row
`UPLOADING` → signed TUS target to the browser → **browser uploads straight to Bunny** (bytes never
hit our server) → Bunny webhook flips to `READY`. Re-verify the TUS `AuthorizationSignature`
(`SHA256(libraryId + apiKey + expire + videoId)`) against a real upload; fix only if Bunny rejects.

## 7. Testing

- **Backend Vitest**: `resolveBunnyWebhookStatus` (3/4→READY, 5/8→FAILED, 6/7/others→null);
  `generateBunnyEmbedToken` (deterministic SHA256_HEX of key+videoId+expires);
  `verifyBunnyWebhookSignature` (valid vs tampered body vs wrong key; constant-time). Per §3.4.
- **System**: backend + frontend build/tsc; lint.
- **Live end-to-end (needs the owner's dashboard + key + ngrok):**
  1. Teacher uploads a video via `/classes/[id]/videos/new` → bytes go **direct to Bunny** (verify our
     server never sees them; DB row `UPLOADING`).
  2. Bunny webhook hits `ngrok → /api/videos/bunny-webhook`, **signature verifies**, row → `READY`.
  3. Enrolled+paid student opens the video → **signed Bunny iframe plays**, watermark shows; sharing the
     signed URL from another IP/after expiry fails.
  4. Not-enrolled / unpaid → gated (no token minted). Non-existent/processing → friendly states.
- Headless smoke can drive the gates + that the signed iframe renders; **actual DRM playback needs a
  real browser + a processed video** (documented manual check).

## 8. Docs

- `context/api_endpoints/video.endpoints.md`: new secure-embed response shape, webhook HMAC
  verification (read-only key, raw body, `X-BunnyStream-Signature`), the corrected status-code table,
  and the webhook-URL / token-key / DRM dashboard steps.
- `context/frontend/06-frontend-roadmap.md`: video player now Bunny embed + token + DRM + watermark.

## 9. Definition of done

- Correct webhook status mapping + HMAC signature verification (read-only key, raw body).
- Signed embed URL + watermark from `GET /videos/:id/stream`; iframe player renders it; hls.js path
  removed.
- Backend Vitest for the three pure functions; builds/lint green.
- Live end-to-end verified once `BUNNY_TOKEN_KEY` + webhook + a test video exist (upload → webhook →
  gated DRM playback), with the manual DRM-playback check noted.
- Docs updated.
