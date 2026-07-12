import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { env } from '@/config/env';
import { AppError } from '@/utils/app-error';
import {
  BUNNY_MANAGEMENT_BASE_URL,
  BUNNY_TOKEN_TTL_SECONDS,
  BUNNY_TUS_UPLOAD_ENDPOINT,
  BUNNY_UPLOAD_AUTH_TTL_SECONDS,
} from '@/utils/constants';

/**
 * Generates an IP-bound Bunny.net authentication token for a video stream.
 *
 * Implementation follows Bunny's official Node.js reference:
 * https://github.com/BunnyWay/BunnyCDN.TokenAuthentication/blob/master/nodejs/token.js
 *
 * Security model (plan §13 — The Telegram Pirate):
 *  - Token is HMAC-SHA256 signed with the pull-zone security key.
 *  - Token is bound to the requesting student's IP address.
 *  - If the link is shared externally, Bunny rejects it with 403 Forbidden
 *    because the viewer's IP won't match the IP in the token signature.
 *  - Token expires after BUNNY_TOKEN_TTL_SECONDS to limit replay window.
 *
 * Official Bunny token formula:
 *   message   = signaturePath + expires + signingData + userIp
 *   digest    = HMAC-SHA256(securityKey, message)
 *   token     = "HS256-" + base64url(digest)
 */
export interface BunnyStreamUrl {
  /** The signed, IP-bound stream URL to return to the client */
  streamUrl: string;
  /** Token expiry as Unix timestamp (for client-side countdown if needed) */
  expiresAt: number;
}

/** Fails fast with a clear error if Bunny is not configured. Server boots without these vars — they are only required when a video is actually created/streamed. */
const assertBunnyConfigured = (): void => {
  if (!env.BUNNY_API_KEY || !env.BUNNY_LIBRARY_ID || !env.BUNNY_CDN_HOSTNAME) {
    throw new AppError(
      'BUNNY_NOT_CONFIGURED',
      503,
      'Video is not configured. Please set BUNNY_API_KEY, BUNNY_LIBRARY_ID, and BUNNY_CDN_HOSTNAME in the server environment.',
    );
  }
};

export const generateBunnyStreamUrl = (
  bunnyVideoId: string,
  clientIp: string,
): BunnyStreamUrl => {
  assertBunnyConfigured();

  const expires = String(Math.floor(Date.now() / 1000) + BUNNY_TOKEN_TTL_SECONDS);

  // Bunny Stream path format: /{libraryId}/{videoId}/playlist.m3u8
  const signaturePath = `/${env.BUNNY_LIBRARY_ID}/${bunnyVideoId}/playlist.m3u8`;

  // Build message exactly as Bunny's official reference:
  //   message = signaturePath + expires + signingData + userIp
  // signingData is empty because we don't add custom query params (no country filters, etc.)
  const signingData = '';
  const message = `${signaturePath}${expires}${signingData}${clientIp}`;

  // HMAC-SHA256 with security key, then Base64 URL-safe encoding with HS256- prefix
  const digest = createHmac('sha256', env.BUNNY_API_KEY)
    .update(message)
    .digest();

  const token = 'HS256-' + digest
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Build the full CDN URL — query-string format (not directory-based)
  // Normalize: ensure the hostname always has an https:// protocol prefix.
  const cdnBase = env.BUNNY_CDN_HOSTNAME.startsWith('http')
    ? env.BUNNY_CDN_HOSTNAME
    : `https://${env.BUNNY_CDN_HOSTNAME}`;

  const streamUrl =
    `${cdnBase}${signaturePath}` +
    `?token=${token}` +
    `&expires=${expires}`;

  return { streamUrl, expiresAt: Number(expires) };
};

/** Fails fast if the playback token key isn't configured (needed to sign embeds). */
const assertBunnyTokenConfigured = (): void => {
  assertBunnyConfigured();
  if (!env.BUNNY_TOKEN_KEY) {
    throw new AppError(
      'BUNNY_NOT_CONFIGURED',
      503,
      'Secure video playback is not configured. Set BUNNY_TOKEN_KEY (the library Token Authentication Key) in the server environment.',
    );
  }
};

/**
 * Bunny Stream **embed token authentication**
 * (https://docs.bunny.net/docs/stream-embed-token-authentication):
 *   token = SHA256_HEX( tokenKey + videoId + expiration )
 * signed with the library's Token Authentication Key. Server-side only — the
 * key must never reach the browser.
 */
export const generateBunnyEmbedToken = (
  bunnyVideoId: string,
  expires: number,
): string => {
  return createHash('sha256')
    .update(`${env.BUNNY_TOKEN_KEY}${bunnyVideoId}${expires}`)
    .digest('hex');
};

export interface BunnySignedEmbed {
  /** Token-authenticated iframe URL for Bunny's player (DRM handled by Bunny). */
  embedUrl: string;
  /** Token expiry as a Unix timestamp. */
  expiresAt: number;
}

/**
 * Builds a token-authenticated Bunny Stream **iframe embed** URL. Bunny's player
 * enforces the token + any DRM (MediaCage) configured on the library; we add a
 * per-student watermark overlay client-side.
 */
