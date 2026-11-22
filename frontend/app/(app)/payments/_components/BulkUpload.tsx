"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, BulkUploadResult } from "@/lib/types";

type Busy = "check" | "apply" | null;

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Owner-only tool for recording fees paid outside the system. The file is always checked first; applying is a second, separate step. */
export function BulkUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  // A new key for every request: reusing one would replay the check instead of applying the file.
  const send = async (dryRun: boolean): Promise<BulkUploadResult | null> => {
    if (!file) return null;
    const form = new FormData();
    form.append("file", file);
    setBusy(dryRun ? "check" : "apply");
    setError(null);
    try {
      const res = await api.upload<ApiSuccess<BulkUploadResult>>(`/payments/bulk-upload?dryRun=${dryRun}`, form, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setResult(res.data);
      return res.data;
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiError ? e.message : "Upload failed. Try again.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const apply = async (): Promise<void> => {
    const applied = await send(false);
    if (!applied?.applied) return;
    router.refresh();
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const recorded = result ? result.created + result.updated : 0;
  const hasErrors = (result?.errors.length ?? 0) > 0;
  const readyToApply = result !== null && result.dryRun && !result.applied && !hasErrors && recorded > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Bulk upload</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Records fees paid outside the system. Upload an .xlsx with columns: <code>enrollmentId</code> or{" "}
        <code>indexNumber + courseId + classType</code>, plus <code>paymentMonth</code> (YYYY-MM), optional{" "}
        <code>amount</code> and <code>note</code>. An amount must equal the course fee, a month that is already paid is never
        changed, and one bad row stops the whole file. The file is checked first; nothing is saved until you apply it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          aria-label="Bulk payment file"
          disabled={busy !== null}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
          className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-muted"
        />
        <Button variant="outline" disabled={!file || busy !== null} onClick={() => void send(true)}>
          {busy === "check" && <Loader2 className="animate-spin" aria-hidden />}
          Check file
        </Button>
        {readyToApply && (
          <Button disabled={busy !== null} onClick={() => void apply()}>
            {busy === "apply" && <Loader2 className="animate-spin" aria-hidden />}
            {busy === "apply" ? "Applying…" : `Apply ${plural(recorded, "payment")}`}
          </Button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}

      {result && (
        <div role="status" className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {result.applied ? (
            <p className="text-foreground">{plural(recorded, "payment")} recorded.</p>
          ) : (
            <p className="text-foreground">
              {plural(result.total, "row")} · {result.created} new · {result.updated} to update
              {hasErrors && ` · ${plural(result.errors.length, "error")}`}
            </p>
          )}
          {readyToApply && <p className="mt-1 text-xs text-muted-foreground">Nothing has been saved yet. Apply to record these payments.</p>}
          {hasErrors && (
            <>
              <p className="mt-1 text-xs text-muted-foreground">Nothing was saved. Fix these rows, then check the file again.</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-destructive">
                {result.errors.map((err) => (
                  <li key={err.row}>
                    Row {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
