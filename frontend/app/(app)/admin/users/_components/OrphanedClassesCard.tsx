"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { dayName, readHandoverBlock } from "@/lib/handover";
import { roleLabel } from "@/lib/roles";
import type { AcademicStaff, OrphanedClassGroup } from "@/lib/types";

/**
 * Classes still running after their teacher left: deactivated before a leaving teacher had to hand over, or moved to
 * another role. The owner gives all of a teacher's classes to a working teacher in one step.
 */
export function OrphanedClassesCard({ groups, teachers }: { groups: OrphanedClassGroup[]; teachers: AcademicStaff[] }) {
  const router = useRouter();
  const [receivers, setReceivers] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; lines: string[] } | null>(null);

  if (groups.length === 0) return null;

  async function handOver(teacherId: string) {
    setBusyId(teacherId);
    setProblem(null);
    try {
      await api.post(`/users/${teacherId}/handover`, { handoverAllTo: receivers[teacherId] }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      router.refresh();
    } catch (cause) {
      const block = readHandoverBlock(cause);
      const lines = block?.kind === "clash"
        ? block.conflicts.map((clash) => `${clash.courseName}, ${dayName(clash.dayOfWeek)} ${clash.startTime}, overlaps ${clash.clashesWith.courseName} at ${clash.clashesWith.startTime}`)
        : [cause instanceof ApiError ? cause.message : "Could not hand the classes over. Try again."];
      setProblem({ id: teacherId, lines });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="orphaned-heading" className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <h2 id="orphaned-heading" className="text-sm font-semibold text-foreground">Classes without a teacher</h2>
      <p className="mt-1 text-sm text-muted-foreground">Students are paying for these classes and nobody can run them. Hand them to a working teacher.</p>
      <ul className="mt-3 divide-y divide-border">
        {groups.map(({ teacher, courses }) => (
          <li key={teacher.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{teacher.name} <span className="font-normal text-muted-foreground">({teacher.deactivated ? "deactivated" : `now ${roleLabel(teacher.role)}`})</span></p>
              <p className="text-xs text-muted-foreground">{courses.map((course) => `${course.name} ${course.year}`).join(", ")}</p>
              {problem?.id === teacher.id && (
                <ul role="alert" className="mt-1 list-disc pl-5 text-xs text-destructive">{problem.lines.map((line) => <li key={line}>{line}</li>)}</ul>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label={`New teacher for the classes of ${teacher.name}`}
                value={receivers[teacher.id] ?? ""}
                onChange={(event) => setReceivers({ ...receivers, [teacher.id]: event.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="" disabled>Select a teacher</option>
                {teachers.filter((candidate) => candidate.id !== teacher.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
              <Button size="sm" disabled={!receivers[teacher.id] || busyId === teacher.id} onClick={() => handOver(teacher.id)} aria-label={`Hand over the classes of ${teacher.name}`}>
                {busyId === teacher.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Hand over"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
