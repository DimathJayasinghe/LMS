import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { redis } from '@/config/redis';
import { AppError } from '@/utils/app-error';
import { ZOOM_ACCESS_TOKEN_CACHE_TTL_SECONDS, ZOOM_SDK_JWT_TTL_SECONDS } from '@/utils/constants';

/**
 * Live classes (Zoom) — scheduling + Meeting SDK join/host signing.
 *
 * TWO separate Zoom apps are involved, deliberately kept apart:
 *  - Server-to-Server OAuth app (ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET) —
 *    calls the REST API to create meetings and fetch the host's ZAK. Also
 *    verifies the existing attendance webhook (unrelated to this file).
 *  - Meeting SDK app (ZOOM_SDK_KEY/SECRET) — signs the JWT the browser hands
 *    to the embedded Meeting SDK to join/start a meeting.
 *
 * Architecture: a single Zoom Licensed account hosts every meeting; our own
 * DB (Enrollment/Payment) — not Zoom's account model — decides who may join
 * as host vs participant. Per Zoom's Meeting SDK authorization model, this is
 * "join a meeting WITHIN the app owner's account" — no On-Behalf-Of (OBF)
 * token is required (OBF only applies to joining meetings hosted by a
 * genuinely different, external Zoom account). See:
 * https://developers.zoom.us/docs/meeting-sdk/obf-faq/
 */

const assertZoomConfigured = (): void => {
  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    throw new AppError(
      'ZOOM_NOT_CONFIGURED',
      503,
      'Live classes are not configured. Please set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.',
    );
  }
};

const assertZoomSdkConfigured = (): void => {
  if (!env.ZOOM_SDK_KEY || !env.ZOOM_SDK_SECRET) {
    throw new AppError(
      'ZOOM_SDK_NOT_CONFIGURED',
      503,
      'Live classes are not configured. Please set ZOOM_SDK_KEY and ZOOM_SDK_SECRET.',
    );
  }
};

const ZOOM_ACCESS_TOKEN_CACHE_KEY = 'zoom:s2s-access-token';

/**
 * Server-to-Server OAuth access token (account_credentials grant), cached in
 * Redis so we don't mint a new one on every REST call — Zoom's tokens live
 * ~1h; we cache for a bit under that.
 */
export const getZoomAccessToken = async (): Promise<string> => {
  assertZoomConfigured();

  const cached = await redis.get(ZOOM_ACCESS_TOKEN_CACHE_KEY).catch(() => null);
  if (cached) return cached;

  const basic = Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
  );

  if (!res.ok) {
    throw new AppError('ZOOM_AUTH_FAILED', 502, `Zoom rejected the OAuth request (${res.status}).`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new AppError('ZOOM_AUTH_FAILED', 502, 'Zoom did not return an access token.');
  }

  await redis
    .set(ZOOM_ACCESS_TOKEN_CACHE_KEY, data.access_token, 'EX', ZOOM_ACCESS_TOKEN_CACHE_TTL_SECONDS)
    .catch(() => undefined); // cache is an optimization — a miss just means we re-auth next call

  return data.access_token;
};

export interface CreatedZoomMeeting {
  meetingId: string;
  joinUrl: string;
  password: string;
}

/**
 * Creates a Zoom meeting via the REST API, locked down per the live-class
 * hardening plan (context/documents/02-architecture.md §7.1):
 *  - No cloud/local recording, no join-before-host, waiting room on,
 *    participants muted + video off on entry, host must approve join.
 *  - Real capture prevention is NOT possible on the Web SDK (no HDCP) — these
 *    settings + the join-time watermark are the deterrent layer, not a DRM
 *    claim. See the roadmap decision log for the full reasoning.
 */
export const createZoomMeeting = async (
  topic: string,
  startTime: Date,
  durationMinutes: number,
): Promise<CreatedZoomMeeting> => {
  const token = await getZoomAccessToken();

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic,
      type: 2, // scheduled meeting
      start_time: startTime.toISOString(),
      duration: durationMinutes,
      timezone: 'Asia/Colombo',
      password: undefined, // let Zoom generate one
      settings: {
        auto_recording: 'none',
        join_before_host: false,
        waiting_room: true,
        approval_type: 0, // automatically approve (waiting room still gates entry)
        mute_upon_entry: true,
        host_video: true,
        participant_video: false,
      },
    }),
  });

  if (!res.ok) {
    throw new AppError('ZOOM_CREATE_FAILED', 502, `Zoom rejected the meeting creation request (${res.status}).`);
  }

  const data = (await res.json()) as { id?: number; join_url?: string; password?: string };
  if (!data.id || !data.join_url) {
    throw new AppError('ZOOM_CREATE_FAILED', 502, 'Zoom did not return a meeting ID.');
  }

  return { meetingId: String(data.id), joinUrl: data.join_url, password: data.password ?? '' };
};

/**
 * Fetches a ZAK (Zoom Access Key) for the host account — required (alongside
 * the signature) for the Meeting SDK to START a meeting as host. Fetched
 * fresh right before use per Zoom's own guidance (ZAKs are short-lived).
 */
export const getZoomHostZak = async (): Promise<string> => {
  const token = await getZoomAccessToken();

  const res = await fetch('https://api.zoom.us/v2/users/me/token?type=zak', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new AppError('ZOOM_ZAK_FAILED', 502, `Zoom rejected the ZAK request (${res.status}).`);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new AppError('ZOOM_ZAK_FAILED', 502, 'Zoom did not return a ZAK.');
  }

  return data.token;
};

export interface MeetingSdkSignature {
  signature: string;
  sdkKey: string;
  expiresAt: number;
}

/**
 * Signs the Meeting SDK JWT the browser hands to `client.join()`. Payload
 * shape per Zoom's Meeting SDK auth docs (sdkKey/appKey duplicated — Zoom's
 * own sample sets both to the same value):
 *   { sdkKey, mn, role, iat, exp, appKey, tokenExp }
 * role: 1 = host (start), 0 = participant (join).
 */
export const generateMeetingSdkSignature = (
  meetingNumber: string,
  role: 0 | 1,
): MeetingSdkSignature => {
  assertZoomSdkConfigured();

  const iat = Math.floor(Date.now() / 1000) - 30; // small backdate for clock skew tolerance
  const exp = iat + ZOOM_SDK_JWT_TTL_SECONDS;

  const signature = jwt.sign(
    {
      sdkKey: env.ZOOM_SDK_KEY,
      mn: meetingNumber,
      role,
      iat,
      exp,
      appKey: env.ZOOM_SDK_KEY,
      tokenExp: exp,
    },
    env.ZOOM_SDK_SECRET,
    { algorithm: 'HS256' },
  );

  return { signature, sdkKey: env.ZOOM_SDK_KEY, expiresAt: exp };
};
