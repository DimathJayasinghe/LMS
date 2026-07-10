import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";

export default function AdminInstitutesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Institutes" description="Manage institutes and barcodes." />
      <ComingSoon />
    </div>
  );
}
