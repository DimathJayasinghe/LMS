import { PageHeader } from "@/components/custom/PageHeader";
import { ComingSoon } from "@/components/custom/ComingSoon";

export default function AdminUsersPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Users" description="Manage users and roles." />
      <ComingSoon />
    </div>
  );
}
