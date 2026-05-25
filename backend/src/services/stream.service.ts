import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import type Redis from 'ioredis';
import { logger } from '@/config/logger';
import { redis } from '@/config/redis';
import { SSE_HEARTBEAT_MS, SSE_REDIS_CHANNEL } from '@/utils/constants';
import type { SseAudience, SseEvent, SseEventType } from '@/types/stream.types';

interface LocalClient {
  connectionId: string;
  userId: string;
  role: Role;
  res: Response;
  heartbeatTimer: ReturnType<typeof setInterval>;
}

const localClients = new Map<string, LocalClient>();

let subscriber: Redis | null = null;
let isInitialized = false;

const formatSseMessage = (event: SseEvent): string =>
  `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

const matchesAudience = (audience: SseAudience | undefined, client: LocalClient): boolean => {
  if (!audience) {
    return true;
  }

  if (audience.userIds?.length && !audience.userIds.includes(client.userId)) {
    return false;
  }

  if (audience.roles?.length && !audience.roles.includes(client.role)) {
    return false;
  }

  // courseId is included in the payload — clients filter enrollments locally
  return true;
};

const deliverToLocalClients = (event: SseEvent): void => {
  const message = formatSseMessage(event);

  for (const [connectionId, client] of localClients) {
    if (!matchesAudience(event.audience, client)) {
      continue;
    }

    try {
      client.res.write(message);
    } catch {
      removeConnection(connectionId);
    }
  }
};

export const initStreamService = async (): Promise<void> => {
  if (isInitialized) {
    return;
  }

  if (redis.status !== 'ready') {
    logger.warn('SSE pub/sub skipped — Redis is not connected');
    return;
  }

  subscriber = redis.duplicate();

  subscriber.on('error', (err: Error) => {
    logger.error({ err: err.message }, 'SSE Redis subscriber error');
  });

  await subscriber.connect();
  await subscriber.subscribe(SSE_REDIS_CHANNEL);

  subscriber.on('message', (_channel: string, message: string) => {
    try {
      const event = JSON.parse(message) as SseEvent;
      deliverToLocalClients(event);
    } catch (err) {
      logger.error({ err }, 'Failed to parse SSE pub/sub message');
    }
  });

  isInitialized = true;
  logger.info({ channel: SSE_REDIS_CHANNEL }, 'SSE pub/sub subscriber ready');
};

export const shutdownStreamService = async (): Promise<void> => {
  for (const connectionId of [...localClients.keys()]) {
    removeConnection(connectionId);
  }

  if (subscriber) {
    await subscriber.unsubscribe(SSE_REDIS_CHANNEL);
    await subscriber.quit();
    subscriber = null;
  }

  isInitialized = false;
};

export const registerConnection = (userId: string, role: Role, res: Response): string => {
  const connectionId = randomUUID();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      removeConnection(connectionId);
    }
  }, SSE_HEARTBEAT_MS);

  const client: LocalClient = { connectionId, userId, role, res, heartbeatTimer };
  localClients.set(connectionId, client);

  res.on('close', () => {
    removeConnection(connectionId);
  });

  const connectedEvent: SseEvent = {
    id: randomUUID(),
    type: 'CONNECTED',
    timestamp: new Date().toISOString(),
    data: { userId },
  };
  res.write(formatSseMessage(connectedEvent));

  logger.debug({ userId, connectionId }, 'SSE client connected');

  return connectionId;
};

export const removeConnection = (connectionId: string): void => {
  const client = localClients.get(connectionId);
  if (!client) {
    return;
  }

  clearInterval(client.heartbeatTimer);
  localClients.delete(connectionId);

  if (!client.res.writableEnded) {
    client.res.end();
  }

  logger.debug({ userId: client.userId, connectionId }, 'SSE client disconnected');
};

export const publishEvent = async (
  type: SseEventType,
  data: Record<string, unknown>,
  audience?: SseAudience,
): Promise<void> => {
  const event: SseEvent = {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    data,
    audience,
  };

  const payload = JSON.stringify(event);

  try {
    if (redis.status !== 'ready') {
      throw new Error('Redis not ready');
    }

    await redis.publish(SSE_REDIS_CHANNEL, payload);
  } catch (err) {
    logger.warn({ err, type }, 'Redis publish failed — delivering SSE on this instance only');
    deliverToLocalClients(event);
  }
};

export const broadcastResultsPublished = async (params: {
  examId: string;
  courseId: string;
  examTitle: string;
  publishedAt: string;
}): Promise<void> => {
  await publishEvent(
    'RESULTS_PUBLISHED',
    {
      examId: params.examId,
      courseId: params.courseId,
      examTitle: params.examTitle,
      publishedAt: params.publishedAt,
    },
    { courseId: params.courseId },
  );
};

export const broadcastTimetableUpdated = async (params: {
  courseId: string;
  sessionId: string;
  action: 'created' | 'updated' | 'deleted';
}): Promise<void> => {
  await publishEvent(
    'TIMETABLE_UPDATED',
    {
      courseId: params.courseId,
      sessionId: params.sessionId,
      action: params.action,
    },
    { courseId: params.courseId },
  );
};

export const broadcastExamControl = async (params: {
  examId: string;
  courseId: string;
  action: 'updated' | 'deleted' | 'time_changed';
  startTime?: string;
  endTime?: string;
}): Promise<void> => {
  await publishEvent(
    'EXAM_CONTROL',
    {
      examId: params.examId,
      courseId: params.courseId,
      action: params.action,
      startTime: params.startTime,
      endTime: params.endTime,
    },
    { courseId: params.courseId },
  );
};
