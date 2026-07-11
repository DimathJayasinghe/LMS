"use client";

/**
 * Opens the shared SSE connection (`GET /api/stream`) and invokes `onEvent`
 * for every `NOTIFICATION_CREATED` push. One connection per mounted
 * component — currently only NotificationBell uses this, so no shared
 * singleton/context is built until a second consumer needs one.
 */

import { useEffect, useRef } from "react";
import { API_URL } from "@/lib/env";

interface NotificationCreatedPayload {
  notificationId: string;
  type: string;
  title: string;
}

export function useNotificationStream(onEvent: (payload: NotificationCreatedPayload) => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource(`${API_URL}/stream`, { withCredentials: true });

    const handler = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as { data: NotificationCreatedPayload };
        onEventRef.current(event.data);
      } catch {
        // Malformed push — ignore rather than crash the bell.
      }
    };

    source.addEventListener("NOTIFICATION_CREATED", handler);

    return () => {
      source.removeEventListener("NOTIFICATION_CREATED", handler);
      source.close();
    };
  }, []);
}
