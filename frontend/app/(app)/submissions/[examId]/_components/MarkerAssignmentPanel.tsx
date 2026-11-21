"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { AcademicStaff, ApiList, ExamMarkerAssignment } from "@/lib/types";

interface Props {
  examId: string;
  markers: AcademicStaff[];
  assignments: ExamMarkerAssignment[];
}

export function MarkerAssignmentPanel({ examId, markers, assignments }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(
    () => new Set(assignments.map((assignment) => assignment.markerId)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = (markerId: string): void => {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(markerId)) next.delete(markerId);
      else next.add(markerId);
      return next;
    });
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put<ApiList<ExamMarkerAssignment>>(
        `/exams/${examId}/markers`,
        { markerIds: [...selected] },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update marker assignments.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Users className="size-4" aria-hidden />
          Assigned markers
        </span>
        <span className="text-sm text-muted-foreground">
          {assignments.length} assigned · {open ? "Hide" : "Manage"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {markers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active marker accounts are available. A super admin must create one first.
            </p>
          ) : (
            <fieldset>
              <legend className="mb-2 text-sm text-muted-foreground">
                Choose who may view and grade this exam&apos;s submissions.
              </legend>
              <ul className="grid gap-2 sm:grid-cols-2">
                {markers.map((marker) => (
                  <li key={marker.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={selected.has(marker.id)}
                        onChange={() => toggle(marker.id)}
                        className="size-4"
                      />
                      <span className="text-sm font-medium text-foreground">{marker.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={save} disabled={saving || markers.length === 0}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              Save markers
            </Button>
            {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
          </div>
        </div>
      )}
    </section>
  );
}
