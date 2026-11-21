import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ processors: new Map<string, () => Promise<void>>(), read: vi.fn(), generate: vi.fn() }));
vi.mock('bullmq', () => ({ Worker: class {
  constructor(name: string, processor: () => Promise<void>) { mocks.processors.set(name, processor); }
  on() { return this; }
  waitUntilReady() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
} }));
vi.mock('@/config/redis', () => ({ redis: { duplicate: vi.fn() } }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/config/sentry', () => ({ initSentry: vi.fn(), captureException: vi.fn() }));
vi.mock('@/jobs/sms.job', () => ({ processSmsJob: vi.fn() }));
vi.mock('@/jobs/notification.queue', () => ({ scheduleWeeklyTimetableGeneration: vi.fn() }));
vi.mock('@/services/timetable.service', () => ({ generateSessions: mocks.generate }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: vi.fn(() => mocks.read) }));

beforeEach(() => { mocks.read.mockResolvedValue(30); mocks.generate.mockResolvedValue({}); });

it('uses the configured generation window for each job', async () => {
  await import('./worker');
  const { JOB_QUEUE_TIMETABLE, DEFAULT_ORGANIZATION_ID } = await import('@/utils/constants');
  const { createSettingsReader } = await import('@/services/settings.service');
  await mocks.processors.get(JOB_QUEUE_TIMETABLE)!();
  expect(createSettingsReader).toHaveBeenCalledWith(DEFAULT_ORGANIZATION_ID);
  expect(mocks.read).toHaveBeenCalledWith('timetable.generateAheadDays');
  const [from, to] = mocks.generate.mock.calls[0]! as [Date, Date];
  expect(to.getTime() - from.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
});
