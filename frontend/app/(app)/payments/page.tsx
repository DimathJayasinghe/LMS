import { guard401, requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { StudentPayments } from "./_components/StudentPayments";
import { AdminPayments } from "./_components/AdminPayments";
import { api } from "@/lib/api-server";
import { currentPaymentMonth } from "@/lib/payhere";
import { dayInTimezone, summarizeCash, type CashSummary } from "@/lib/cash";
import type {
  ApiList,
  ApiSuccess,
  CashList,
  Enrollment,
  Institute,
  Payment,
  PaymentStatus,
  PaymentSummary,
} from "@/lib/types";

export const metadata = { title: "Payments · LMS" };

const PAGE_SIZE = 20;
const STATUSES: PaymentStatus[] = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"];
const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; month?: string; page?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const sp = await searchParams;

  const viewer = await requireUser(cookie);
  const timezone = viewer.organization?.timezone ?? "Asia/Colombo";

  // ── Student view ─────────────────────────────────────────
  if (viewer.role === "STUDENT") {
    const [enrollments, payments] = await Promise.all([
      guard401(api
        .get<ApiList<Enrollment>>("/enrollments/my", { cookie }))
        .then((r) => r.data)
        .catch((error) => { unstable_rethrow(error); return [] as Enrollment[]; }),
      guard401(api
        .get<ApiList<Payment>>("/payments/my", { cookie }))
        .then((r) => r.data)
        .catch((error) => { unstable_rethrow(error); return [] as Payment[]; }),
    ]);

    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Payments" description="Pay your monthly fees and review your history." />
        <StudentPayments
          enrollments={enrollments.filter((e) => e.isActive)}
          payments={payments}
          currentMonth={currentPaymentMonth(timezone)}
        />
      </div>
    );
  }

  // ── Admin / front-desk view ──────────────────────────────
  if (viewer.role !== "SUPER_ADMIN" && viewer.role !== "ADMIN") redirect("/dashboard");

  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUSES.includes(sp.status as PaymentStatus)
    ? (sp.status as PaymentStatus)
    : undefined;
  const month = MONTH_RE.test(sp.month ?? "") ? (sp.month as string) : currentPaymentMonth(timezone);

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (status) query.set("status", status);
  query.set("paymentMonth", month);

  // The desk's own cash for today, for the strip above the collect form. A failure only hides the strip.
  const today = dayInTimezone(timezone);
  const [list, summary, cash, institutes] = await Promise.all([
    guard401(api
      .get<ApiList<Payment>>(`/payments?${query.toString()}`, { cookie }))
      .catch((error) => { unstable_rethrow(error); return ({ data: [] as Payment[], count: 0 }) as ApiList<Payment>; }),
    guard401(api
      .get<ApiSuccess<PaymentSummary>>(`/payments/summary?month=${month}`, { cookie }))
      .then((r) => r.data)
      .catch((error) => { unstable_rethrow(error); return null; }),
    guard401(api
      .get<CashList>(`/payments/cash?from=${today}&to=${today}&collectorId=${viewer.id}`, { cookie }))
      .catch((error) => { unstable_rethrow(error); return null; }),
    guard401(api
      .get<ApiList<Institute>>("/institutes", { cookie }))
      .then((r) => r.data)
      .catch((error) => { unstable_rethrow(error); return [] as Institute[]; }),
  ]);
  const todaysCash: CashSummary | null = cash?.tallyEnabled ? summarizeCash(cash.data) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Payments" description={viewer.role === "SUPER_ADMIN" ? "Payment records, collection, and bulk upload." : "Payment records and collection."} />
      <AdminPayments
        payments={list.data}
        total={list.count ?? 0}
        pageSize={PAGE_SIZE}
        page={page}
        month={month}
        status={status ?? "all"}
        statuses={STATUSES}
        summary={summary}
        canOverride={viewer.role === "SUPER_ADMIN"}
        canBulkUpload={viewer.role === "SUPER_ADMIN"}
        timezone={timezone}
        institutes={institutes.map((i) => ({ id: i.id, name: i.name }))}
        todaysCash={todaysCash}
      />
    </div>
  );
}
