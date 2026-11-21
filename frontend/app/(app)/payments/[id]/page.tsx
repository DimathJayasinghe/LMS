import { unstable_rethrow } from "next/navigation";
import { guard401 } from "@/lib/session";
import { cookies } from "next/headers";
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
    payment = (await guard401(api.get<ApiSuccess<Payment>>(`/payments/${id}`, { cookie }))).data;
  } catch (e) {
    unstable_rethrow(e);
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
