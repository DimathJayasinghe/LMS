"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, Loader2, ScanLine, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import { QrCamera } from "@/components/custom/QrCamera";
import { attendanceSourceLabel } from "@/lib/attendance";
import type {
  ApiList,
  ApiSuccess,
  AttendanceRecord,
  AttendanceSource,
  ClassSession,
  Course,
  Institute,
  User,
} from "@/lib/types";

interface Props {
  classes: Course[];
  institutes: Institute[];
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

const timeFmt = new Intl.DateTimeFormat("en-LK", { timeStyle: "short", timeZone: "Asia/Colombo" });
const dayFmt = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeZone: "Asia/Colombo" });

const isToday = (iso: string): boolean =>
  new Date(iso).toDateString() === new Date().toDateString();

function scanErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong. Try again.";
  switch (e.code) {
    case "BARCODE_NOT_FOUND":
      return "No student found for this code.";
    case "AMBIGUOUS_CODE":
      return "This code matches more than one student. Search by name or index number instead.";
    case "STUDENT_DEACTIVATED":
      return "That student account is deactivated.";
    case "INVALID_ROLE_FOR_ATTENDANCE":
      return "That code doesn't belong to a student.";
    case "INSTITUTE_NOT_FOUND":
      return "That institute is unavailable. Choose another location.";
    case "SESSION_INSTITUTE_MISMATCH":
      return "This session is scheduled at a different institute.";
    default:
      return e.message;
  }
}

