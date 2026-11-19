"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { AcademicStaff, ApiList, SubjectTeacherAssignment } from "@/lib/types";

export function SubjectTeacherManager({
  subjectId,
  teachers,
  assignments,
}: {
  subjectId: string;
  teachers: AcademicStaff[];
  assignments: SubjectTeacherAssignment[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(assignments.map((item) => item.teacherId)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (teacherId: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await api.put<ApiList<SubjectTeacherAssignment>>(
        `/subjects/${subjectId}/teachers`,
        { teacherIds: [...selected] },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update teacher assignments.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <fieldset className="overflow-hidden rounded-2xl border border-border">
        <legend className="sr-only">Assigned teachers</legend>
        {teachers.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No active teacher accounts are available.</p>
        ) : (
          <ul className="divide-y divide-border">
            {teachers.map((teacher) => (
              <li key={teacher.id}>
                <label className="flex cursor-pointer items-center gap-3 p-4 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={selected.has(teacher.id)}
                    onChange={() => toggle(teacher.id)}
                    className="size-4"
                  />
                  <span className="font-medium text-foreground">{teacher.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Assigned teachers may create and manage classes only within this subject. A teacher who still owns a class cannot be removed until that class is reassigned.
      </p>
      {error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" aria-hidden />{error}</p>}
      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        Save assignments
      </Button>
    </div>
  );
}
