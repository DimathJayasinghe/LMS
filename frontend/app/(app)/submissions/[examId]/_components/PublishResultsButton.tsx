"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, PublishResult } from "@/lib/types";

interface Props {
  examId: string;
  disabled?: boolean;
  disabledHint?: string;
}

/**
 * Publishes exam results — flips `isPublished`, making marks visible to
 * students (and firing the RESULTS_PUBLISHED SSE event). Irreversible, so it
 * asks for confirmation first.
 */
export function PublishResultsButton({ examId, disabled, disabledHint }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = async (): Promise<void> => {
    setPublishing(true);
    setError(null);
    try {
      await api.post<ApiSuccess<PublishResult>>(`/submissions/exam/${examId}/publish`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not publish. Try again.");
      setPublishing(false);
    }
  };

  if (disabled) {
    return (
      <span className="text-xs text-muted-foreground" title={disabledHint}>
        {disabledHint ?? "Publishing unavailable"}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Publish results to students?</span>
          <Button size="sm" onClick={publish} disabled={publishing}>
            {publishing ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={publishing}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={() => setConfirming(true)}>
          <Send aria-hidden />
          Publish results
        </Button>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
