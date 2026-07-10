import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";

export default function ClassesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Classes" description="Browse and manage classes." />
      <ComingSoon />
    </div>
  );
}
