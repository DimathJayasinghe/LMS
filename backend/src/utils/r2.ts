import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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
): Promise<string> => {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
};

export const createR2PresignedGetUrl = async (
  key: string,
  expiresInSeconds: number,
): Promise<string> => {
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
};
