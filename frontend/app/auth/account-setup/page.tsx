import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountSetupForm } from "./_components/AccountSetupForm";
import { api } from "@/lib/api";
import type { ApiList, ApiSuccess, Institute, StudentBarcode, User } from "@/lib/types";

export default async function AccountSetupPage() {
  const cookie = (await cookies()).toString();

  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }

  // Setup is a student-only onboarding step — everyone else has nothing to do here.
  if (user.role !== "STUDENT") {
    redirect("/dashboard");
  }

  const [institutes, barcodes] = await Promise.all([
    api.get<ApiList<Institute>>("/institutes", { cookie }).then((r) => r.data),
    api.get<ApiList<StudentBarcode>>("/users/me/institute-barcodes", { cookie }).then((r) => r.data),
  ]);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Account setup</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        A quick, one-time step before you can access classes and content.
      </p>

      <AccountSetupForm
        institutes={institutes}
        initialBarcodes={barcodes}
        initialSetupCompleted={Boolean(user.setupCompleted)}
        initialNicFrontUploaded={Boolean(user.nicFrontUploaded)}
        initialNicBackUploaded={Boolean(user.nicBackUploaded)}
      />
    </div>
  );
}
