import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { MarkingPanel } from "./MarkingPanel";
import type { ConsoleMarking, ConsoleMarkingExam } from "@/lib/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-server", () => ({ api: { get } }));
vi.mock("@/lib/session", () => ({ guard401: <T,>(p: Promise<T>) => p }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined, redirect: vi.fn() }));

const exam = (over: Partial<ConsoleMarkingExam> = {}): ConsoleMarkingExam => ({
  examId: "e1", title: "Term test", courseName: "Physics", type: "HYBRID", endedAt: "2026-11-19T10:00:00Z",
  submitted: 10, graded: 4, ungraded: 6, incomplete: 0, hall: 0, ...over,
});
const show = async (over: Partial<ConsoleMarking> = {}) => {
  get.mockResolvedValue({ status: "success", data: { lookbackDays: 30, total: 0, exams: [], ...over } });
  render(await MarkingPanel({ cookie: "cookie" }));
};

beforeEach(() => vi.clearAllMocks());

describe("MarkingPanel", () => {
  it("reads the console endpoint with the cookie", async () => {
    await show();
    expect(get).toHaveBeenCalledWith("/console/marking", expect.objectContaining({ cookie: "cookie" }));
  });

  it("says nothing is waiting, with zeros", async () => {
    await show();
    expect(screen.getByText("No exam is waiting for marks or publishing.")).toBeInTheDocument();
    expect(screen.getByText("Exams waiting").nextSibling).toHaveTextContent("0");
    expect(screen.getByText("Papers to mark").nextSibling).toHaveTextContent("0");
  });

  it("names the lookback it covers", async () => {
    await show({ lookbackDays: 1 });
    expect(screen.getByText(/in the last 1 day and/)).toBeInTheDocument();
  });

  it("shows each exam's marked and unmarked counts and the totals", async () => {
    await show({ total: 2, exams: [exam(), exam({ examId: "e2", title: "Quiz", courseName: "Chemistry", submitted: 5, graded: 5, ungraded: 0 })] });
    expect(screen.getByText("Papers to mark").nextSibling).toHaveTextContent("6");
    expect(screen.getByText("6 to mark")).toBeInTheDocument();
    expect(screen.getByText("4 marked")).toBeInTheDocument();
    expect(screen.getByText("0 to mark")).not.toHaveClass("text-destructive");
    expect(screen.getByText("6 to mark")).toHaveClass("text-destructive");
    expect(screen.getByText(/Term test/)).toBeInTheDocument();
  });

  it("mentions unfinished uploads and hall entries only when there are some", async () => {
    await show({ total: 2, exams: [exam({ incomplete: 1, hall: 7 }), exam({ examId: "e2", title: "Quiz" })] });
    expect(screen.getByText(/1 upload unfinished/)).toBeInTheDocument();
    expect(screen.getByText(/7 entered from the hall/)).toBeInTheDocument();
    expect(screen.getAllByText(/unfinished/)).toHaveLength(1);
  });

  it("marks the count as partial and says how many are shown when more exams wait", async () => {
    await show({ total: 37, exams: [exam()] });
    expect(screen.getByText("Papers to mark").nextSibling).toHaveTextContent("6+");
    expect(screen.getByText("Showing the newest 1 of 37.")).toBeInTheDocument();
  });

  it("links to the exams", async () => {
    await show();
    expect(screen.getByRole("link", { name: "Open exams" })).toHaveAttribute("href", "/exams");
  });

  it("shows only its own error when the read fails", async () => {
    get.mockRejectedValue(new ApiError(500, "boom"));
    render(await MarkingPanel({ cookie: "cookie" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This panel could not be loaded");
    expect(screen.queryByText("Exams waiting")).not.toBeInTheDocument();
  });
});
