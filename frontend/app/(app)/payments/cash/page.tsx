import { guard401, requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/custom/PageHeader";
import { CashTally } from "../_components/CashTally";
import { api } from "@/lib/api-server";
import { dayInTimezone } from "@/lib/cash";
import type { ApiList, CashList, Institute } from "@/lib/types";

export const metadata = { title: "Cash · LMS" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; instituteId?: string; review?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const sp = await searchParams;

  const viewer = await requireUser(cookie);
  if (viewer.role !== "SUPER_ADMIN" && viewer.role !== "ADMIN") redirect("/dashboard");
  const isOwner = viewer.role === "SUPER_ADMIN";

  const query = new URLSearchParams();
  if (DAY_RE.test(sp.from ?? "")) query.set("from", sp.from as string);
  if (DAY_RE.test(sp.to ?? "")) query.set("to", sp.to as string);
  const instituteId = UUID_RE.test(sp.instituteId ?? "") ? sp.instituteId : undefined;
  if (instituteId) query.set("instituteId", instituteId);
  // Only the owner has a review queue; for front desk the flag is ignored.
  const review = isOwner && sp.review === "1";
  if (review) query.set("unreconciled", "true");

  const qs = query.toString();
  const empty: CashList = { status: "success", data: [], count: 0, from: sp.from ?? "", to: sp.to ?? "", tallyEnabled: true };
  const [list, institutes] = await Promise.all([
    guard401(api.get<CashList>(`/payments/${review ? "cash-tally" : "cash"}${qs ? `?${qs}` : ""}`, { cookie }))
      .catch((error) => { unstable_rethrow(error); return empty; }),
    guard401(api.get<ApiList<Institute>>("/institutes", { cookie }))
      .then((r) => r.data)
      .catch((error) => { unstable_rethrow(error); return [] as Institute[]; }),
  ]);
  const today = dayInTimezone(viewer.organization?.timezone ?? "Asia/Colombo");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Cash"
        description={isOwner ? "Cash taken at the desk each day, what each collector counted, and the difference." : "The cash you took each day. Count it at the end of the day."}
        action={<Link href="/payments" className="text-sm text-muted-foreground underline-offset-2 hover:underline">Back to payments</Link>}
      />
      <CashTally
        rows={list.data}
        from={list.from || today}
        to={list.to || today}
        tallyEnabled={list.tallyEnabled}
        viewerId={viewer.id}
        isOwner={isOwner}
        institutes={institutes.map((i) => ({ id: i.id, name: i.name }))}
        instituteId={instituteId}
        review={review}
      />
    </div>
  );
}
