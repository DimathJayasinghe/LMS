"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Clock, CreditCard, Loader2, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { accumulateWatch, initWatch, type WatchState } from "@/lib/watch";
import type { ApiSuccess, StreamData } from "@/lib/types";

interface VideoPlayerProps {
  videoId: string;
  /** Course the video belongs to — powers the enroll / pay call-to-action. */
  courseId: string;
  /** Session this recording belongs to — records watch attendance. */
  classSessionId: string;
}

// Watermark parks in one of these spots and hops between them so it can't be
// reliably cropped out of a screen recording.
const WATERMARK_SPOTS = [
  "top-3 left-3",
  "top-3 right-3",
  "bottom-12 left-3",
  "bottom-12 right-3",
  "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
];

/**
 * Plays a Bunny-hosted recording through Bunny's **token-authenticated iframe
 * player** (DRM enforced by Bunny). The signed embed URL is fetched here in the
 * browser (not the parent Server Component) so gating runs per-viewer, and a
 * per-student watermark is overlaid to deter screen/phone capture.
 */
export function VideoPlayer({ videoId, courseId, classSessionId }: VideoPlayerProps) {
  const [stream, setStream] = useState<StreamData | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [spot, setSpot] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const watchRef = useRef<WatchState>(initWatch());
  const markedRef = useRef(false);

  useEffect(() => {
    let active = true;
    api
      .get<ApiSuccess<StreamData>>(`/videos/${videoId}/stream`)
      .then((res) => {
        if (active) setStream(res.data);
      })
      .catch((e) => {
        if (!active) return;
        setError(
          e instanceof ApiError
            ? { message: e.message, code: e.code }
            : { message: "Could not load this video. Please try again." },
        );
      });
    return () => {
      active = false;
    };
  }, [videoId, reloadKey]);

  // Reposition the watermark on an interval while a video is loaded.
  useEffect(() => {
    if (!stream) return;
    const t = setInterval(() => setSpot((s) => (s + 1) % WATERMARK_SPOTS.length), 4000);
    return () => clearInterval(t);
  }, [stream]);

  // Mark attendance once the student has actually watched ~30s. Bunny's iframe is
  // Player.js-compatible, so we read progress via its `timeupdate` events.
  // Best-effort: never blocks playback or surfaces an error over the video.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!stream || !iframe) return;
    watchRef.current = initWatch();
    markedRef.current = false;

    let cancelled = false;
    let player: { off?: (e: string) => void } | null = null;

    const mark = (): void => {
      if (markedRef.current) return;
      markedRef.current = true;
      api.post("/attendance/video", { classSessionId }).catch(() => {});
    };

    import("player.js")
      .then(({ default: playerjs }) => {
        if (cancelled) return;
        const p = new playerjs.Player(iframe);
        player = p;
        p.on("ready", () => {
          p.on("timeupdate", (e) => {
            const { state, reached } = accumulateWatch(watchRef.current, e?.seconds ?? 0);
            watchRef.current = state;
            if (reached) mark();
          });
          p.on("ended", mark);
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      try {
        player?.off?.("timeupdate");
        player?.off?.("ended");
      } catch {
        /* player may not have attached */
      }
    };
  }, [stream, classSessionId]);

  if (error) {
    // Still processing on Bunny's side — the upload succeeded, but their webhook
    // hasn't confirmed encoding is done yet. Worth a retry, not a dead end.
    if (error.code === "VIDEO_NOT_READY") {
      return (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted/30 p-6 text-center">
          <Clock className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Not ready yet</p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setReloadKey((k) => k + 1);
            }}
          >
            <RotateCw aria-hidden />
            Check again
          </Button>
        </div>
      );
    }

    const gate =
      error.code === "PAYMENT_REQUIRED"
        ? {
            icon: CreditCard,
            title: "Payment required",
            body: "Pay this month's fee to watch recordings for this course.",
            cta: "Go to class",
          }
        : error.code === "NOT_ENROLLED"
          ? {
              icon: Lock,
              title: "Enrollment required",
              body: "Enroll in this course to watch its recordings.",
              cta: "Go to class",
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
            <Button asChild size="sm">
              <Link href={`/classes/${courseId}`}>{gate.cta}</Link>
            </Button>
          </>
        ) : (
          <>
            <AlertCircle className="size-8 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            >
              <RotateCw aria-hidden />
              Try again
            </Button>
          </>
        )}
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-border bg-muted/40">
        <Loader2 className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
      <iframe
        ref={iframeRef}
        key={stream.videoId}
        src={stream.embedUrl}
        title={stream.title}
        loading="lazy"
        allow="encrypted-media; accelerometer; gyroscope; fullscreen; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 size-full"
      />
      <span
        className={`pointer-events-none absolute z-10 select-none rounded bg-black/20 px-1.5 py-0.5 text-[11px] font-medium text-white/45 transition-all duration-1000 ${WATERMARK_SPOTS[spot]}`}
      >
        {stream.watermark}
      </span>
    </div>
  );
}
