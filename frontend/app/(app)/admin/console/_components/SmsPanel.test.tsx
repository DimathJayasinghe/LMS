import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { SmsPanel } from "./SmsPanel";
import type { ConsoleSms } from "@/lib/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-server", () => ({ api: { get } }));
vi.mock("@/lib/session", () => ({ guard401: <T,>(p: Promise<T>) => p }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined, redirect: vi.fn() }));

const empty: ConsoleSms = { week: { from: "2026-11-14", sent: 0, failed: 0, pending: 0 }, month: { month: "2026-11", sent: 0, failed: 0, pending: 0 }, failures: [] };
const show = async (over: Partial<ConsoleSms> = {}) => {
  get.mockResolvedValue({ status: "success", data: { ...empty, ...over } });
  render(await SmsPanel({ cookie: "cookie" }));
};

beforeEach(() => vi.clearAllMocks());

describe("SmsPanel", () => {
  it("reads the console endpoint with the cookie", async () => {
    await show();
    expect(get).toHaveBeenCalledWith("/console/sms", expect.objectContaining({ cookie: "cookie" }));
  });

  it("shows zeros and says no message has failed on an empty log", async () => {
    await show();
    expect(screen.getByText("Sent, 7 days").nextSibling).toHaveTextContent("0");
    expect(screen.getByText("No message has failed.")).toBeInTheDocument();
    expect(screen.getByText(/since 2026-11-14/)).toHaveTextContent("November 2026");
    expect(screen.queryByText(/Still waiting to be sent/)).not.toBeInTheDocument();
  });

  it("shows the counts for the week and the month, flagging failures", async () => {
    await show({ week: { from: "2026-11-14", sent: 40, failed: 3, pending: 0 }, month: { month: "2026-11", sent: 120, failed: 9, pending: 0 } });
    expect(screen.getByText("Sent, 7 days").nextSibling).toHaveTextContent("40");
    expect(screen.getByText("Failed, 7 days").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("Failed, 7 days").nextSibling).toHaveClass("text-destructive");
    expect(screen.getByText("Sent, month").nextSibling).toHaveTextContent("120");
    expect(screen.getByText("Failed, month").nextSibling).toHaveTextContent("9");
  });

  it("mentions messages still waiting to be sent", async () => {
    await show({ week: { from: "2026-11-14", sent: 1, failed: 0, pending: 2 }, month: { month: "2026-11", sent: 1, failed: 0, pending: 2 } });
    expect(screen.getByText("Still waiting to be sent: 2 in the last 7 days, 2 this month.")).toBeInTheDocument();
  });

  it("lists the latest failures with the masked number and the reason, and no message text", async () => {
    await show({
      failures: [
        { id: "l1", at: "2026-11-19T08:00:00Z", phone: "*******567", reason: "Insufficient balance" },
        { id: "l2", at: "2026-11-19T09:00:00Z", phone: "*********567", reason: null },
      ],
    });
    expect(screen.getByText("*******567")).toBeInTheDocument();
    expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
    expect(screen.getByText("No reason given")).toBeInTheDocument();
    expect(screen.queryByText("No message has failed.")).not.toBeInTheDocument();
  });

  it("shows only its own error when the read fails", async () => {
    get.mockRejectedValue(new ApiError(500, "boom"));
    render(await SmsPanel({ cookie: "cookie" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This panel could not be loaded");
    expect(screen.queryByText("Latest failures")).not.toBeInTheDocument();
  });
});
