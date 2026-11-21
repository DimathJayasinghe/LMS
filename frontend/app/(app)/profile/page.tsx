import { requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/custom/PageHeader";
import { ProfileClient } from "./_components/ProfileClient";

export default async function ProfilePage() {
  const cookie = (await cookies()).toString();

  const user = await requireUser(cookie);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Profile"
        description="Manage your photo, contact details, and sign-in credentials."
      />
      <ProfileClient user={user} />
    </div>
  );
}
