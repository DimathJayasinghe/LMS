import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import type { ApiSuccess, Payment } from "@/lib/types";
import { PaymentReceipt } from "../_components/PaymentReceipt";

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookie = (await cookies()).toString();

  let payment: Payment;
  try {
    payment = (await api.get<ApiSuccess<Payment>>(`/payments/${id}`, { cookie })).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/auth/login");
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {e instanceof ApiError ? e.message : "This receipt could not be found."}
        </p>
      </div>
    );
  }

  return <PaymentReceipt payment={payment} />;
}
