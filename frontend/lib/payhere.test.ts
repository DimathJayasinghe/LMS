import { describe, it, expect, vi, afterEach } from "vitest";
import { startPayherePayment } from "./payhere";

afterEach(() => {
  delete (window as unknown as { payhere?: unknown }).payhere;
  vi.restoreAllMocks();
});

function setSdk(startPayment = vi.fn()) {
  (window as unknown as { payhere: unknown }).payhere = { startPayment };
  return startPayment;
}

describe("startPayherePayment", () => {
  it("opens the onsite popup with the payload + sandbox=true for a sandbox host", () => {
    const startPayment = setSdk();
    startPayherePayment(
      {
        checkoutUrl: "https://sandbox.payhere.lk/pay/checkout",
        payload: { merchant_id: "1235858", order_id: "o1" },
      },
      {},
    );
    expect(startPayment).toHaveBeenCalledWith({
      merchant_id: "1235858",
      order_id: "o1",
      sandbox: true,
    });
  });

  it("marks sandbox=false for a live checkout host", () => {
    const startPayment = setSdk();
    startPayherePayment({ checkoutUrl: "https://www.payhere.lk/pay/checkout", payload: {} }, {});
    expect(startPayment).toHaveBeenCalledWith({ sandbox: false });
  });

  it("wires the completion/dismiss/error handlers onto the SDK", () => {
    const startPayment = setSdk();
    const onCompleted = vi.fn();
    startPayherePayment(
      { checkoutUrl: "https://sandbox.payhere.lk/x", payload: {} },
      { onCompleted },
    );
    const sdk = (window as unknown as { payhere: { onCompleted: (id: string) => void } }).payhere;
    sdk.onCompleted("order-9");
    expect(onCompleted).toHaveBeenCalledWith("order-9");
    expect(startPayment).toHaveBeenCalled();
  });

  it("falls back to a form POST when payhere.js has not loaded", () => {
    // no window.payhere set
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    startPayherePayment(
      { checkoutUrl: "https://sandbox.payhere.lk/pay/checkout", payload: { order_id: "o1" } },
      {},
    );
    expect(submit).toHaveBeenCalled();
  });
});
