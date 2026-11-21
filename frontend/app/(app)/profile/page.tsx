import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { api } from "@/lib/api";
import type { ApiSuccess, User } from "@/lib/types";
import { ProfileClient } from "./_components/ProfileClient";

export default async function ProfilePage() {
  const cookie = (await cookies()).toString();

  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }

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
