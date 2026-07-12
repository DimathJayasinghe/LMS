"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Clock,
  CreditCard,
  Loader2,
  Lock,
  LogOut,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, LiveClassToken } from "@/lib/types";

interface LiveClassRoomProps {
  classId: string;
  sessionId: string;
}

type Phase = "loading" | "joined" | "ended" | "error";

/** Corners the watermark cycles through so it can't be cropped out of a recording. */
const WATERMARK_POSITIONS = [
  { top: "1rem", left: "1rem" },
  { top: "1rem", right: "1rem" },
  { bottom: "4.5rem", left: "1rem" },
  { bottom: "4.5rem", right: "1rem" },
] as const;

/**
 * Embeds a Zoom meeting via the Meeting SDK, entirely inside the LMS — the
 * host/participant never leaves the site (see live-class.endpoints.md). A
 * fresh signed token is fetched on mount and never reused across reloads.
 *
 * Anti-recording is a deterrent ceiling, not real DRM (the Web SDK has no
 * HDCP/OS-level capture prevention): a repositioning watermark carrying the
 * viewer's identity, plus basic UI hardening. See the endpoint doc's
 * "Anti-recording" section for the full reasoning.
 */
export function LiveClassRoom({ classId, sessionId }: LiveClassRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [token, setToken] = useState<LiveClassToken | null>(null);
  const [watermarkPos, setWatermarkPos] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [retryKey, setRetryKey] = useState(0);

  // 1 & 2. Fetch a fresh token, then load and join the SDK. Runs once per
  // retryKey bump — never on a silent re-render, so a token is never reused.
  useEffect(() => {
    let active = true;

    (async () => {
      let issued: LiveClassToken;
      try {
        issued = (
          await api.post<ApiSuccess<LiveClassToken>>(
            `/classes/${classId}/sessions/${sessionId}/live/token`,
          )
        ).data;
      } catch (e) {
        if (!active) return;
        setError(
          e instanceof ApiError
            ? { message: e.message, code: e.code }
            : { message: "Could not start the live class. Please try again." },
        );
        setPhase("error");
        return;
      }
      if (!active) return;
      setToken(issued);

      const { default: ZoomMtgEmbedded } = await import("@zoom/meetingsdk/embedded");
      if (!active || !containerRef.current) return;

      const client = ZoomMtgEmbedded.createClient();
      clientRef.current = client;

      try {
        await client.init({
          zoomAppRoot: containerRef.current,
          language: "en-US",
          customize: {
            meetingInfo: ["topic", "host", "mn", "participant"],
          },
        });
        if (!active) return;
        await client.join({
          signature: issued.signature,
          sdkKey: issued.sdkKey,
          meetingNumber: issued.meetingNumber,
          password: issued.password,
          userName: issued.userName,
          zak: issued.zak,
        });
        if (!active) return;
        client.on("connection-change", (payload: { state?: string }) => {
          if (payload?.state === "Closed") setPhase("ended");
        });
        setPhase("joined");
      } catch {
        if (!active) return;
        setError({ message: "The meeting could not be joined. Please try again." });
        setPhase("error");
      }
    })();

    return () => {
      active = false;
      clientRef.current?.leaveMeeting?.().catch(() => {});
      clientRef.current = null;
    };
  }, [classId, sessionId, retryKey]);

  // 3. Watermark: reposition periodically and keep the timestamp live.
  useEffect(() => {
    if (phase !== "joined") return;
    const reposition = setInterval(
      () => setWatermarkPos((p) => (p + 1) % WATERMARK_POSITIONS.length),
      15_000,
    );
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(reposition);
      clearInterval(tick);
    };
  }, [phase]);

  if (phase === "loading") {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-border bg-muted/40">
        <Loader2 className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted/30 p-6 text-center">
        <LogOut className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium text-foreground">The live class has ended.</p>
        <Button asChild size="sm">
          <Link href={`/classes/${classId}`}>Back to class</Link>
        </Button>
      </div>
    );
  }

  if (phase === "error" && error) {
    const gate =
      error.code === "PAYMENT_REQUIRED"
        ? {
            icon: CreditCard,
            title: "Payment required",
            body: "Pay this month's fee to join this live class.",
          }
        : error.code === "NOT_ENROLLED"
          ? {
              icon: Lock,
              title: "Enrollment required",
              body: "Enroll in this course to join its live classes.",
            }
          : error.code === "LIVE_CLASS_NOT_SCHEDULED"
            ? {
                icon: Clock,
                title: "Not scheduled yet",
                body: "The teacher hasn't started this live class yet.",
              }
            : error.code === "TOKEN_RATE_LIMITED"
              ? {
                  icon: Clock,
                  title: "Slow down",
                  body: "Give it a few seconds before trying again.",
                }
              : null;

    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted/30 p-6 text-center">
        {gate ? (
          <>
            <gate.icon className="size-8 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium text-foreground">{gate.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{gate.body}</p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="size-8 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPhase("loading");
              setError(null);
              setRetryKey((k) => k + 1);
            }}
          >
            <RotateCw aria-hidden />
            Try again
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/classes/${classId}`}>Back to class</Link>
          </Button>
        </div>
      </div>
    );
  }

  const pos = WATERMARK_POSITIONS[watermarkPos];

  return (
    <div
      className="relative min-h-[70vh] overflow-hidden rounded-2xl border border-border bg-black"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={containerRef} className="size-full" />
      {phase === "joined" && token && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-50 select-none rounded bg-black/40 px-2 py-1 text-xs font-medium text-white/80 backdrop-blur-sm transition-[top,left,right,bottom] duration-1000"
          style={pos}
        >
          {token.userName} · {now.toLocaleTimeString("en-LK", { timeZone: "Asia/Colombo" })}
        </div>
      )}
    </div>
  );
}
