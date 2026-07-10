import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";

export default function TimetablePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Timetable" description="Your weekly schedule." />
      <ComingSoon />
    </div>
  );
}
