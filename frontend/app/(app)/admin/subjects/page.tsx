import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";

export default function AdminSubjectsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Subjects" description="Manage subjects and their courses." />
      <ComingSoon />
    </div>
  );
}
