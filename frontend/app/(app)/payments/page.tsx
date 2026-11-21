import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { StudentPayments } from "./_components/StudentPayments";
import { AdminPayments } from "./_components/AdminPayments";
import { api } from "@/lib/api";
import { currentPaymentMonth } from "@/lib/payhere";
import type {
  ApiList,
  ApiSuccess,
  Enrollment,
  Payment,
  PaymentStatus,
  PaymentSummary,
  User,
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

  let viewer: User;
  try {
    viewer = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }

  // ── Student view ─────────────────────────────────────────
  if (viewer.role === "STUDENT") {
    const [enrollments, payments] = await Promise.all([
      api
        .get<ApiList<Enrollment>>("/enrollments/my", { cookie })
        .then((r) => r.data)
        .catch(() => [] as Enrollment[]),
      api
        .get<ApiList<Payment>>("/payments/my", { cookie })
        .then((r) => r.data)
        .catch(() => [] as Payment[]),
    ]);

    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Payments" description="Pay your monthly fees and review your history." />
        <StudentPayments
          enrollments={enrollments.filter((e) => e.isActive)}
          payments={payments}
          currentMonth={currentPaymentMonth()}
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
  const month = MONTH_RE.test(sp.month ?? "") ? (sp.month as string) : currentPaymentMonth();

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (status) query.set("status", status);
  query.set("paymentMonth", month);

  const [list, summary] = await Promise.all([
    api
      .get<ApiList<Payment>>(`/payments?${query.toString()}`, { cookie })
      .catch(() => ({ data: [] as Payment[], count: 0 }) as ApiList<Payment>),
    api
      .get<ApiSuccess<PaymentSummary>>(`/payments/summary?month=${month}`, { cookie })
      .then((r) => r.data)
      .catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Payments" description="Payment records, collection, and bulk upload." />
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
      />
    </div>
  );
}
