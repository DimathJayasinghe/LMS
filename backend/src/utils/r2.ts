import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/config/env';
import { AppError } from '@/utils/app-error';

let r2Client: S3Client | null = null;

const ensureR2Configured = (): void => {
  const hasCredentials = Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);

  if (!hasCredentials) {
    throw new AppError(
      'R2_NOT_CONFIGURED',
      503,
      'File storage is not configured. Please set R2 credentials in the server environment.',
    );
  }

  if (!env.R2_ENDPOINT && !env.R2_ACCOUNT_ID) {
    throw new AppError(
      'R2_NOT_CONFIGURED',
      503,
      'File storage is not configured. Please set the R2 endpoint or account id.',
    );
  }

  if (!env.R2_BUCKET_NAME) {
    throw new AppError(
      'R2_BUCKET_MISSING',
      503,
      'R2 bucket name is missing. Please set R2_BUCKET_NAME in the server environment.',
    );
  }
};

const getR2Client = (): S3Client => {
  ensureR2Configured();

  if (!r2Client) {
    const endpoint = env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

    r2Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  return r2Client;
};

export const createR2PresignedPutUrl = async (
  key: string,
  contentType: string,
  expiresInSeconds: number,
  bucket: string = env.R2_BUCKET_NAME,
): Promise<string> => {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
};

export const createR2PresignedGetUrl = async (
  key: string,
  expiresInSeconds: number,
  downloadName?: string,
): Promise<string> => {
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ...(downloadName
      ? { ResponseContentDisposition: `attachment; filename="${downloadName.replace(/["\\\r\n]/g, '_')}"` }
      : {}),
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
};

/**
 * Confirms an object actually exists in R2 (a HeadObject read, within the same
 * scoped key permissions). Direct-to-cloud uploads presign a browser PUT but the
 * API never sees the bytes — callers use this to verify the upload really landed
 * before persisting a "done" flag, instead of trusting an eager presign-time write.
 * Returns `{ exists: false }` on 404/NotFound; other errors (auth, network) rethrow.
 */
export const r2HeadObject = async (
  key: string,
  bucket: string = env.R2_BUCKET_NAME,
): Promise<{ exists: boolean; size?: number; contentType?: string }> => {
  const client = getR2Client();
  try {
    const res = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return { exists: true, size: res.ContentLength, contentType: res.ContentType };
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (err as { name?: string })?.name;
    if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') {
      return { exists: false };
    }
    throw err;
  }
};

/**
 * Reads a bounded object into memory for server-side signature inspection.
 * Callers must supply a small upper bound; this prevents an untrusted upload
 * from turning confirmation into an unbounded memory allocation.
 */
export const r2GetObjectBytes = async (
  key: string,
  maxBytes: number,
  bucket: string = env.R2_BUCKET_NAME,
): Promise<Uint8Array> => {
  const client = getR2Client();
  const response = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    Range: `bytes=0-${maxBytes}`,
  }));

  if (!response.Body) {
    throw new AppError('UPLOAD_EMPTY', 422, 'The uploaded file is empty.');
  }

  const bytes = await response.Body.transformToByteArray();
  if (bytes.byteLength > maxBytes) {
    throw new AppError('UPLOAD_TOO_LARGE', 413, 'The uploaded file exceeds the allowed size.');
  }
  return bytes;
};

/**
 * Resolves the public display-asset bucket + its public base URL. These files are
 * served separately from the private NIC/exam-PDF bucket, so
 * this throws 503 until both env vars are set (and the bucket is made public in the
 * Cloudflare dashboard — the app's S3 key cannot enable public access itself).
 */
export const getPublicAssetConfig = (): { bucket: string; publicBaseUrl: string } => {
  ensureR2Configured();
  if (!env.R2_PUBLIC_BUCKET_NAME || !env.R2_PUBLIC_URL) {
    throw new AppError(
      'R2_NOT_CONFIGURED',
      503,
      'Public asset storage is not configured (R2_PUBLIC_BUCKET_NAME / R2_PUBLIC_URL).',
    );
  }
  return {
    bucket: env.R2_PUBLIC_BUCKET_NAME,
    publicBaseUrl: env.R2_PUBLIC_URL.replace(/\/+$/, ''),
  };
};

/** Backward-compatible profile-service name. */
export const getPublicAvatarConfig = getPublicAssetConfig;

/** Best-effort object delete (used when replacing/removing an avatar). */
export const deleteR2Object = async (
  key: string,
  bucket: string = env.R2_BUCKET_NAME,
): Promise<void> => {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};
