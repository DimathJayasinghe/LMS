import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { MonthPicker } from "./_components/MonthPicker";
import { CourseBreakdownChart, MethodDonut, RevenueTrendChart } from "./_components/ReportCharts";
import { api } from "@/lib/api";
import { formatLkr, monthLabel, METHOD_LABELS } from "@/lib/reports";
import type { ApiSuccess, FinancialReport, User } from "@/lib/types";

export const metadata = { title: "Financial reports · LMS" };

/** Current payment month (YYYY-MM) — matches the backend's default window. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const sp = await searchParams;

  let viewer: User;
  try {
    viewer = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }
  // Financial totals across every course/student — super-admin only. Front-desk
  // ADMIN is bounced here and again by the backend (requireRole SUPER_ADMIN).
  if (viewer.role !== "SUPER_ADMIN") redirect("/dashboard");

  const qs = sp.month ? `?month=${encodeURIComponent(sp.month)}` : "";
  const report = (await api.get<ApiSuccess<FinancialReport>>(`/payments/reports${qs}`, { cookie }))
    .data;

  const thisMonth = report.trend.at(-1);
  const collected = thisMonth?.collected ?? "0";
  const paidCount = thisMonth?.paidCount ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Financial reports"
        description="Revenue trends, course and method breakdowns, and outstanding fees."
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{monthLabel(report.month)}</span>
        </p>
        <MonthPicker month={report.month} current={currentMonth()} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Collected this month"
          value={formatLkr(collected)}
          hint={`${paidCount} payment${paidCount === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Outstanding this month"
          value={formatLkr(report.outstanding.expected)}
          hint={`${report.outstanding.count} enrolment${
            report.outstanding.count === 1 ? "" : "s"
          } unpaid`}
        />
        <StatTile
          label="Courses earning"
          value={String(report.byCourse.length)}
          hint="with at least one payment"
        />
      </div>

      <div className="space-y-4">
        <ChartCard
          title="Revenue trend"
          description="Successful collections per month, last 12 months."
        >
          <RevenueTrendChart trend={report.trend} />
        </ChartCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="By course" description="Collected this month, per course.">
            <CourseBreakdownChart byCourse={report.byCourse} />
          </ChartCard>
          <ChartCard title="By payment method" description="How this month's fees were paid.">
            <MethodDonut byMethod={report.byMethod} />
          </ChartCard>
        </div>
      </div>

      {/* Accessible, print- and CVD-safe fallback for every chart above. */}
      <details className="mt-6 rounded-2xl border border-border bg-card p-5">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          View as table
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-foreground">By course</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">Course</th>
                  <th className="py-1 pr-4 font-medium">Payments</th>
                  <th className="py-1 text-right font-medium">Collected</th>
                </tr>
              </thead>
              <tbody>
                {report.byCourse.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-2 text-muted-foreground">
                      No course revenue this month.
                    </td>
                  </tr>
                ) : (
                  report.byCourse.map((c) => (
                    <tr key={c.courseId} className="border-t border-border">
                      <td className="py-1 pr-4 text-foreground">
                        {c.name} · {c.year}
                      </td>
                      <td className="py-1 pr-4 tabular-nums text-muted-foreground">{c.paidCount}</td>
                      <td className="py-1 text-right tabular-nums text-foreground">
                        {formatLkr(c.collected)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-foreground">By payment method</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">Method</th>
                  <th className="py-1 pr-4 font-medium">Payments</th>
                  <th className="py-1 text-right font-medium">Collected</th>
                </tr>
              </thead>
              <tbody>
                {report.byMethod.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-2 text-muted-foreground">
                      No payments this month.
                    </td>
                  </tr>
                ) : (
                  report.byMethod.map((m) => (
                    <tr key={m.method} className="border-t border-border">
                      <td className="py-1 pr-4 text-foreground">{METHOD_LABELS[m.method]}</td>
                      <td className="py-1 pr-4 tabular-nums text-muted-foreground">{m.paidCount}</td>
                      <td className="py-1 text-right tabular-nums text-foreground">
                        {formatLkr(m.collected)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
