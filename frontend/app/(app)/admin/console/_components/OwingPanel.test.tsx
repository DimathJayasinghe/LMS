import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { OwingPanel } from "./OwingPanel";
import type { ConsoleOwing } from "@/lib/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-server", () => ({ api: { get } }));
vi.mock("@/lib/session", () => ({ guard401: <T,>(p: Promise<T>) => p }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined, redirect: vi.fn() }));

const panel = (over: Partial<ConsoleOwing> = {}): ConsoleOwing => ({ month: "2026-11", students: 0, amount: "0.00", courses: [], otherCourses: 0, ...over });
const show = async (over: Partial<ConsoleOwing> = {}) => {
  get.mockResolvedValue({ status: "success", data: panel(over) });
  render(await OwingPanel({ cookie: "cookie" }));
};

beforeEach(() => vi.clearAllMocks());

describe("OwingPanel", () => {
  it("reads the console endpoint with the cookie", async () => {
    await show();
    expect(get).toHaveBeenCalledWith("/console/owing", expect.objectContaining({ cookie: "cookie" }));
  });

  it("says nobody owes, with zeros, when the month is clear", async () => {
    await show();
    expect(screen.getByText("Nobody owes a fee for November 2026.")).toBeInTheDocument();
    expect(screen.getByText("Students owing").nextSibling).toHaveTextContent("0");
    expect(screen.getByText("Amount owed").nextSibling).toHaveTextContent("Rs 0");
  });

  it("shows the totals, the classes owed the most, and how many more there are", async () => {
    await show({
      students: 13, amount: "17900.75", otherCourses: 2,
      courses: [{ courseId: "c4", name: "Biology", count: 4, expected: "8000.00" }, { courseId: "c1", name: "Physics", count: 1, expected: "1500.00" }],
    });
    expect(screen.getByText("Students owing").nextSibling).toHaveTextContent("13");
    expect(screen.getByText("Amount owed").nextSibling).toHaveTextContent("Rs 17,900.75");
    expect(screen.getByText(/Biology/)).toBeInTheDocument();
    expect(screen.getByText("4 students")).toBeInTheDocument();
    expect(screen.getByText("1 student")).toBeInTheDocument();
    expect(screen.getByText("and 2 more classes")).toBeInTheDocument();
  });

  it("uses the singular for one more class", async () => {
    await show({ students: 6, amount: "100.00", otherCourses: 1, courses: [{ courseId: "c1", name: "Physics", count: 6, expected: "100.00" }] });
    expect(screen.getByText("and 1 more class")).toBeInTheDocument();
  });

  it("links to the full who-owes list for the same month", async () => {
    await show({ month: "2026-10" });
    expect(screen.getByRole("link", { name: "See the full list" })).toHaveAttribute("href", "/payments/owing?month=2026-10");
  });

  it("shows its own error when the read fails", async () => {
    get.mockRejectedValue(new ApiError(500, "boom"));
    render(await OwingPanel({ cookie: "cookie" }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
