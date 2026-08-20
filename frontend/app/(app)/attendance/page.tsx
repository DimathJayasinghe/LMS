import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays, QrCode } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";
import { Badge } from "@/components/ui/badge";
import { AttendanceQr } from "./_components/AttendanceQr";
import { AttendanceReport } from "./_components/AttendanceReport";
import { StaffScanner } from "./_components/StaffScanner";
import { api } from "@/lib/api";
import { attendanceSourceLabel } from "@/lib/attendance";
import type { ApiList, ApiSuccess, AttendanceRecord, Course, Institute, User } from "@/lib/types";

export const metadata = { title: "Attendance · LMS" };

const dateFmt = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

export default async function AttendancePage() {
  const cookie = (await cookies()).toString();

  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }

  // Front-desk gets the entrance scanner; SUPER_ADMIN also gets recovery reports.
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
    const [classes, institutes] = await Promise.all([
      api
        .get<ApiList<Course>>("/classes", { cookie })
        .then((r) => r.data)
        .catch(() => [] as Course[]),
      api
        .get<ApiList<Institute>>("/institutes", { cookie })
        .then((r) => r.data.filter((institute) => institute.isActive))
        .catch(() => [] as Institute[]),
    ]);
    if (user.role === "ADMIN") return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Attendance" description="Scan students in at the entrance." />
        <StaffScanner classes={classes} institutes={institutes} />
      </div>
    );

    return (
      <div className="mx-auto max-w-5xl space-y-10">
        <div>
          <PageHeader title="Attendance" description="Scan students in and recover missed online attendance." />
          <StaffScanner classes={classes} institutes={institutes} />
        </div>
        <section className="space-y-4 border-t border-border pt-8">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Attendance reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review a session roster and preview Zoom differences before syncing them.
            </p>
          </div>
          <AttendanceReport classes={classes} />
        </section>
      </div>
    );
  }

  if (user.role === "TEACHER") {
    const classes = await api
      .get<ApiList<Course>>("/classes", { cookie })
      .then((result) => result.data.filter((course) => course.teacherId === user.id))
      .catch(() => [] as Course[]);

    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Attendance reports"
          description="Review your class rosters and recover attendance missed by Zoom webhooks."
        />
        <AttendanceReport classes={classes} />
      </div>
    );
  }

  if (user.role === "MARKER") {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Attendance" description="Review attendance." />
        <ComingSoon label="Attendance reporting is not available for markers" />
      </div>
    );
  }

  let history: AttendanceRecord[] = [];
  try {
    history = (
      await api.get<ApiList<AttendanceRecord>>(`/attendance/student/${user.id}?limit=50`, {
        cookie,
      })
    ).data;
  } catch {
    /* non-fatal — show the code even if history can't load */
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Attendance"
        description="Show your code at the entrance to check in."
      />

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <section className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center">
          {user.barcode ? (
            <>
              <AttendanceQr value={user.barcode} />
              <p className="mt-4 max-w-[15rem] text-xs text-muted-foreground">
                Show this to the front desk to mark your attendance. Index #{user.indexNumber}.
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <QrCode className="size-6" aria-hidden />
              </span>
              <p className="text-sm font-medium text-foreground">No check-in code yet</p>
              <p className="max-w-[16rem] text-xs text-muted-foreground">
                Your attendance code is assigned by the front desk. Ask staff to set it up on
                your next visit.
              </p>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden />
            Recent attendance
          </h2>

          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              No attendance recorded yet. Your check-ins will appear here.
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {history.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-2 bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {record.classSession?.title ?? "Class session"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {dateFmt.format(new Date(record.scannedAt))}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-normal">
                    {attendanceSourceLabel(record.source)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
