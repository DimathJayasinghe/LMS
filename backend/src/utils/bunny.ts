import { createHash, createHmac } from 'crypto';
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

/**
 * Constructs the Bunny Stream embed URL (iframe-based player).
 * Used when the client wants to use the Bunny-hosted player instead of HLS.js.
 * This URL is not token-signed — token auth must be configured at the pull-zone level.
 */
export const getBunnyEmbedUrl = (bunnyVideoId: string): string => {
  return `https://iframe.mediadelivery.net/embed/${env.BUNNY_LIBRARY_ID}/${bunnyVideoId}`;
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
 * Bunny's Video Library webhook status codes
 * (https://docs.bunny.net/docs/stream-webhooks). We only act on the terminal
 * states — everything else (Created/Uploaded/Processing/Transcoding) is left
 * as UPLOADING so we never flip a still-processing video to a wrong state.
 */
const BUNNY_STATUS_FINISHED = 4;
const BUNNY_STATUS_ERROR = 5;
const BUNNY_STATUS_UPLOAD_FAILED = 6;

/** Maps a Bunny webhook `Status` code to our VideoStatus, or `null` if it's a mid-flight status we don't act on. */
export const resolveBunnyWebhookStatus = (status: number): 'READY' | 'FAILED' | null => {
  if (status === BUNNY_STATUS_FINISHED) return 'READY';
  if (status === BUNNY_STATUS_ERROR || status === BUNNY_STATUS_UPLOAD_FAILED) return 'FAILED';
  return null;
};
