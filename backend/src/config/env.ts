import { z } from 'zod';
import dotenv from 'dotenv';

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

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Frontend URL (CORS)
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

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
});

// Fail fast — crash on boot if env is invalid
const parsed = envSchema.safeParse(resolvedEnv);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
