import { z } from 'zod';
import { RATE_LIMIT_GLOBAL_MAX, RATE_LIMIT_AUTH_MAX } from '../utils/constants';
import dotenv from 'dotenv';
import { SMS_DRIVERS, STORAGE_DRIVERS, findLocalDrivers } from './drivers';

dotenv.config();

const resolvedEnv = {
  ...process.env,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY ?? '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_KEY ?? '',
  R2_ENDPOINT: process.env.R2_ENDPOINT ?? '',
};

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Rate limits per minute
  RATE_LIMIT_GLOBAL_ANON_MAX: z.coerce.number().int().positive().default(RATE_LIMIT_GLOBAL_MAX),
  RATE_LIMIT_GLOBAL_USER_MAX: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_LOGIN_ACCOUNT_MAX: z.coerce.number().int().positive().default(RATE_LIMIT_AUTH_MAX),
  RATE_LIMIT_LOGIN_IP_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_REGISTER_IP_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_REFRESH_MAX: z.coerce.number().int().positive().default(20),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  // A refresh token presented again within this many seconds of its rotation is a duplicate, not theft. 0 disables.
  // An empty value (e.g. `REFRESH_REUSE_GRACE_SECONDS=` in .env) means unset, not 0.
  REFRESH_REUSE_GRACE_SECONDS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(60).default(10),
  ),

  // Frontend URL (CORS)
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Provider drivers — default to the real provider; local stand-ins are for
  // offline Docker development only and are refused in production (see below).
  STORAGE_DRIVER: z.enum(STORAGE_DRIVERS).default('r2'),
  SMS_DRIVER: z.enum(SMS_DRIVERS).default('notify'),

  // Cloudflare R2 (Exam PDFs)
  // Optional at boot — validated at runtime when presigned URLs are generated.
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_ENDPOINT: z.string().default(''),
  // Browser-reachable S3 endpoint used ONLY to sign presigned URLs (local driver:
  // the server reaches storage at http://storage:9000, the browser at http://localhost:9000).
  // Empty means "same as R2_ENDPOINT".
  R2_PRESIGN_ENDPOINT: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_PUBLIC_URL: z.string().default(''),
  R2_PUBLIC_BUCKET_NAME: z.string().default(''),

  // Bunny.net Video Streaming (Bunny Stream)
  // Required at boot in production; validated at runtime in other environments.
  BUNNY_API_KEY: z.string().default(''),
  // Read-Only API key — the HMAC secret Bunny signs Stream webhooks with
  // (https://docs.bunny.net/stream/webhooks).
  BUNNY_READ_ONLY_API_KEY: z.string().default(''),
  BUNNY_LIBRARY_ID: z.string().default(''),
  // The pull-zone CDN base URL, e.g. https://vz-xxxxxxxx.b-cdn.net
  BUNNY_CDN_HOSTNAME: z.string().default(''),
  // The library "Token Authentication Key" (Stream > library > Security), used to
  // sign the embed player token: SHA256(tokenKey + videoId + expires).
  BUNNY_TOKEN_KEY: z.string().default(''),
  // Unused legacy setting, kept so existing environment files still parse.
  BUNNY_WEBHOOK_SECRET: z.string().default(''),

  // Zoom — Server-to-Server OAuth app (Webhooks + REST API: create meetings, fetch ZAK).
  ZOOM_WEBHOOK_SECRET: z.string().default(''),
  ZOOM_WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  ZOOM_ACCOUNT_ID: z.string().default(''),
  ZOOM_CLIENT_ID: z.string().default(''),
  ZOOM_CLIENT_SECRET: z.string().default(''),
  // Zoom — Meeting SDK app (separate app in the Zoom Marketplace; signs the
  // browser's join/start JWT — see live-class.endpoints.md). NOT the same
  // credentials as the Server-to-Server OAuth app above.
  ZOOM_SDK_KEY: z.string().default(''),
  ZOOM_SDK_SECRET: z.string().default(''),

  // PayHere (Payments)
  // Optional at boot — validated at runtime when checkout is requested.
  PAYHERE_MERCHANT_ID: z.string().default(''),
  PAYHERE_MERCHANT_SECRET: z.string().default(''),
  PAYHERE_BASE_URL: z.string().default('https://sandbox.payhere.lk'),
  PAYHERE_RETURN_URL: z.string().default(''),
  PAYHERE_CANCEL_URL: z.string().default(''),
  PAYHERE_NOTIFY_URL: z.string().default(''),

  // Notify.lk (SMS)
  // Optional at boot — validated when jobs are enqueued or processed.
  NOTIFY_SEND_URL: z.string().url().default('https://app.notify.lk/api/v1/send'),
  NOTIFY_API_KEY: z.string().default(''),
  NOTIFY_USER_ID: z.string().default(''),
  NOTIFY_SENDER_ID: z.string().default(''),

  // SMS toggles
  SMS_BULK_PAYMENT_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Sentry
  SENTRY_DSN: z.string().default(''),
});

