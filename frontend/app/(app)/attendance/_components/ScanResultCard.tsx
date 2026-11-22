import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ScanContext, ScanWarning } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeZone: "Asia/Colombo" });

type Tone = "ok" | "warn" | "alert";
const TONE_CLASS: Record<Tone, string> = {
  ok: "border-emerald-600/40 bg-emerald-50 text-emerald-900",
  warn: "border-amber-500/50 bg-amber-50 text-amber-900",
  alert: "border-destructive/50 bg-destructive/10 text-destructive",
};
const ALERTS: ScanWarning[] = ["NOT_ENROLLED", "FEE_UNPAID"];

/** The face and the state of the student just scanned, so the clerk can act before the next one steps up. */
export function ScanResultCard({ context, classId }: { context: ScanContext; classId: string }) {
  const { student, warnings, month, graceUntil } = context;
  const tone: Tone = warnings.some((w) => ALERTS.includes(w)) ? "alert" : warnings.length > 0 ? "warn" : "ok";
  const graceDate = graceUntil ? dateFmt.format(new Date(`${graceUntil}T12:00:00+05:30`)) : null;
  const owes = warnings.includes("FEE_IN_GRACE") || warnings.includes("FEE_UNPAID");

  return (
    <div role="status" data-tone={tone} className={cn("mt-3 flex gap-4 rounded-xl border p-3", TONE_CLASS[tone])}>
      {student.profileImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a remote avatar of unknown size, shown once
        <img src={student.profileImage} alt={student.name} className="size-24 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground">
          No photo on file
        </div>
      )}
      <div className="min-w-0 space-y-1 text-sm">
        <p className="text-base font-semibold">{student.name}</p>
        <p className="text-xs opacity-80">#{student.indexNumber}</p>
        {warnings.includes("NOT_ENROLLED") && (
          <p className="flex flex-wrap items-center gap-2 font-medium">
            Not enrolled in this class
            <Link href={`/classes/${classId}`} className="underline">Enrol</Link>
          </p>
        )}
        {warnings.includes("MODE_MISMATCH") && <p className="font-medium">Enrolled for online classes only</p>}
        {warnings.includes("FEE_IN_GRACE") && <p className="font-medium">{month} fee not paid yet. In grace until {graceDate}.</p>}
        {warnings.includes("FEE_UNPAID") && <p className="font-medium">{month} fee is not paid.</p>}
        {context.paidThisMonth && <p className="font-medium">Paid for {month}</p>}
        {owes && <Link href="/payments" className="inline-block font-medium underline">Collect payment</Link>}
      </div>
    </div>
  );
}
