import { createHmac } from 'crypto';
import { env } from '@/config/env';
import { AppError } from '@/utils/app-error';
import { BUNNY_TOKEN_TTL_SECONDS } from '@/utils/constants';

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

export const generateBunnyStreamUrl = (
  bunnyVideoId: string,
  clientIp: string,
): BunnyStreamUrl => {
  // Guard: fail with a clear error if Bunny is not configured yet.
  // The server boots without these vars; they are only required at stream-time.
  if (!env.BUNNY_API_KEY || !env.BUNNY_LIBRARY_ID || !env.BUNNY_CDN_HOSTNAME) {
    throw new AppError(
      'BUNNY_NOT_CONFIGURED',
      503,
      'Video streaming is not configured. Please set BUNNY_API_KEY, BUNNY_LIBRARY_ID, and BUNNY_CDN_HOSTNAME in the server environment.',
    );
  }

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
  const streamUrl =
    `${env.BUNNY_CDN_HOSTNAME}${signaturePath}` +
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
