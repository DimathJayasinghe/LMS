import { requireUser } from "@/lib/session";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { navForRole } from "@/lib/nav";
import { formatRole } from "@/lib/utils";

// One-line descriptions for the dashboard quick links, keyed by route.
const DESCRIPTIONS: Record<string, string> = {
  "/classes": "Browse and manage classes.",
  "/timetable": "Your weekly schedule.",
  "/exams": "Sit exams and view results.",
  "/submissions": "Grade student submissions.",
  "/attendance": "Scan and review attendance.",
  "/payments": "Records and entrance collection.",
  "/admin/users": "Manage users and roles.",
  "/admin/subjects": "Manage subjects.",
  "/admin/institutes": "Manage institutes.",
};

export default async function DashboardPage() {
  const cookie = (await cookies()).toString();

  const user = await requireUser(cookie);

  const links = navForRole(user.role)
    .flatMap((section) => section.items)
    .filter((item) => item.href !== "/dashboard");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={`You're signed in as ${formatRole(user.role)}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-foreground/40 hover:shadow-md"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <item.icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1 font-medium text-foreground">
                {item.label}
                <ArrowRight
                  className="size-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100"
                  aria-hidden
                />
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {DESCRIPTIONS[item.href]}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
