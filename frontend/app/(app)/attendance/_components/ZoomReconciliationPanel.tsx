"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type {
  ApiSuccess,
  AppliedAttendanceReconciliation,
  AttendanceReconciliation,
  ClassSession,
} from "@/lib/types";

interface Props {
  session: ClassSession;
  onSynced: () => Promise<void>;
}

function reconcileError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Couldn't read Zoom attendance. Try again.";
  if (error.code === "ZOOM_ATTENDANCE_NOT_READY") return error.message;
  if (error.code === "ZOOM_RATE_LIMITED") return "Zoom is busy. Wait a moment and try again.";
  return error.message;
}

function unmatchedReason(reason: AttendanceReconciliation["unmatched"][number]["reason"]): string {
  if (reason === "AMBIGUOUS") return "conflicting identifiers";
  if (reason === "NOT_ENROLLED") return "not actively enrolled in this class";
  return "no LMS match";
}

export function ZoomReconciliationPanel({ session, onSynced }: Props) {
  const [preview, setPreview] = useState<AttendanceReconciliation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPreview = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.get<ApiSuccess<AttendanceReconciliation>>(
        `/attendance/session/${session.id}/reconciliation`,
      );
      setPreview(result.data);
    } catch (caught) {
      setError(reconcileError(caught));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (): Promise<void> => {
    if (!preview || preview.summary.missing === 0) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.post<ApiSuccess<AppliedAttendanceReconciliation>>(
        `/attendance/session/${session.id}/reconciliation`,
        undefined,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setSuccess(`${result.data.applied} missing attendance record(s) added.`);
      await Promise.all([loadPreview(), onSynced()]);
    } catch (caught) {
      setError(reconcileError(caught));
      setBusy(false);
    }
  };

  if (!session.zoomMeetingId) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        This session has no scheduled Zoom meeting to reconcile.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Zoom reconciliation</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Preview Zoom&apos;s completed-meeting participant report before applying missing rows.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadPreview()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          {preview ? "Refresh preview" : "Preview Zoom"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="flex items-center gap-1.5 text-sm text-emerald-600"><Check aria-hidden />{success}</p>}

      {preview && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Matched" value={preview.summary.matchedStudents} />
            <Metric label="Recorded" value={preview.summary.alreadyRecorded} />
            <Metric label="Missing" value={preview.summary.missing} />
            <Metric label="Unmatched" value={preview.summary.unmatched} />
          </div>

          {preview.participants.length > 0 && (
            <ul className="max-h-60 space-y-2 overflow-auto" aria-label="Zoom participant matches">
              {preview.participants.map((participant) => (
                <li key={participant.userId} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="min-w-0 truncate text-sm">{participant.name} · #{participant.indexNumber}</span>
                  <Badge variant={participant.status === "MISSING" ? "destructive" : "secondary"}>
                    {participant.status === "MISSING" ? "Missing" : "Recorded"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {preview.unmatched.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <AlertTriangle className="size-4 text-amber-600" aria-hidden /> Review unmatched identities
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {preview.unmatched.map((row) => (
                  <li key={`${row.name}-${row.email}-${row.reason}`}>
                    {row.name}{row.email ? ` · ${row.email}` : ""} · {unmatchedReason(row.reason)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button type="button" onClick={() => void apply()} disabled={busy || preview.summary.missing === 0}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {preview.summary.missing === 0 ? "Nothing to sync" : `Sync ${preview.summary.missing} missing`}
          </Button>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-muted/40 p-3"><p className="text-lg font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}
