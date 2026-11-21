import { guard401, requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/custom/PageHeader";
import { OutstandingTable } from "../_components/OutstandingTable";
import { api } from "@/lib/api-server";
import { currentPaymentMonth } from "@/lib/payhere";
import type { ApiList, Course, OutstandingRow } from "@/lib/types";

export const metadata = { title: "Who owes · LMS" };

const PAGE_SIZE = 50;
const MONTH_RE = /^\d{4}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OutstandingList = ApiList<OutstandingRow> & { month?: string };

export default async function OwingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; courseId?: string; page?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const sp = await searchParams;

  const viewer = await requireUser(cookie);
  if (viewer.role !== "SUPER_ADMIN" && viewer.role !== "ADMIN") redirect("/dashboard");
  const timezone = viewer.organization?.timezone ?? "Asia/Colombo";

  const page = Math.max(1, Number(sp.page) || 1);
  const month = MONTH_RE.test(sp.month ?? "") ? (sp.month as string) : undefined;
  const courseId = UUID_RE.test(sp.courseId ?? "") ? sp.courseId : undefined;

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (month) query.set("month", month);
  if (courseId) query.set("courseId", courseId);

  const [list, courses] = await Promise.all([
    guard401(api.get<OutstandingList>(`/payments/outstanding?${query.toString()}`, { cookie }))
      .catch((error) => { unstable_rethrow(error); return { status: "success", data: [], count: 0 } as OutstandingList; }),
    guard401(api.get<ApiList<Course>>("/classes", { cookie }))
      .then((r) => r.data)
      .catch((error) => { unstable_rethrow(error); return [] as Course[]; }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Who owes"
        description="Students with no paid fee for the month. Reminders start after the grace days."
        action={<Link href="/payments" className="text-sm text-muted-foreground underline-offset-2 hover:underline">Back to payments</Link>}
      />
      <OutstandingTable
        rows={list.data}
        total={list.count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        month={list.month ?? month ?? currentPaymentMonth(timezone)}
        courseId={courseId}
        courses={courses.map((c) => ({ id: c.id, name: c.name, year: c.year }))}
        canExport={viewer.role === "SUPER_ADMIN"}
      />
    </div>
  );
}
