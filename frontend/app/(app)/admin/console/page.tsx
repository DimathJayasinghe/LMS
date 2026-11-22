import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { requireUser } from "@/lib/session";
import { AttendancePanel } from "./_components/AttendancePanel";
import { CashPanel } from "./_components/CashPanel";
import { MarkingPanel } from "./_components/MarkingPanel";
import { OwingPanel } from "./_components/OwingPanel";
import { PanelSkeleton } from "./_components/PanelShell";
import { SetupPanel } from "./_components/SetupPanel";
import { SmsPanel } from "./_components/SmsPanel";

export const metadata = { title: "Console · LMS" };

export default async function ConsolePage() {
  const cookie = (await cookies()).toString();
  const viewer = await requireUser(cookie);
  if (viewer.role !== "SUPER_ADMIN") redirect("/dashboard");

  // Each panel reads for itself, so a slow or failing one never blanks the others.
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Console" description="What needs your attention today. Read only: nothing here changes anything." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Suspense fallback={<PanelSkeleton title="Cash today" />}>
          <CashPanel cookie={cookie} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Who owes" />}>
          <OwingPanel cookie={cookie} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Marking" />}>
          <MarkingPanel cookie={cookie} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Attendance today" />}>
          <AttendancePanel cookie={cookie} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Setup problems" />}>
          <SetupPanel cookie={cookie} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="SMS" />}>
          <SmsPanel cookie={cookie} />
        </Suspense>
      </div>
    </div>
  );
}
