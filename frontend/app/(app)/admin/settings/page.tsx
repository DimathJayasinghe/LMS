import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { api } from "@/lib/api-server";
import { guard401, requireUser } from "@/lib/session";
import type { ApiList } from "@/lib/types";
import { SettingsForm, type Setting } from "./_components/SettingsForm";

export const metadata = { title: "Access rules and fees · LMS" };
export default async function SettingsPage() {
  const cookie = (await cookies()).toString();
  const viewer = await requireUser(cookie);
  if (viewer.role !== "SUPER_ADMIN") redirect("/dashboard");
  let settings: Setting[];
  try { settings = (await guard401(api.get<ApiList<Setting>>("/settings", { cookie }))).data; }
  catch (error) { unstable_rethrow(error); return <p>Could not load settings. Please try again.</p>; }
  return <main className="mx-auto max-w-3xl"><PageHeader title="Access rules and fees" description="Changes apply to future decisions; some options take effect when their related features become available." /><SettingsForm settings={settings} /></main>;
}
