"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { API_URL } from "@/lib/env";
import { reminderSummary, selectableIds } from "@/lib/outstanding";
import { formatCurrency } from "@/lib/utils";
import type { ApiSuccess, OutstandingRow, ReminderResult } from "@/lib/types";

interface Props {
  rows: OutstandingRow[];
  total: number;
  page: number;
  pageSize: number;
  month: string;
  courseId?: string;
  courses: { id: string; name: string; year?: number | null }[];
  canExport: boolean;
}

interface Pending {
  label: string;
  body: { month: string; courseId?: string; enrollmentIds?: string[] };
}

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

const dayLabel = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function OutstandingTable({ rows, total, page, pageSize, month, courseId, courses, canExport }: Props) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const selectable = selectableIds(rows);
  // Ticks from an earlier list (another month or course) drop out by themselves.
  const chosen = selectable.filter((id) => ticked.has(id));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const href = (next: { month?: string; courseId?: string; page?: number }): string => {
    const q = new URLSearchParams({ month: next.month ?? month });
    const course = "courseId" in next ? next.courseId : courseId;
    if (course) q.set("courseId", course);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    return `/payments/owing?${q.toString()}`;
  };
  const exportQuery = new URLSearchParams({ month, ...(courseId ? { courseId } : {}) }).toString();

  const toggle = (id: string): void => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const send = async (): Promise<void> => {
    if (!pending) return;
    setSending(true);
    setMessage(null);
    try {
      // A fresh key per click: the server remembers refusals under a key, so a retry after a fix must not reuse one.
      const res = await api.post<ApiSuccess<ReminderResult>>("/payments/outstanding/reminders", pending.body, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setMessage({ tone: "ok", text: reminderSummary(res.data) });
      setTicked(new Set());
      router.refresh();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof ApiError ? e.message : "Could not send reminders. Try again." });
    } finally {
      setSending(false);
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Month
          <input type="month" value={month} onChange={(e) => e.target.value && router.push(href({ month: e.target.value }))} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Course
          <select value={courseId ?? ""} onChange={(e) => router.push(href({ courseId: e.target.value || undefined }))} className={inputClass}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.year ? ` · ${c.year}` : ""}</option>
            ))}
          </select>
        </label>
        {canExport && (
          <a
            href={`${API_URL}/payments/outstanding/export?${exportQuery}`}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={chosen.length === 0 || sending} onClick={() => setPending({ label: `${chosen.length} fee reminder${chosen.length === 1 ? "" : "s"}`, body: { month, enrollmentIds: chosen } })}>
          <MessageSquareText className="size-4" aria-hidden />
          Remind selected ({chosen.length})
        </Button>
        {courseId && (
          <Button type="button" size="sm" variant="outline" disabled={sending || total === 0} onClick={() => setPending({ label: "a fee reminder to everyone owing in this course", body: { month, courseId } })}>
            Remind everyone in this course
          </Button>
        )}
      </div>

      {pending && (
        <div role="alertdialog" aria-label="Confirm reminders" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <span>Send {pending.label} for {month}? Students in the grace days and those already reminded this month are skipped.</span>
          <Button type="button" size="sm" disabled={sending} onClick={() => void send()}>
            {sending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Send reminders
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={sending} onClick={() => setPending(null)}>Cancel</Button>
        </div>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-destructive" : "text-foreground"}`}>
          {message.text}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          Nobody owes a fee for these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select everyone who can be reminded"
                    checked={selectable.length > 0 && chosen.length === selectable.length}
                    disabled={selectable.length === 0}
                    onChange={(e) => setTicked(e.target.checked ? new Set(selectable) : new Set())}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Mobile</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.enrollmentId} className="bg-card">
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`Select ${r.studentName}`} disabled={r.inGrace} checked={chosen.includes(r.enrollmentId)} onChange={() => toggle(r.enrollmentId)} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.studentName}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">#{r.indexNumber}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.phone ? <a href={`tel:${r.phone}`} className="underline-offset-2 hover:underline">{r.phone}</a> : <span className="text-muted-foreground">No mobile</span>}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {r.courseName}
                    <span className="text-muted-foreground"> · {r.classType === "ONLINE" ? "Online" : "In hall"}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCurrency(r.totalOwed)}
                    <p className="text-xs text-muted-foreground">{r.monthsOwed} month{r.monthsOwed === 1 ? "" : "s"}</p>
                    {r.inGrace && r.graceUntil && <p className="text-xs text-amber-600">In grace until {dayLabel(r.graceUntil)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} owing · page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={href({ page: page - 1 })} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted">
                <ChevronLeft className="size-4" aria-hidden />Prev
              </a>
            )}
            {page < totalPages && (
              <a href={href({ page: page + 1 })} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted">
                Next<ChevronRight className="size-4" aria-hidden />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
