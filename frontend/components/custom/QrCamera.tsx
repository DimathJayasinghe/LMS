"use client";

import { useEffect, useRef } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

interface Props {
  /** Called with the decoded QR text; parent debounces duplicates. */
  onDecode: (text: string) => void;
  /** Called once if the camera can't start (permission/insecure-context/no device). */
  onError: (message: string) => void;
}

function cameraErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission denied. Use the scan field, or allow camera access.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera found. Use the scan field instead.";
  if (typeof window !== "undefined" && !window.isSecureContext)
    return "Camera needs HTTPS (or localhost). Use the scan field instead.";
  return "Camera unavailable. Use the scan field instead.";
}

/**
 * Live webcam QR reader (zxing). Continuously decodes into `onDecode`; the
 * parent dedupes and submits. Isolated so the scanner's own logic stays free of
 * `getUserMedia`, which jsdom can't run.
 */
export function QrCamera({ onDecode, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Hold latest callbacks in refs so the start effect runs once (no restart on
  // every parent render / decode).
  const onDecodeRef = useRef(onDecode);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDecodeRef.current = onDecode;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;
    const reader = new BrowserQRCodeReader();

    const video = videoRef.current;
    if (!video) return;

    // Prefer the rear/environment camera for scanning (`ideal` falls back to
    // any camera on laptops). decodeFromConstraints is more reliable on mobile
    // than passing an undefined deviceId.
    reader
      .decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        video,
        (result) => {
          if (result) onDecodeRef.current(result.getText());
        },
      )
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch((e) => onErrorRef.current(cameraErrorMessage(e)));

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-2xl border border-border bg-black">
      <video ref={videoRef} className="size-full object-cover" autoPlay muted playsInline />
      <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70" />
    </div>
  );
}
