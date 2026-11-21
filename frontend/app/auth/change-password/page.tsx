import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ForcedPasswordChangeForm } from "./_components/ForcedPasswordChangeForm";

export const metadata = { title: "Choose a new password · LMS" };

export default async function ChangePasswordPage() {
  const cookie = (await cookies()).toString();
  const user = await requireUser(cookie);

  // Only a user whose password was reset by staff belongs here; everyone else changes it from their profile.
  if (!user.mustChangePassword) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">
        Your password was reset by our staff. Enter the temporary password you were given, then choose your own.
      </p>
      <ForcedPasswordChangeForm />
    </main>
  );
}
