import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";

export default function AttendancePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Attendance" description="Scan and review attendance." />
      <ComingSoon />
    </div>
  );
}