export const getSignedBunnyEmbedUrl = (bunnyVideoId: string): BunnySignedEmbed => {
  assertBunnyTokenConfigured();

  const expiresAt = Math.floor(Date.now() / 1000) + BUNNY_TOKEN_TTL_SECONDS;
  const token = generateBunnyEmbedToken(bunnyVideoId, expiresAt);

  const embedUrl =
    `https://iframe.mediadelivery.net/embed/${env.BUNNY_LIBRARY_ID}/${bunnyVideoId}` +
    `?token=${token}&expires=${expiresAt}&autoplay=false&preload=false`;

  return { embedUrl, expiresAt };
};

/**
 * Creates an empty video entry in the Bunny Stream library (management API,
 * server-side only — this call carries the account's `AccessKey` and must
 * never run in the browser). Returns the Bunny-assigned video GUID, which the
 * browser then uploads the actual file bytes into via TUS (see
 * `generateBunnyTusUpload`). The file itself never touches our server.
 */
export const createBunnyVideo = async (title: string): Promise<{ bunnyVideoId: string }> => {
  assertBunnyConfigured();

  const res = await fetch(`${BUNNY_MANAGEMENT_BASE_URL}/${env.BUNNY_LIBRARY_ID}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: env.BUNNY_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    throw new AppError(
      'BUNNY_CREATE_FAILED',
      502,
      `Bunny rejected the video creation request (${res.status}).`,
    );
  }

  const data = (await res.json()) as { guid?: string };
  if (!data.guid) {
    throw new AppError('BUNNY_CREATE_FAILED', 502, 'Bunny did not return a video ID.');
  }

  return { bunnyVideoId: data.guid };
};

export interface BunnyTusUpload {
  /** Browser-side upload target — a tus-js-client `endpoint`. */
  endpoint: string;
  libraryId: string;
  videoId: string;
  /** TUS `AuthorizationSignature` header value. */
  signature: string;
  /** TUS `AuthorizationExpire` header value (Unix seconds). */
  expire: number;
}

/**
 * Computes the signed TUS (resumable upload) authorization for a Bunny video.
 * The browser uses this directly against Bunny's TUS endpoint — our server
 * never receives the video bytes (architecture §5.6, direct-to-cloud).
 *
 * Formula per Bunny's TUS docs (https://docs.bunny.net/docs/stream-uploading#tus-resumable-uploads):
 *   signature = SHA256(libraryId + apiKey + expiration + videoId)  [hex, not HMAC]
 */
export const generateBunnyTusUpload = (bunnyVideoId: string): BunnyTusUpload => {
  assertBunnyConfigured();

  const expire = Math.floor(Date.now() / 1000) + BUNNY_UPLOAD_AUTH_TTL_SECONDS;
  const signature = createHash('sha256')
    .update(`${env.BUNNY_LIBRARY_ID}${env.BUNNY_API_KEY}${expire}${bunnyVideoId}`)
    .digest('hex');

  return {
    endpoint: BUNNY_TUS_UPLOAD_ENDPOINT,
    libraryId: env.BUNNY_LIBRARY_ID,
    videoId: bunnyVideoId,
    signature,
    expire,
  };
};

/**
 * Bunny's Video Library webhook `Status` codes (https://docs.bunny.net/stream/webhooks):
 *   0 Queued · 1 Processing · 2 Encoding · 3 Finished (fully available) ·
 *   4 Resolution finished (now playable) · 5 Failed encoding ·
 *   6 PresignedUploadStarted · 7 PresignedUploadFinished · 8 PresignedUploadFailed ·
 *   9 CaptionsGenerated · 10 Title/DescriptionGenerated.
 * We only act on the terminal states; everything else stays UPLOADING so a
 * still-processing video is never flipped to a wrong state.
 */
const BUNNY_STATUS_FINISHED = 3;
const BUNNY_STATUS_RESOLUTION_FINISHED = 4;
const BUNNY_STATUS_FAILED = 5;
const BUNNY_STATUS_PRESIGNED_UPLOAD_FAILED = 8;

/** Maps a Bunny webhook `Status` code to our VideoStatus, or `null` if it's a mid-flight status we don't act on. */
export const resolveBunnyWebhookStatus = (status: number): 'READY' | 'FAILED' | null => {
  if (status === BUNNY_STATUS_RESOLUTION_FINISHED || status === BUNNY_STATUS_FINISHED) return 'READY';
  if (status === BUNNY_STATUS_FAILED || status === BUNNY_STATUS_PRESIGNED_UPLOAD_FAILED) return 'FAILED';
  return null;
};

/**
 * Verifies a Bunny Stream webhook signature (https://docs.bunny.net/stream/webhooks):
 * HMAC-SHA256 over the **exact raw request body**, keyed by the library's
 * **Read-Only API key**, compared constant-time to the `X-BunnyStream-Signature`
 * header (64-char lowercase hex). Returns false on any mismatch/missing input.
 */
export const verifyBunnyWebhookSignature = (
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
): boolean => {
  if (!signatureHeader || !env.BUNNY_READ_ONLY_API_KEY) return false;

  const expected = createHmac('sha256', env.BUNNY_READ_ONLY_API_KEY).update(rawBody).digest('hex');

  // Both must be equal-length buffers for timingSafeEqual.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};
