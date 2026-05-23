import type { Role } from '@prisma/client';

/** SSE event names the frontend listens for */
export type SseEventType =
  | 'CONNECTED'
  | 'RESULTS_PUBLISHED'
  | 'TIMETABLE_UPDATED'
  | 'EXAM_CONTROL';

/** Optional filters — omitted means all connected clients */
export interface SseAudience {
  courseId?: string;
  userIds?: string[];
  roles?: Role[];
}

export interface SseEvent {
  id: string;
  type: SseEventType;
  timestamp: string;
  data: Record<string, unknown>;
  audience?: SseAudience;
}
