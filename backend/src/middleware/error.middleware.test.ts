import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ captureException: vi.fn() }));

import { errorHandler } from './error.middleware';
import { AppError } from '@/utils/app-error';

const respond = (error: Error) => {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  errorHandler(error, { path: '/x', method: 'GET', params: {}, query: {}, body: {} } as unknown as Request, { status } as unknown as Response, vi.fn());
  return { status, json };
};

describe('errorHandler envelope for known errors', () => {
  it('keeps the plain envelope when an error carries no details', () => {
    const { status, json } = respond(new AppError('SOME_CODE', 409, 'Nope.'));
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ status: 'error', message: 'Nope.', code: 'SOME_CODE' });
  });

  it('sends structured details as data so the client can act on them', () => {
    const details = { courses: [{ id: 'c1' }] };
    const { json } = respond(new AppError('TEACHER_HAS_CLASSES', 409, 'Hand over first.', details));
    expect(json).toHaveBeenCalledWith({ status: 'error', message: 'Hand over first.', code: 'TEACHER_HAS_CLASSES', data: details });
  });
});
