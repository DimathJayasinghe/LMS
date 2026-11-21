"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { AcademicStaff, ApiSuccess, Course, Role, Subject } from "@/lib/types";
import { CourseAssets } from "./CourseAssets";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

interface Props {
  viewerRole: Role;
  subjects: Subject[];
  teachers: AcademicStaff[];
  allowedTeacherIdsBySubject: Record<string, string[]>;
  course?: Course;
}

export function CourseForm({
  viewerRole,
  subjects,
  teachers,
  allowedTeacherIdsBySubject,
  course,
}: Props) {
  const router = useRouter();
  const isEditing = Boolean(course);
  const isSuperAdmin = viewerRole === "SUPER_ADMIN";
  const [name, setName] = useState(course?.name ?? "");
  const [year, setYear] = useState(String(course?.year ?? new Date().getFullYear()));
  const [monthlyFee, setMonthlyFee] = useState(course?.monthlyFee ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [subjectId, setSubjectId] = useState(course?.subjectId ?? subjects[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(course?.teacherId ?? "");
  const [isActive, setIsActive] = useState(course?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedTeachers = useMemo(() => {
    const allowed = new Set(allowedTeacherIdsBySubject[subjectId] ?? []);
    return teachers.filter((teacher) => allowed.has(teacher.id));
  }, [allowedTeacherIdsBySubject, subjectId, teachers]);

  const selectSubject = (value: string): void => {
    setSubjectId(value);
    if (isSuperAdmin && !(allowedTeacherIdsBySubject[value] ?? []).includes(teacherId)) {
      setTeacherId("");
    }
  };

  const submit = async (): Promise<void> => {
    if (name.trim().length < 2) return setError("Class name must be at least 2 characters.");
    if (!subjectId) return setError("Choose a subject.");
    if (!(Number(year) > 0)) return setError("Enter a valid year.");
    if (!(Number(monthlyFee) > 0)) return setError("Monthly fee must be greater than zero.");
    if (isSuperAdmin && !teacherId) {
      return setError("Assign a teacher who is approved for this subject first.");
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      year: Number(year),
      monthlyFee: Number(monthlyFee),
      description: description.trim() || undefined,
      isActive,
    };
    if (!isEditing || isSuperAdmin) body.subjectId = subjectId;
    if (isSuperAdmin) body.teacherId = teacherId;

    setSaving(true);
    setError(null);
    try {
      const result = isEditing
        ? await api.patch<ApiSuccess<Course>>(`/classes/${course!.id}`, body, {
            headers: { "Idempotency-Key": crypto.randomUUID() },
          })
        : await api.post<ApiSuccess<Course>>("/classes", body, {
            headers: { "Idempotency-Key": crypto.randomUUID() },
          });
      router.push(`/classes/${result.data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the class. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="course-name" className="text-sm font-medium">Class name</label>
          <input id="course-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="course-subject" className="text-sm font-medium">Subject</label>
          <select
            id="course-subject"
            value={subjectId}
            onChange={(e) => selectSubject(e.target.value)}
            disabled={isEditing && !isSuperAdmin}
            className={field}
          >
            {subjects.length === 0 && <option value="">No assigned subjects</option>}
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="space-y-1.5">
          <label htmlFor="course-teacher" className="text-sm font-medium">Assigned teacher</label>
          <select id="course-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={field}>
            <option value="">Choose an assigned teacher…</option>
            {allowedTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
          {subjectId && allowedTeachers.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No teachers are assigned to this subject. Manage its teacher assignments first.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="course-year" className="text-sm font-medium">Academic year</label>
          <input id="course-year" type="number" min={2000} value={year} onChange={(e) => setYear(e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="course-fee" className="text-sm font-medium">Monthly fee (LKR)</label>
          <input id="course-fee" type="number" min={1} step="0.01" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} className={field} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="course-description" className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea id="course-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className={`${field} resize-y`} />
      </div>

      {course ? (
        <CourseAssets initialCourse={course} />
      ) : (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Create the class first, then open Edit to upload its banner and backdrop securely.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4" />
        Class is active and visible
      </label>

      {error && <p className="flex items-center gap-2 text-sm text-destructive" role="alert"><AlertCircle className="size-4" aria-hidden />{error}</p>}

      <Button onClick={submit} disabled={saving || subjects.length === 0} size="lg">
        {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        {isEditing ? "Save class" : "Create class"}
      </Button>
    </div>
  );
}
