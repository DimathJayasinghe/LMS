import { AppError } from '@/utils/app-error';
import { getZoomAccessToken } from '@/utils/zoom';

export interface ZoomPastParticipant {
  name: string;
  userEmail: string | null;
  joinTime: Date;
  leaveTime: Date | null;
  durationSeconds: number;
}

const PAGE_SIZE = 300;
const MAX_PAGES = 10;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const normalizeParticipant = (value: unknown): ZoomPastParticipant | null => {
  const participant = asRecord(value);
  if (!participant || typeof participant.name !== 'string') return null;

  const joinTime = new Date(String(participant.join_time ?? ''));
  if (Number.isNaN(joinTime.getTime())) return null;

  const rawLeaveTime = participant.leave_time ? new Date(String(participant.leave_time)) : null;
  const leaveTime = rawLeaveTime && !Number.isNaN(rawLeaveTime.getTime()) ? rawLeaveTime : null;
  const duration = Number(participant.duration ?? 0);

  return {
    name: participant.name.trim() || 'Unknown participant',
    userEmail:
      typeof participant.user_email === 'string' && participant.user_email.trim()
        ? participant.user_email.trim().toLowerCase()
        : null,
    joinTime,
    leaveTime,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0,
  };
};

export const listPastMeetingParticipants = async (
  meetingId: string,
): Promise<ZoomPastParticipant[]> => {
  const token = await getZoomAccessToken();
  const participants: ZoomPastParticipant[] = [];
  let nextPageToken = '';

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ page_size: String(PAGE_SIZE) });
    if (nextPageToken) query.set('next_page_token', nextPageToken);

    const response = await fetch(
      `https://api.zoom.us/v2/past_meetings/${encodeURIComponent(meetingId)}/participants?${query}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new AppError(
          'ZOOM_ATTENDANCE_NOT_READY',
          409,
          'Zoom attendance is not available yet. Confirm the meeting has ended, wait a few minutes, and try again.',
        );
      }
      if (response.status === 429) {
        throw new AppError('ZOOM_RATE_LIMITED', 429, 'Zoom is rate limiting attendance requests. Try again shortly.');
      }
      throw new AppError(
        'ZOOM_PARTICIPANTS_FAILED',
        502,
        `Zoom rejected the participant request (${response.status}).`,
      );
    }

    const body = asRecord(await response.json());
    if (!body || !Array.isArray(body.participants)) {
      throw new AppError('ZOOM_PARTICIPANTS_FAILED', 502, 'Zoom returned an invalid participant response.');
    }

    for (const value of body.participants) {
      const participant = normalizeParticipant(value);
      if (participant) participants.push(participant);
    }

    nextPageToken = typeof body.next_page_token === 'string' ? body.next_page_token : '';
    if (!nextPageToken) return participants;
  }

  throw new AppError(
    'ZOOM_PARTICIPANTS_FAILED',
    502,
    'Zoom returned too many participant pages to reconcile safely.',
  );
};
