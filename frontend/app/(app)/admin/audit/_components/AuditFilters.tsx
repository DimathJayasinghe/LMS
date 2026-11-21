"use client";

import { useRouter } from "next/navigation";

interface Props {
  action: string;
  from: string;
  to: string;
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

// Mirrors backend/src/utils/constants.ts AUDIT_ACTION — keep in sync when a new
// action is added there. `action` itself is a free-text filter server-side, so
// an unlisted value still works if typed directly into the URL.
const ACTIONS = [
  "ROLE_CHANGED",
  "USER_ACTIVATED",
  "USER_DEACTIVATED",
  "BARCODE_ASSIGNED",
  "NIC_UPLOAD_URL",
  "STUDENT_BARCODE_ASSIGNED",
  "STUDENT_BARCODE_REMOVED",
  "SUBJECT_CREATED",
  "SUBJECT_UPDATED",
  "SUBJECT_TEACHERS_ASSIGNED",
  "INSTITUTE_CREATED",
  "INSTITUTE_UPDATED",
  "TIMETABLE_SLOT_CREATED",
  "TIMETABLE_SLOT_UPDATED",
  "TIMETABLE_SLOT_DELETED",
  "TIMETABLE_GENERATED",
  "CLASS_CREATED",
  "CLASS_UPDATED",
  "COURSE_TEACHER_ASSIGNED",
  "COURSE_ASSET_UPLOAD_URL",
  "COURSE_ASSET_UPDATED",
  "COURSE_ASSET_REMOVED",
  "COURSE_MODULE_CREATED",
  "COURSE_MODULE_UPDATED",
  "COURSE_MODULE_REMOVED",
  "COURSE_MATERIAL_UPLOAD_URL",
  "COURSE_MATERIAL_ATTACHED",
  "COURSE_MATERIAL_UPDATED",
  "COURSE_MATERIAL_REMOVED",
  "COURSE_MATERIAL_DOWNLOADED",
  "SESSION_CREATED",
  "SESSION_UPDATED",
  "SESSION_DELETED",
  "LIVE_CLASS_SCHEDULED",
  "VIDEO_UPLOAD_INITIATED",
  "VIDEO_ATTACHED",
  "VIDEO_UPDATED",
  "VIDEO_DELETED",
  "EXAM_CREATED",
  "EXAM_UPDATED",
  "EXAM_DELETED",
  "MARKERS_ASSIGNED",
  "EXAM_UPLOAD_URL",
  "EXAM_PAPER_ATTACHED",
  "MARKS_SUBMITTED",
  "RESULTS_PUBLISHED",
  "RESULT_CORRECTED",
  "ENROLLMENT_CREATED",
  "ENROLLMENT_CANCELLED",
  "PAYMENT_OVERRIDDEN",
  "PAYMENT_BULK_UPLOAD",
  "PAYMENT_ENTRANCE_COLLECTED",
  "PAYMENT_REFUNDED",
  "ATTENDANCE_MANUAL",
  "ATTENDANCE_BARCODE",
  "ATTENDANCE_RECONCILED",
  "NOTIFICATION_SETTING_UPDATED",
] as const;

function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function AuditFilters({ action, from, to }: Props) {
  const router = useRouter();

  const go = (next: { action?: string; from?: string; to?: string }): void => {
    const q = new URLSearchParams();
    const a = next.action ?? action;
    const f = next.from ?? from;
    const t = next.to ?? to;
    if (a) q.set("action", a);
    if (f) q.set("from", f);
    if (t) q.set("to", t);
    const qs = q.toString();
    router.push(qs ? `/admin/audit?${qs}` : "/admin/audit");
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <select
        value={action}
        onChange={(e) => go({ action: e.target.value })}
        aria-label="Filter by action"
        className={inputClass}
      >
        <option value="">All actions</option>
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {actionLabel(a)}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        From
        <input
          type="date"
          value={from}
          onChange={(e) => go({ from: e.target.value })}
          aria-label="From date"
          className={inputClass}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        To
        <input
          type="date"
          value={to}
          onChange={(e) => go({ to: e.target.value })}
          aria-label="To date"
          className={inputClass}
        />
      </label>

      {(action || from || to) && (
        <button
          type="button"
          onClick={() => router.push("/admin/audit")}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
