import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";

export default function PaymentsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Payments" description="Payment records and entrance collection." />
      <ComingSoon />
    </div>
  );
}
