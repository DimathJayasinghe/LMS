import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getZoomAccessToken } = vi.hoisted(() => ({ getZoomAccessToken: vi.fn() }));
vi.mock('@/utils/zoom', () => ({ getZoomAccessToken }));

import { listPastMeetingParticipants } from './zoom-attendance';

const response = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  getZoomAccessToken.mockReset().mockResolvedValue('zoom-token');
  vi.unstubAllGlobals();
});

describe('listPastMeetingParticipants', () => {
  it('paginates and normalizes participant rows', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        next_page_token: 'page-2',
        participants: [{
          name: ' Nimal (#42) ',
          user_email: 'NIMAL@EXAMPLE.COM',
          join_time: '2026-08-17T10:00:00Z',
          leave_time: '2026-08-17T10:10:00Z',
          duration: 600,
        }],
      }))
      .mockResolvedValueOnce(response({
        next_page_token: '',
        participants: [{
          name: 'Nimal (#42)',
          user_email: '',
          join_time: '2026-08-17T10:15:00Z',
          leave_time: '2026-08-17T10:20:00Z',
          duration: 300,
        }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await listPastMeetingParticipants('123 456');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'Nimal (#42)', userEmail: 'nimal@example.com' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('123%20456');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('next_page_token=page-2');
  });

  it('maps a missing/not-yet-processed meeting to an actionable conflict', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 404)));

    await expect(listPastMeetingParticipants('123')).rejects.toMatchObject({
      code: 'ZOOM_ATTENDANCE_NOT_READY',
      statusCode: 409,
    });
  });
});
