"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { EnrollModePicker } from "./EnrollModePicker";
import type { ApiList, ApiSuccess, Course, Enrollment, EnrollmentMode } from "@/lib/types";

export type EnrollStudent = { id: string; name: string; indexNumber: number };
export type EnrollCourse = { id: string; name: string; monthlyFee: string };

interface StaffEnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: EnrollStudent;
  /** Fixes the class (the class page); without it the desk picks from the active classes. */
  course?: EnrollCourse;
  onEnrolled: (enrollment: Enrollment) => void;
}

/** Front desk enrols an existing student in a class; physical is the default because the student is at the desk. */
export function StaffEnrollDialog({ open, onOpenChange, student, course, onEnrolled }: StaffEnrollDialogProps) {
  const [classes, setClasses] = useState<Course[]>([]);
  const [classesFailed, setClassesFailed] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [mode, setMode] = useState<EnrollmentMode>("PHYSICAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPicker = !course;
  useEffect(() => {
    if (!open || !needsPicker) return;

    let cancelled = false;
    api
      .get<ApiList<Course>>("/classes")
      .then((r) => {
        if (cancelled) return;
        setClasses(r.data.filter((c) => c.isActive));
        setClassesFailed(false);
      })
      .catch(() => {
        if (!cancelled) setClassesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, needsPicker]);

  const chosen: EnrollCourse | undefined = course ?? classes.find((c) => c.id === courseId);

  const enrol = async (): Promise<void> => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<ApiSuccess<Enrollment>>("/enrollments", {
        userId: student.id,
        courseId: chosen.id,
        classType: mode,
      });
      onEnrolled(res.data);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't enrol this student. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-lg">
          <Dialog.Title className="font-semibold text-foreground">Enrol student</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {student.name} <span className="text-xs">#{student.indexNumber}</span>
            {course && <> in {course.name}</>}
          </Dialog.Description>

          <div className="mt-4 space-y-4">
            {needsPicker && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Class</span>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select a class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.year ? ` · ${c.year}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {classesFailed && <p className="text-xs text-destructive">Couldn&apos;t load the classes. Close this and try again.</p>}

            {chosen && (
              <p className="text-sm text-foreground">
                {formatCurrency(chosen.monthlyFee)}
                <span className="text-xs text-muted-foreground"> / month</span>
              </p>
            )}

            <EnrollModePicker value={mode} onChange={setMode} disabled={busy} />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="button" onClick={enrol} disabled={busy || !chosen}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Enrol student
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
