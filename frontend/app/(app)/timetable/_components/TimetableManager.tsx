"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, Course, Institute, TimetableSlot } from "@/lib/types";

interface PreviewRow {
  timetableSlotId: string;
  title: string;
  date: string;
  status: "CREATE" | "EXISTS";
}

interface PreviewResult {
  rows: PreviewRow[];
  createCount: number;
  existingCount: number;
}

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function idempotencyHeaders(): HeadersInit {
  return { "Idempotency-Key": crypto.randomUUID() };
}

export function TimetableManager({
  courses,
  institutes,
  slots,
}: {
  courses: Course[];
  institutes: Institute[];
  slots: TimetableSlot[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const fortnight = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().slice(0, 10);
  }, []);

  const perform = async (name: string, action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(name);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The timetable could not be updated.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const createSlot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const instituteId = String(form.get("instituteId") ?? "");
    const succeeded = await perform("create", async () => {
      await api.post("/timetable/slots", {
        courseId: String(form.get("courseId")),
        title: String(form.get("title") ?? "") || undefined,
        dayOfWeek: Number(form.get("dayOfWeek")),
        startTime: String(form.get("startTime")),
        durationMinutes: Number(form.get("durationMinutes")),
        classType: String(form.get("classType")) || null,
        instituteId: instituteId || null,
      }, { headers: idempotencyHeaders() });
    });
    if (succeeded) formElement.reset();
  };

  const rangeBody = (form: HTMLFormElement) => {
    const data = new FormData(form);
    return {
      from: new Date(`${String(data.get("from"))}T00:00:00+05:30`).toISOString(),
      to: new Date(`${String(data.get("to"))}T23:59:59+05:30`).toISOString(),
    };
  };

  const editSlot = async (event: FormEvent<HTMLFormElement>, slotId: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const instituteId = String(data.get("instituteId") ?? "");
    await perform(slotId, () => api.patch(`/timetable/slots/${slotId}`, {
      title: String(data.get("title") ?? "") || null,
      dayOfWeek: Number(data.get("dayOfWeek")),
      startTime: String(data.get("startTime")),
      durationMinutes: Number(data.get("durationMinutes")),
      classType: String(data.get("classType")) || null,
      instituteId: instituteId || null,
    }, { headers: idempotencyHeaders() }));
  };

  const previewGeneration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("preview");
    setError(null);
    try {
      const result = await api.post<ApiSuccess<PreviewResult>>(
        "/timetable/generate/preview",
        rangeBody(event.currentTarget),
      );
      setPreview(result.data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The preview could not be prepared.");
    } finally {
      setBusy(null);
    }
  };

  const generate = async (form: HTMLFormElement) => {
    const succeeded = await perform("generate", () => api.post(
      "/timetable/generate",
      rangeBody(form),
      { headers: idempotencyHeaders() },
    ));
    if (succeeded) setPreview(null);
  };

  return (
    <section className="mb-8 space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">Manage recurring timetable</h2>
        <p className="text-sm text-muted-foreground">
          Colombo time. Conflicting class, teacher, and institute bookings are rejected automatically.
        </p>
      </div>

      <form className="grid gap-3 md:grid-cols-3" onSubmit={createSlot}>
        <label className="text-sm">Class
          <select name="courseId" required className={field} defaultValue="">
            <option value="" disabled>Select a class</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name} ({course.year})</option>)}
          </select>
        </label>
        <label className="text-sm">Optional title<input name="title" maxLength={200} className={field} /></label>
        <label className="text-sm">Day
          <select name="dayOfWeek" className={field} defaultValue="1">
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
              <option key={day} value={index}>{day}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">Start time<input name="startTime" type="time" required className={field} /></label>
        <label className="text-sm">Duration (minutes)<input name="durationMinutes" type="number" min={1} max={600} defaultValue={60} required className={field} /></label>
        <label className="text-sm">Mode
          <select name="classType" className={field} defaultValue="">
            <option value="">All cohorts</option><option value="ONLINE">Online</option><option value="PHYSICAL">Physical</option>
          </select>
        </label>
        <label className="text-sm md:col-span-2">Institute (physical location)
          <select name="instituteId" className={field} defaultValue="">
            <option value="">No institute</option>
            {institutes.map((institute) => <option key={institute.id} value={institute.id}>{institute.name}</option>)}
          </select>
        </label>
        <div className="flex items-end"><Button className="w-full" disabled={busy !== null || courses.length === 0}>
          {busy === "create" ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarPlus aria-hidden />} Add slot
        </Button></div>
      </form>

      <form className="flex flex-wrap items-end gap-3 border-t border-border pt-4" onSubmit={previewGeneration}>
        <label className="text-sm">From<input name="from" type="date" required defaultValue={today} className={field} /></label>
        <label className="text-sm">To<input name="to" type="date" required defaultValue={fortnight} className={field} /></label>
        <Button type="submit" variant="outline" disabled={busy !== null}>Preview generation</Button>
        {preview && (
          <Button type="button" disabled={busy !== null || preview.createCount === 0} onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) void generate(form);
          }}>
            {busy === "generate" && <Loader2 className="animate-spin" aria-hidden />}
            Generate {preview.createCount} session{preview.createCount === 1 ? "" : "s"}
          </Button>
        )}
      </form>
      {preview && <p className="text-sm text-muted-foreground">{preview.createCount} new; {preview.existingCount} already generated.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {slots.some((slot) => slot.isActive) && (
        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-medium">Edit active slots</summary>
          <div className="mt-3 space-y-3">
            {slots.filter((slot) => slot.isActive).map((slot) => (
              <form key={slot.id} onSubmit={(event) => editSlot(event, slot.id)} className="grid gap-2 rounded-xl border p-3 md:grid-cols-7">
                <p className="self-end pb-2 text-sm font-medium">{slot.course?.name ?? "Class"}</p>
                <label className="text-xs">Title<input name="title" defaultValue={slot.title ?? ""} maxLength={200} className={field} /></label>
                <label className="text-xs">Day<select name="dayOfWeek" defaultValue={slot.dayOfWeek} className={field}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select></label>
                <label className="text-xs">Start<input name="startTime" type="time" required defaultValue={slot.startTime} className={field} /></label>
                <label className="text-xs">Minutes<input name="durationMinutes" type="number" min={1} max={600} required defaultValue={slot.durationMinutes} className={field} /></label>
                <label className="text-xs">Mode<select name="classType" defaultValue={slot.classType ?? ""} className={field}>
                  <option value="">All</option><option value="ONLINE">Online</option><option value="PHYSICAL">Physical</option>
                </select></label>
                <div className="flex items-end"><Button size="sm" variant="outline" className="w-full" disabled={busy !== null}>Save</Button></div>
                <label className="text-xs md:col-start-2 md:col-span-5">Institute<select name="instituteId" defaultValue={slot.instituteId ?? ""} className={field}>
                  <option value="">No institute</option>
                  {institutes.map((institute) => <option key={institute.id} value={institute.id}>{institute.name}</option>)}
                </select></label>
              </form>
            ))}
          </div>
        </details>
      )}

      {slots.some((slot) => !slot.isActive) && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-sm font-medium">Inactive slots</p>
          <div className="flex flex-wrap gap-2">
            {slots.filter((slot) => !slot.isActive).map((slot) => (
              <Button key={slot.id} size="sm" variant="outline" disabled={busy !== null} onClick={() => perform(slot.id, () => api.patch(
                `/timetable/slots/${slot.id}`,
                { isActive: true },
                { headers: idempotencyHeaders() },
              ))}>
                <RotateCcw aria-hidden /> Restore {slot.title ?? slot.course?.name ?? "slot"}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">{busy ? "Updating timetable" : ""}</div>
      {slots.filter((slot) => slot.isActive).length > 0 && (
        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-medium">Disable a recurring slot</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {slots.filter((slot) => slot.isActive).map((slot) => (
              <Button key={slot.id} size="sm" variant="outline" disabled={busy !== null} onClick={() => perform(slot.id, () => api.del(
                `/timetable/slots/${slot.id}`,
                { headers: idempotencyHeaders() },
              ))}>
                <Trash2 aria-hidden /> {slot.title ?? slot.course?.name ?? "Slot"}
              </Button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