export function StaffScanner({ classes, institutes }: Props) {
  const [instituteId, setInstituteId] = useState("");
  const [classId, setClassId] = useState("");
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [roster, setRoster] = useState<AttendanceRecord[]>([]);

  const [scanValue, setScanValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [manualTerm, setManualTerm] = useState("");
  const [manualResults, setManualResults] = useState<User[]>([]);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const lastDecoded = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const selectInstitute = (id: string): void => {
    setInstituteId(id);
    setClassId("");
    setSessionId("");
    setSessions([]);
    setRoster([]);
    setResult(null);
    setCameraOn(false);
  };

  // Load sessions when a class is chosen (resets happen in selectClass).
  useEffect(() => {
    if (!classId) return;
    let active = true;
    api
      .get<ApiList<ClassSession>>(`/classes/${classId}/sessions`)
      .then((r) => {
        if (!active) return;
        const sorted = [...r.data].sort((a, b) => +new Date(b.date) - +new Date(a.date));
        setSessions(sorted);
      })
      .catch(() => active && setSessions([]));
    return () => {
      active = false;
    };
  }, [classId]);

  // Seed the roster when a session is chosen.
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    api
      .get<ApiList<AttendanceRecord>>(`/attendance/session/${sessionId}`)
      .then((r) => active && setRoster(r.data))
      .catch(() => active && setRoster([]));
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Debounced student search for the manual fallback (results gated in render).
  useEffect(() => {
    const term = manualTerm.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      api
        .get<ApiList<User>>(`/users?search=${encodeURIComponent(term)}&role=STUDENT&limit=8`)
        .then((r) => setManualResults(r.data))
        .catch(() => setManualResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [manualTerm]);

  const selectClass = (id: string): void => {
    setClassId(id);
    setSessionId("");
    setSessions([]);
    setRoster([]);
    setResult(null);
  };

  const selectSession = (id: string): void => {
    setSessionId(id);
    setRoster([]); // the effect refills it for a non-empty id
    setResult(null);
  };

  const addToRoster = (rec: AttendanceRecord): void =>
    setRoster((prev) => [rec, ...prev.filter((r) => r.userId !== rec.userId)]);

  const submitScan = async (raw: string, source: AttendanceSource): Promise<void> => {
    const barcode = raw.trim();
    if (!barcode || !instituteId || !sessionId || busy) return;
    setBusy(true);
    try {
      const res = await api.post<ApiSuccess<AttendanceRecord>>("/attendance/scan", {
        barcode,
        classSessionId: sessionId,
        instituteId,
        source,
      });
      addToRoster(res.data);
      setResult({
        ok: true,
        msg: `${res.data.user?.name ?? "Student"} #${res.data.user?.indexNumber ?? "?"} checked in`,
      });
    } catch (e) {
      setResult({ ok: false, msg: scanErrorMessage(e) });
    } finally {
      setBusy(false);
      setScanValue("");
      scanInputRef.current?.focus();
    }
  };

  const onCameraDecode = (text: string): void => {
    const now = Date.now();
    if (lastDecoded.current.value === text && now - lastDecoded.current.at < 2500) return;
    lastDecoded.current = { value: text, at: now };
    void submitScan(text, "QR");
  };

  const markManual = async (u: User): Promise<void> => {
    if (!sessionId) return;
    try {
      const res = await api.post<ApiSuccess<AttendanceRecord>>("/attendance/manual", {
        userId: u.id,
        classSessionId: sessionId,
      });
      addToRoster(res.data);
      setResult({ ok: true, msg: `${res.data.user?.name ?? u.name} checked in (manual)` });
      setManualTerm("");
      setManualResults([]);
    } catch (e) {
      setResult({ ok: false, msg: e instanceof ApiError ? e.message : "Couldn't mark attendance." });
    }
  };

  const toggleCamera = (): void => {
    setCameraError(null);
    setCameraOn((on) => !on);
  };

  const ready = Boolean(instituteId && sessionId);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {/* Session picker */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Institute</span>
            <select
              value={instituteId}
              onChange={(e) => selectInstitute(e.target.value)}
              aria-label="Select institute"
              className={`${inputClass} w-full`}
            >
              <option value="">Select an institute...</option>
              {institutes.map((institute) => (
                <option key={institute.id} value={institute.id}>
                  {institute.name}
                  {institute.city ? ` · ${institute.city}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Class</span>
            <select
              value={classId}
              onChange={(e) => selectClass(e.target.value)}
              disabled={!instituteId}
              aria-label="Select class"
              className={`${inputClass} w-full disabled:opacity-50`}
            >
              <option value="">{instituteId ? "Select a class..." : "Pick an institute first"}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.year ? ` · ${c.year}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Session</span>
            <select
              value={sessionId}
              onChange={(e) => selectSession(e.target.value)}
              disabled={!classId || sessions.length === 0}
              aria-label="Select session"
              className={`${inputClass} w-full disabled:opacity-50`}
            >
              <option value="">
                {!classId
                  ? "Pick a class first"
                  : sessions.length === 0
                    ? "No sessions"
                    : "Select a session…"}
              </option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {dayFmt.format(new Date(s.date))}
                  {isToday(s.date) ? " · Today" : ""}
                  {s.title ? ` · ${s.title}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Scan field + camera toggle */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <ScanLine
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={scanInputRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitScan(scanValue, "BARCODE");
                  }
                }}
                disabled={!ready || busy}
                autoFocus
                placeholder={ready ? "Scan or type a code, then Enter" : "Pick a session first"}
                aria-label="Scan code"
                className={`${inputClass} w-full pl-9 disabled:opacity-50`}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!ready}
              onClick={toggleCamera}
              aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
            >
              {cameraOn ? <CameraOff className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            </Button>
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>

          {result && (
            <p
              className={`mt-2 flex items-center gap-1.5 text-sm ${
                result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              }`}
            >
              {result.ok ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
              {result.msg}
            </p>
          )}

          {cameraOn && (
            <div className="mt-3">
              {cameraError ? (
                <p className="text-sm text-destructive">{cameraError}</p>
              ) : (
                <QrCamera
                  onDecode={onCameraDecode}
                  onError={(m) => {
                    setCameraError(m);
                    setCameraOn(false);
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Manual mark fallback */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <UserPlus className="size-4" aria-hidden />
            Mark by name
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">For students who forgot their code.</p>
          <div className="relative mt-3">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              value={manualTerm}
              onChange={(e) => setManualTerm(e.target.value)}
              disabled={!ready}
              placeholder="Search student name or index…"
              aria-label="Search student"
              className={`${inputClass} w-full pl-9 disabled:opacity-50`}
            />
          </div>
          {manualTerm.trim().length >= 2 && manualResults.length > 0 && (
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {manualResults.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 bg-background p-2 text-sm">
                  <span>
                    {u.name} <span className="text-xs text-muted-foreground">#{u.indexNumber}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => markManual(u)}>
                    Mark
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Live roster */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Checked in</h2>
          <Badge variant="outline" className="tabular-nums">
            {roster.length}
          </Badge>
        </div>
        {!ready ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Pick a session to begin.</p>
        ) : roster.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No check-ins yet.</p>
        ) : (
          <ul className="space-y-2">
            {roster.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.user?.name ?? "Student"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    #{r.user?.indexNumber ?? "?"} · {timeFmt.format(new Date(r.lastSeenAt))}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {attendanceSourceLabel(r.source)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
