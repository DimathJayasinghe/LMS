import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const config = vi.hoisted(() => ({ ZOOM_WEBHOOK_SECRET: 'test-secret' }));
vi.mock('@/config/env', () => ({ env: config }));
import { verifyZoomWebhook } from './zoom-webhook.middleware';

const secret = 'test-secret';
const timestamp = '1700000000';
const sign = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
function invoke(body: unknown, headers: Record<string, string> = {}) {
  const req = { body, rawBody: JSON.stringify(body), headers } as unknown as Request;
  const result: { status?: number; body?: unknown; next: boolean } = { next: false };
  const res = {
    status: (status: number) => { result.status = status; return res; },
    json: (value: unknown) => { result.body = value; return res; },
  } as unknown as Response;
  verifyZoomWebhook(req, res, (() => { result.next = true; }) as NextFunction);
  return result;
}
const validation = (plainToken: unknown) => ({ event: 'endpoint.url_validation', payload: { plainToken } });
function signed(body: unknown, ts = timestamp) {
  return { 'x-zm-request-timestamp': ts, 'x-zm-signature': `v0=${sign(`v0:${ts}:${JSON.stringify(body)}`)}` };
}
beforeEach(() => {
  config.ZOOM_WEBHOOK_SECRET = secret;
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
});
describe('Zoom webhook validation', () => {
  it('returns a response for an allowed validation token', () => {
    expect(invoke(validation('abc_DEF-123'))).toEqual({ next: false, status: 200, body: { plainToken: 'abc_DEF-123', encryptedToken: sign('abc_DEF-123') } });
  });
  it.each(['v0:1:{}', 'a:b', ' abc', '', 'a'.repeat(65), 'abcdefghé', 'short', 'abcdefgh\n'])('rejects a validation token outside the allowed format', (token) => {
    expect(invoke(validation(token))).toMatchObject({ status: 400, body: { code: 'ZOOM_VALIDATION_INVALID' }, next: false });
  });
  it('rejects an invalid validation signature', () => {
    expect(invoke(validation('abcdefgh'), { 'x-zm-request-timestamp': timestamp, 'x-zm-signature': 'wrong' })).toMatchObject({ status: 401, next: false });
  });
  it('rejects incomplete validation signature headers', () => {
    expect(invoke(validation('abcdefgh'), { 'x-zm-request-timestamp': timestamp })).toMatchObject({ status: 401, next: false });
  });
  it('rejects empty validation signature headers', () => {
    expect(invoke(validation('abcdefgh'), { 'x-zm-request-timestamp': '', 'x-zm-signature': '' })).toMatchObject({ status: 401, next: false });
  });
  it('accepts a signed validation event', () => {
    const body = validation('abcdefgh');
    expect(invoke(body, signed(body))).toMatchObject({ status: 200, next: false });
  });
  it('accepts a signed participant event', () => {
    const body = { event: 'meeting.participant_joined', payload: {} };
    expect(invoke(body, signed(body)).next).toBe(true);
  });
  it('rejects a stale timestamp', () => {
    const body = { event: 'meeting.participant_joined' };
    expect(invoke(body, signed(body, '1699999699'))).toMatchObject({ status: 401, body: { code: 'ZOOM_SIGNATURE_STALE' } });
  });
  it('rejects an unsigned participant event', () => {
    expect(invoke({ event: 'meeting.participant_joined' })).toMatchObject({ status: 401, body: { code: 'ZOOM_SIGNATURE_MISSING' } });
  });
  it('rejects requests when the secret is missing', () => {
    config.ZOOM_WEBHOOK_SECRET = '';
    expect(() => invoke(validation('abcdefgh'))).toThrow(expect.objectContaining({ statusCode: 503, code: 'ZOOM_NOT_CONFIGURED' }));
  });
  it('rejects sample validation inputs outside the allowed format', () => {
    for (const message of ['v0:1:{}', 'v0:1700000000:{"event":"meeting.participant_joined"}']) {
      const result = invoke(validation(message));
      expect(result).toMatchObject({ status: 400, next: false });
      expect(result.body).not.toHaveProperty('encryptedToken', sign(message));
    }
  });
});
