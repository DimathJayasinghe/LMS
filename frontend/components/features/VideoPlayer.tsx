"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Clock, CreditCard, Loader2, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, StreamData } from "@/lib/types";

interface VideoPlayerProps {
  videoId: string;
  /** Course the video belongs to — powers the enroll / pay call-to-action. */
  courseId: string;
}

/**
 * Plays a Bunny-hosted recording. The signed `streamUrl` is IP-bound, so it is
 * fetched here in the browser (not in the parent Server Component) — otherwise
 * Bunny would bind the token to the Next server's IP and the CDN would 403.
 */
export function VideoPlayer({ videoId, courseId }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<StreamData | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 1. Fetch the IP-bound signed URL (browser-side; see class doc note above).
  //    videoId changes remount this component, and a retry resets state in the
  //    handler, so the effect never needs to null state synchronously here.
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

  // 2. Attach the HLS stream once we have a URL. hls.js is dynamically imported
  //    so it never runs during SSR (it touches MediaSource / window).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hls: any = null;

    // Safari (and iOS) play HLS natively — no library needed.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = stream.streamUrl;
      return;
    }

    import("hls.js").then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) {
        if (!destroyed && !Hls.isSupported()) {
          setError({ message: "Your browser can't play this video format." });
        }
        return;
      }
      hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(stream.streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e: unknown, data: { fatal?: boolean }) => {
        // A fatal error late in playback usually means the 4h token expired.
        if (data.fatal) {
          setError({ message: "Playback was interrupted. The stream link may have expired." });
        }
      });
    });

    return () => {
      destroyed = true;
      if (hls) hls.destroy();
    };
  }, [stream]);

  if (error) {
    // Still processing on Bunny's side — the upload succeeded, but their
    // webhook hasn't confirmed encoding is done yet. Worth a retry, not a
    // dead end (see video.endpoints.md — direct-to-Bunny upload flow).
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
    <video
      ref={videoRef}
      controls
      controlsList="nodownload"
      onContextMenu={(e) => e.preventDefault()}
      className="aspect-video w-full rounded-2xl border border-border bg-black"
    >
      Your browser does not support the video tag.
    </video>
  );
}
