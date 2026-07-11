import { describe, it, expect, vi } from 'vitest';
import { createHash, createHmac } from 'crypto';

vi.mock('@/config/env', () => ({
  env: {
    BUNNY_API_KEY: 'api-key',
    BUNNY_READ_ONLY_API_KEY: 'read-only-key',
    BUNNY_LIBRARY_ID: '702267',
    BUNNY_CDN_HOSTNAME: 'vz-test.b-cdn.net',
    BUNNY_TOKEN_KEY: 'token-auth-key',
  },
}));

import {
  resolveBunnyWebhookStatus,
  generateBunnyEmbedToken,
  getSignedBunnyEmbedUrl,
  verifyBunnyWebhookSignature,
} from './bunny';

describe('resolveBunnyWebhookStatus', () => {
  it('maps Finished (3) and Resolution finished (4) to READY', () => {
    expect(resolveBunnyWebhookStatus(3)).toBe('READY');
    expect(resolveBunnyWebhookStatus(4)).toBe('READY');
  });

  it('maps Failed (5) and PresignedUploadFailed (8) to FAILED', () => {
    expect(resolveBunnyWebhookStatus(5)).toBe('FAILED');
    expect(resolveBunnyWebhookStatus(8)).toBe('FAILED');
  });

  it('ignores mid-flight statuses — including 6 (PresignedUploadStarted), never a failure', () => {
    for (const s of [0, 1, 2, 6, 7, 9, 10]) {
      expect(resolveBunnyWebhookStatus(s)).toBeNull();
    }
  });
});

describe('generateBunnyEmbedToken', () => {
  it('is SHA256_HEX(tokenKey + videoId + expires)', () => {
    const expected = createHash('sha256').update(`token-auth-key${'vid-1'}${1_800_000_000}`).digest('hex');
    expect(generateBunnyEmbedToken('vid-1', 1_800_000_000)).toBe(expected);
  });

  it('getSignedBunnyEmbedUrl returns a token-authenticated iframe URL with a matching token', () => {
    const { embedUrl, expiresAt } = getSignedBunnyEmbedUrl('vid-2');
    const token = generateBunnyEmbedToken('vid-2', expiresAt);
    expect(embedUrl).toContain('https://iframe.mediadelivery.net/embed/702267/vid-2');
    expect(embedUrl).toContain(`token=${token}`);
    expect(embedUrl).toContain(`expires=${expiresAt}`);
  });
});

describe('verifyBunnyWebhookSignature', () => {
  const body = JSON.stringify({ VideoLibraryId: 702267, VideoGuid: 'g1', Status: 3 });
  const goodSig = createHmac('sha256', 'read-only-key').update(body).digest('hex');

  it('accepts a signature matching HMAC-SHA256(readOnlyKey, rawBody)', () => {
    expect(verifyBunnyWebhookSignature(body, goodSig)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = JSON.stringify({ VideoLibraryId: 702267, VideoGuid: 'g1', Status: 5 });
    expect(verifyBunnyWebhookSignature(tampered, goodSig)).toBe(false);
  });

  it('rejects a wrong/absent signature', () => {
    expect(verifyBunnyWebhookSignature(body, 'deadbeef')).toBe(false);
    expect(verifyBunnyWebhookSignature(body, undefined)).toBe(false);
  });
});
