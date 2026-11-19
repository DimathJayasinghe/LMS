"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { attendanceSourceLabel } from "@/lib/attendance";
import { ZoomReconciliationPanel } from "./ZoomReconciliationPanel";
import type { ApiList, AttendanceRecord, ClassSession, Course } from "@/lib/types";

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const dateFmt = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" });

export function AttendanceReport({ classes }: { classes: Course[] }) {
  const [classId, setClassId] = useState("");
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [roster, setRoster] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = sessions.find((item) => item.id === sessionId) ?? null;

  const selectClass = async (id: string): Promise<void> => {
    setClassId(id);
    setSessionId("");
    setSessions([]);
    setRoster([]);
    setError(null);
    if (!id) return;
    setLoading(true);
    try {
      const result = await api.get<ApiList<ClassSession>>(`/classes/${id}/sessions`);
      setSessions(
        result.data
          .filter((session) => !session.deletedAt)
          .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
      );
    } catch {
      setError("Couldn't load class sessions. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadRoster = async (id = sessionId): Promise<void> => {
    if (!id) return;
    const result = await api.get<ApiList<AttendanceRecord>>(`/attendance/session/${id}`);
    setRoster(result.data);
  };

  const selectSession = async (id: string): Promise<void> => {
    setSessionId(id);
    setRoster([]);
    setError(null);
    if (!id) return;
    setLoading(true);
    try {
      await loadRoster(id);
    } catch {
      setError("Couldn't load attendance for this session. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
        <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Class</span>
          <select value={classId} onChange={(event) => void selectClass(event.target.value)} aria-label="Report class" className={`${inputClass} w-full`}>
            <option value="">Select a class…</option>
            {classes.map((course) => <option key={course.id} value={course.id}>{course.name}{course.year ? ` · ${course.year}` : ""}</option>)}
          </select>
        </label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Session</span>
          <select value={sessionId} onChange={(event) => void selectSession(event.target.value)} disabled={!classId || sessions.length === 0} aria-label="Report session" className={`${inputClass} w-full disabled:opacity-50`}>
            <option value="">{loading ? "Loading…" : sessions.length === 0 ? "No sessions" : "Select a session…"}</option>
            {sessions.map((item) => <option key={item.id} value={item.id}>{dateFmt.format(new Date(item.date))} · {item.title}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading attendance" />}

      {session && !loading && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Attendance roster</h2><Badge variant="outline">{roster.length}</Badge></div>
            {roster.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No attendance recorded for this session.</p> : (
              <ul className="space-y-2">{roster.map((record) => <li key={record.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"><span className="min-w-0 truncate text-sm">{record.user?.name ?? "Student"} · #{record.user?.indexNumber ?? "?"}</span><Badge variant="outline">{attendanceSourceLabel(record.source)}</Badge></li>)}</ul>
            )}
          </section>
          <ZoomReconciliationPanel key={session.id} session={session} onSynced={loadRoster} />
        </div>
      )}

      {classes.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No classes are available for attendance reporting.</div>}
    </div>
  );
}
