"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Radio, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

interface LiveClassActionProps {
  classId: string;
  sessionId: string;
  /** Whether the session already has a Zoom meeting (POST /live/schedule was called). */
  scheduled: boolean;
  /** Teacher (course owner) or SUPER_ADMIN — students only ever see "Join". */
  isStaff: boolean;
}

/**
 * Schedule/start/join CTA for an ONLINE session's live class (see
 * live-class.endpoints.md). Scheduling is a one-time POST that provisions the
 * real Zoom meeting; once scheduled, everyone joins inside the LMS via
 * `/classes/:classId/live/:sessionId` — never a raw zoom.us link.
 */
export function LiveClassAction({ classId, sessionId, scheduled, isStaff }: LiveClassActionProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (scheduled) {
    return (
      <Button asChild size="sm">
        <Link href={`/classes/${classId}/live/${sessionId}`}>
          <Video aria-hidden />
          {isStaff ? "Start" : "Join"}
        </Link>
      </Button>
    );
  }

  if (!isStaff) return null;

  const handleSchedule = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/classes/${classId}/sessions/${sessionId}/live/schedule`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not schedule the live class.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleSchedule} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Radio aria-hidden />}
        Schedule live class
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
