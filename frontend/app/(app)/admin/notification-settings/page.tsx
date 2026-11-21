import { requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { NotificationSettingsTable } from "./_components/NotificationSettingsTable";
import { api } from "@/lib/api-server";
import type { ApiList, NotificationSetting } from "@/lib/types";

export const metadata = { title: "Notification Settings · LMS" };

export default async function NotificationSettingsPage() {
  const cookie = (await cookies()).toString();

  const viewer = await requireUser(cookie);
  if (viewer.role !== "SUPER_ADMIN") redirect("/dashboard");

  const settings = await api.get<ApiList<NotificationSetting>>("/notification-settings", { cookie });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notification settings"
        description="Turn in-app and SMS notifications on or off per scenario."
      />

      <NotificationSettingsTable settings={settings.data} />
    </div>
  );
}
