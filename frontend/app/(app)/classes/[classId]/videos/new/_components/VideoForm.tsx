"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload as TusUpload } from "tus-js-client";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, ClassSession, InitiateUploadResult } from "@/lib/types";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

const sessionLabel = (s: ClassSession): string => {
  const d = new Date(s.date).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Colombo",
  });
  return `${s.title ?? "Session"} · ${d}`;
};

type Phase = "idle" | "uploading" | "uploaded" | "error";

export function VideoForm({ classId, sessions }: { classId: string; sessions: ClassSession[] }) {
  const router = useRouter();
  const [classSessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<TusUpload | null>(null);

  const submit = async (): Promise<void> => {
    if (!classSessionId) return setError("Choose a session.");
    if (title.trim().length < 2) return setError("Title must be at least 2 characters.");
    if (!file) return setError("Choose a video file.");

    setError(null);
    setPhase("uploading");
    setProgress(0);

    try {
      // 1. Ask our server for a Bunny video + a signed TUS upload target. The
      //    file itself is never sent to us — only this metadata call is.
      const res = await api.post<ApiSuccess<InitiateUploadResult>>(
        "/videos/uploads",
        { title: title.trim(), classSessionId },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      const { upload } = res.data;

      // 2. Upload the file directly to Bunny via TUS (resumable — survives
      //    network drops and picks up where it left off).
      await new Promise<void>((resolve, reject) => {
        const tusUpload = new TusUpload(file, {
          endpoint: upload.endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: upload.signature,
            AuthorizationExpire: String(upload.expire),
            VideoId: upload.videoId,
            LibraryId: upload.libraryId,
          },
          metadata: { filetype: file.type, title: title.trim() },
          onError: (err) => reject(err),
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onSuccess: () => resolve(),
        });
        uploadRef.current = tusUpload;
        tusUpload.start();
      });

      // The transfer reaching Bunny is NOT "ready" — Bunny still has to
      // process/encode it. That confirmation comes later via their webhook,
      // independent of this browser tab, so it's safe to leave now.
      setPhase("uploaded");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed. Try again.");
      setPhase("error");
    }
  };

  const disabled = phase === "uploading" || phase === "uploaded";

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="session" className="text-sm font-medium text-foreground">Session</label>
        <select
          id="session"
          value={classSessionId}
          onChange={(e) => setSessionId(e.target.value)}
          disabled={disabled}
          className={field}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{sessionLabel(s)}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium text-foreground">Title</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={disabled}
          className={field}
          placeholder="e.g. Week 3 — Integration (recording)"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="file" className="text-sm font-medium text-foreground">Video file</label>
        <input
          id="file"
          type="file"
          accept="video/*"
          disabled={disabled}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={`${field} file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground`}
        />
        {file && (
          <p className="text-xs text-muted-foreground">
            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Uploads directly to Bunny Stream — large files are fine, and the upload resumes
          automatically if your connection drops.
        </p>
      </div>

      {phase === "uploading" && (
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
        </div>
      )}

      {phase === "uploaded" && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Upload complete. Bunny is now processing the video — it&apos;ll appear as
          &quot;Processing&quot; on the class page until ready, usually within a few minutes.
        </p>
      )}

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {phase === "uploaded" ? (
        <Button onClick={() => { router.push(`/classes/${classId}`); router.refresh(); }} size="lg">
          Back to class
        </Button>
      ) : (
        <Button onClick={submit} disabled={disabled} size="lg">
          {phase === "uploading" ? <Loader2 className="animate-spin" aria-hidden /> : <UploadCloud aria-hidden />}
          Upload recording
        </Button>
      )}
    </div>
  );
}
