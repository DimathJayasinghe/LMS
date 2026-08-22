"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, ClassSession } from "@/lib/types";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function SessionForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState("120");
  const [classType, setClassType] = useState<"" | "ONLINE" | "PHYSICAL">("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (title.trim().length < 3) return setError("Title must be at least 3 characters.");
    if (!date) return setError("Pick a date and time.");
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        date: new Date(date).toISOString(),
      };
      if (Number(duration) > 0) body.durationMinutes = Number(duration);
      if (classType) body.classType = classType;
      if (description.trim()) body.description = description.trim();

      await api.post<ApiSuccess<ClassSession>>(`/classes/${classId}/sessions`, body, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      router.push(`/classes/${classId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the session. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium text-foreground">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. Week 3 — Integration" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="date" className="text-sm font-medium text-foreground">Date & time</label>
          <input id="date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="duration" className="text-sm font-medium text-foreground">Duration (min)</label>
          <input id="duration" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mode" className="text-sm font-medium text-foreground">Mode</label>
          <select id="mode" value={classType} onChange={(e) => setClassType(e.target.value as typeof classType)} className={field}>
            <option value="">Unspecified</option>
            <option value="ONLINE">Online</option>
            <option value="PHYSICAL">Physical</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="desc" className="text-sm font-medium text-foreground">Description <span className="text-muted-foreground">(optional)</span></label>
        <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${field} resize-y`} />
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button onClick={submit} disabled={submitting} size="lg">
        {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        Create session
      </Button>
    </div>
  );
}