// Fail fast — crash on boot if env is invalid
const parsed = envSchema.safeParse(resolvedEnv);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Enforce full external service configuration in production
if (env.NODE_ENV === 'production') {
  const localDrivers = findLocalDrivers(env);
  if (localDrivers.length > 0) {
    console.error('❌ Local/mock provider drivers are not allowed in production:', localDrivers);
    process.exit(1);
  }

  if (env.R2_PRESIGN_ENDPOINT) {
    console.error('❌ R2_PRESIGN_ENDPOINT is for the local storage driver and must be unset in production.');
    process.exit(1);
  }

  const missing: string[] = [];

  const hasR2Endpoint = Boolean(env.R2_ENDPOINT || env.R2_ACCOUNT_ID);
  if (!env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!env.R2_BUCKET_NAME) missing.push('R2_BUCKET_NAME');
  if (!hasR2Endpoint) missing.push('R2_ENDPOINT or R2_ACCOUNT_ID');

  if (!env.BUNNY_API_KEY) missing.push('BUNNY_API_KEY');
  if (!env.BUNNY_READ_ONLY_API_KEY) missing.push('BUNNY_READ_ONLY_API_KEY');
  if (!env.BUNNY_LIBRARY_ID) missing.push('BUNNY_LIBRARY_ID');
  if (!env.BUNNY_CDN_HOSTNAME) missing.push('BUNNY_CDN_HOSTNAME');
  if (!env.BUNNY_TOKEN_KEY) missing.push('BUNNY_TOKEN_KEY');

  if (!env.ZOOM_WEBHOOK_SECRET) missing.push('ZOOM_WEBHOOK_SECRET');
  if (!env.ZOOM_ACCOUNT_ID) missing.push('ZOOM_ACCOUNT_ID');
  if (!env.ZOOM_CLIENT_ID) missing.push('ZOOM_CLIENT_ID');
  if (!env.ZOOM_CLIENT_SECRET) missing.push('ZOOM_CLIENT_SECRET');
  if (!env.ZOOM_SDK_KEY) missing.push('ZOOM_SDK_KEY');
  if (!env.ZOOM_SDK_SECRET) missing.push('ZOOM_SDK_SECRET');

  if (!env.PAYHERE_MERCHANT_ID) missing.push('PAYHERE_MERCHANT_ID');
  if (!env.PAYHERE_MERCHANT_SECRET) missing.push('PAYHERE_MERCHANT_SECRET');
  if (!env.PAYHERE_RETURN_URL) missing.push('PAYHERE_RETURN_URL');
  if (!env.PAYHERE_CANCEL_URL) missing.push('PAYHERE_CANCEL_URL');
  if (!env.PAYHERE_NOTIFY_URL) missing.push('PAYHERE_NOTIFY_URL');

  if (!env.NOTIFY_SEND_URL) missing.push('NOTIFY_SEND_URL');
  if (!env.NOTIFY_USER_ID) missing.push('NOTIFY_USER_ID');
  if (!env.NOTIFY_API_KEY) missing.push('NOTIFY_API_KEY');
  if (!env.NOTIFY_SENDER_ID) missing.push('NOTIFY_SENDER_ID');

  if (missing.length > 0) {
    console.error('❌ Missing required production environment variables:', missing);
    process.exit(1);
  }

  // Sentry is optional observability — warn, but never block boot on it.
  if (!env.SENTRY_DSN) {
    console.warn('⚠️  SENTRY_DSN not set — crash reporting is disabled.');
  }
}
