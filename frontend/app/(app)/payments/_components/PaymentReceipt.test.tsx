import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentReceipt } from "./PaymentReceipt";
import type { Payment } from "@/lib/types";

const base: Payment = {
  id: "pay-123",
  amount: "2500.00",
  status: "SUCCESS",
  method: "ONLINE",
  payhereId: "payhere_abc",
  paymentMonth: "2026-07",
  createdAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "",
  enrollment: {
    id: "e1",
    classType: "PHYSICAL",
    userId: "u1",
    user: { id: "u1", name: "Nimal Perera", email: "n@x.lk", indexNumber: 42 },
    course: { id: "c1", name: "Physics", year: 2026, monthlyFee: "2500.00" },
  },
};

describe("PaymentReceipt", () => {
  it("shows the PayHere reference for an ONLINE payment, no collected-by/institute", () => {
    render(<PaymentReceipt payment={base} />);
    expect(screen.getByText("payhere_abc")).toBeInTheDocument();
    expect(screen.queryByText("Collected by")).not.toBeInTheDocument();
    expect(screen.queryByText("Center")).not.toBeInTheDocument();
  });

  it("shows collected-by, institute, and barcode for an ENTRANCE payment", () => {
    const entrance: Payment = {
      ...base,
      method: "ENTRANCE",
      payhereId: null,
      collectedBy: { id: "staff-1", name: "Front Desk" },
      collectedAtInstitute: { id: "inst-1", name: "Nugegoda Center", code: "NUG" },
      collectedViaBarcode: "NUG-001",
    };
    render(<PaymentReceipt payment={entrance} />);
    expect(screen.getByText("Front Desk")).toBeInTheDocument();
    expect(screen.getByText(/Nugegoda Center/)).toBeInTheDocument();
    expect(screen.getByText("NUG-001")).toBeInTheDocument();
    expect(screen.queryByText("payhere_abc")).not.toBeInTheDocument();
  });

  it("renders the receipt reference under the QR", () => {
    render(<PaymentReceipt payment={base} />);
    expect(screen.getByText("pay-123")).toBeInTheDocument();
  });
});
