import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";

export default function ExamsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Exams" description="Sit exams and view results." />
      <ComingSoon />
    </div>
  );
}
