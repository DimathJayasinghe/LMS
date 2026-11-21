"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ClipboardPaste, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { hallMarkMessage, isBlockingStatus, parseHallMarks } from "@/lib/hall-marks";
import type { ApiSuccess, HallMarksResult } from "@/lib/types";

interface Props {
  examId: string;
  totalMarks: number;
}

interface Checked {
  text: string;
  result: HallMarksResult;
}

/**
 * Paste-a-list entry for paper exams sat in the hall. A check judges every row and saves nothing; Save is enabled only
 * for an unchanged list whose last check had no problem row, and the server still re-checks and saves all or none.
 * Every request carries a fresh Idempotency-Key, so a corrected list is never answered with an old reply.
 */
export function HallMarksEntry({ examId, totalMarks }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ line: number; text: string; message: string }[]>([]);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const stale = checked !== null && checked.text !== text;
  const clean = checked !== null && !stale && checked.result.counts.rejected === 0;
  const canSave = clean && checked.result.counts.changed > 0 && busy === null;

  async function send(dryRun: boolean): Promise<HallMarksResult | null> {
    const parsed = parseHallMarks(text);
    setProblems(parsed.errors);
    setError(null);
    if (parsed.errors.length > 0) return null;
    if (parsed.rows.length === 0) {
      setError("Paste at least one line: the index number, then the marks.");
      return null;
    }
    setBusy(dryRun ? "check" : "save");
    try {
      const response = await api.put<ApiSuccess<HallMarksResult>>(
        `/exams/${examId}/hall-marks`,
        { rows: parsed.rows, dryRun },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      return response.data;
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "HALL_MARKS_REJECTED") {
        setChecked(null);
        setError("Nothing was saved because the class changed since the check. Check the list again.");
      } else {
        setError(cause instanceof ApiError ? cause.message : "Could not reach the server. Try again.");
      }
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setSavedCount(null);
    const result = await send(true);
    if (result) setChecked({ text, result });
  }

  async function save() {
    const result = await send(false);
    if (!result) return;
    setSavedCount(result.counts.changed);
    setChecked(null);
    setText("");
    router.refresh();
  }

  return (
    <section aria-labelledby="hall-marks-heading" className="mb-5 rounded-2xl border border-border bg-card p-5">
      <h2 id="hall-marks-heading" className="flex items-center gap-2 font-semibold text-foreground">
        <ClipboardPaste className="size-4" aria-hidden />
        Enter paper marks
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste one student per line: the index number, then the marks out of {totalMarks}. Students who were absent are left
        out. Nothing is saved until you check the list and press Save.
      </p>

      <label htmlFor="hall-marks-text" className="mt-4 block text-sm font-medium text-foreground">
        Index numbers and marks
      </label>
      <textarea
        id="hall-marks-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={8}
        spellCheck={false}
        autoComplete="off"
        placeholder={"101 78\n102 64\n107 91"}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
      />

      {problems.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-sm text-destructive">
          {problems.map((problem) => (
            <li key={problem.line}>
              Line {problem.line} ({problem.text}): {problem.message}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {savedCount !== null && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700">
          <Check className="size-4" aria-hidden />
          Saved {savedCount} {savedCount === 1 ? "mark" : "marks"}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={check} disabled={busy !== null || text.trim() === ""}>
          {busy === "check" && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Check marks
        </Button>
        <Button type="button" onClick={save} disabled={!canSave}>
          {busy === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {clean && checked.result.counts.changed > 0 ? `Save ${checked.result.counts.changed} ${checked.result.counts.changed === 1 ? "mark" : "marks"}` : "Save"}
        </Button>
      </div>

      {checked && (
        <div aria-live="polite" className="mt-4">
          {stale && (
            <p className="mb-2 text-sm text-muted-foreground">The list changed after this check. Check it again before saving.</p>
          )}
          <p className="mb-2 text-sm text-foreground">
            {checked.result.counts.total} {checked.result.counts.total === 1 ? "row" : "rows"}:{" "}
            {checked.result.counts.changed} to save, {checked.result.counts.unchanged} unchanged
            {checked.result.counts.rejected > 0 ? `, ${checked.result.counts.rejected} to fix` : ""}.
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {checked.result.rows.map((row) => {
              const blocking = isBlockingStatus(row.status);
              return (
                <li key={`${row.line}-${row.indexNumber}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                  <span className="font-mono font-medium text-foreground">#{row.indexNumber}</span>
                  {row.name && <span className="text-foreground">{row.name}</span>}
                  <span className="text-muted-foreground">{row.marks} marks</span>
                  <span className={blocking ? "w-full font-medium text-destructive sm:w-auto" : "w-full text-muted-foreground sm:w-auto"}>
                    {blocking ? "Fix: " : ""}
                    {hallMarkMessage(row, totalMarks)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
