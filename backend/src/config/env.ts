import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// More robust dotenv loading - search for .env in the backend root
// works whether running from src/ (dev) or dist/ (prod)
dotenv.config({ path: path.join(__dirname, '../../.env') });

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

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Frontend URL (CORS) - Support comma-separated origins
  FRONTEND_URL: z
    .string()
    .default('http://localhost:3000')
    .transform((val) => {
      const origins = val.split(',').map((o) => o.trim().replace(/\/$/, ''));
      return origins.length === 1 ? origins[0] : origins;
    }),

  // Cloudflare R2 (Exam PDFs)
  // Optional at boot — validated at runtime when presigned URLs are generated.
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_ENDPOINT: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_PUBLIC_URL: z.string().default(''),

  // Bunny.net Video Streaming (Bunny Stream)
  // Optional at boot — validated at runtime when stream URLs are requested.
  // Server starts without these; a clear AppError is thrown if they are missing
  // when a student tries to get a stream URL.
  BUNNY_API_KEY: z.string().default(''),
  BUNNY_LIBRARY_ID: z.string().default(''),
  // The pull-zone CDN base URL, e.g. https://vz-xxxxxxxx.b-cdn.net
  BUNNY_CDN_HOSTNAME: z.string().default(''),

  // Zoom (Webhooks)
  ZOOM_WEBHOOK_SECRET: z.string().default(''),
  ZOOM_ACCOUNT_ID: z.string().default(''),
  ZOOM_CLIENT_ID: z.string().default(''),
  ZOOM_CLIENT_SECRET: z.string().default(''),

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

  // Resend (Email)
  // Optional at boot — validated when jobs are enqueued or processed.
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM_EMAIL: z.string().default(''),
  RESEND_REPLY_TO_EMAIL: z.string().default(''),

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
  const missing: string[] = [];

  const hasR2Endpoint = Boolean(env.R2_ENDPOINT || env.R2_ACCOUNT_ID);
  if (!env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!env.R2_BUCKET_NAME) missing.push('R2_BUCKET_NAME');
  if (!hasR2Endpoint) missing.push('R2_ENDPOINT or R2_ACCOUNT_ID');

  if (!env.BUNNY_API_KEY) missing.push('BUNNY_API_KEY');
  if (!env.BUNNY_LIBRARY_ID) missing.push('BUNNY_LIBRARY_ID');
  if (!env.BUNNY_CDN_HOSTNAME) missing.push('BUNNY_CDN_HOSTNAME');

  if (!env.ZOOM_WEBHOOK_SECRET) missing.push('ZOOM_WEBHOOK_SECRET');

  if (!env.PAYHERE_MERCHANT_ID) missing.push('PAYHERE_MERCHANT_ID');
  if (!env.PAYHERE_MERCHANT_SECRET) missing.push('PAYHERE_MERCHANT_SECRET');
  if (!env.PAYHERE_RETURN_URL) missing.push('PAYHERE_RETURN_URL');
  if (!env.PAYHERE_CANCEL_URL) missing.push('PAYHERE_CANCEL_URL');
  if (!env.PAYHERE_NOTIFY_URL) missing.push('PAYHERE_NOTIFY_URL');

  if (!env.NOTIFY_SEND_URL) missing.push('NOTIFY_SEND_URL');
  if (!env.NOTIFY_USER_ID) missing.push('NOTIFY_USER_ID');
  if (!env.NOTIFY_API_KEY) missing.push('NOTIFY_API_KEY');
  if (!env.NOTIFY_SENDER_ID) missing.push('NOTIFY_SENDER_ID');

  if (!env.SENTRY_DSN) missing.push('SENTRY_DSN');

  if (missing.length > 0) {
    console.error('❌ Missing required production environment variables:', missing);
    process.exit(1);
  }
}
