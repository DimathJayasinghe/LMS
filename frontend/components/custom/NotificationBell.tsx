"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useNotificationStream } from "@/lib/hooks/useNotificationStream";
import type { NotificationEntry, NotificationListResponse } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = async (): Promise<void> => {
    try {
      const res = await api.get<NotificationListResponse>("/notifications/me?limit=10");
      setEntries(res.data);
      setUnreadCount(res.unreadCount);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Live push: a new notification landed server-side — refetch so the badge
  // and dropdown stay current without polling.
  useNotificationStream(() => {
    void load();
  });

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const markOneRead = async (id: string): Promise<void> => {
    setEntries((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await api.patch(`/notifications/${id}/read`).catch(() => void load());
  };

  const markAllRead = async (): Promise<void> => {
    setEntries((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await api.patch("/notifications/me/read-all").catch(() => void load());
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          // Mobile-first: a fixed, viewport-inset panel so it never runs off the
          // screen; on sm+ it becomes an anchored dropdown under the bell.
          className="fixed inset-x-2 top-16 z-50 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Check className="size-3.5" aria-hidden />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {entries.map((n) => {
                  const body = (
                    <>
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {dateFmt.format(new Date(n.createdAt))}
                      </p>
                    </>
                  );

                  return (
                    <li
                      key={n.id}
                      className={`px-4 py-3 ${n.isRead ? "" : "bg-muted/40"}`}
                    >
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => {
                            if (!n.isRead) void markOneRead(n.id);
                            setOpen(false);
                          }}
                          className="block"
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => !n.isRead && void markOneRead(n.id)}
                          className="block w-full text-left"
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
