import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { SetupPanel } from "./SetupPanel";
import type { ConsoleSetup } from "@/lib/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-server", () => ({ api: { get } }));
vi.mock("@/lib/session", () => ({ guard401: <T,>(p: Promise<T>) => p }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined, redirect: vi.fn() }));

const clear: ConsoleSetup = { orphanedClasses: { count: 0, rows: [] }, oldBatches: { count: 0, rows: [] }, studentsWithoutPhone: 0 };
const show = async (over: Partial<ConsoleSetup> = {}) => {
  get.mockResolvedValue({ status: "success", data: { ...clear, ...over } });
  render(await SetupPanel({ cookie: "cookie" }));
};

beforeEach(() => vi.clearAllMocks());

describe("SetupPanel", () => {
  it("reads the console endpoint with the cookie", async () => {
    await show();
    expect(get).toHaveBeenCalledWith("/console/setup", expect.objectContaining({ cookie: "cookie" }));
  });

  it("says nothing needs fixing, with zeros and no lists", async () => {
    await show();
    expect(screen.getByText("Nothing needs fixing.")).toBeInTheDocument();
    expect(screen.getByText("Classes without a teacher").nextSibling).toHaveTextContent("0");
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("lists a class whose teacher is deactivated, with the teacher's name", async () => {
    await show({ orphanedClasses: { count: 1, rows: [{ courseId: "c1", name: "Physics 2026", year: 2026, teacherName: "Ms Perera" }] } });
    expect(screen.getByRole("heading", { name: "Teacher deactivated, class still active" })).toBeInTheDocument();
    expect(screen.getByText("Physics 2026")).toBeInTheDocument();
    expect(screen.getByText("Teacher: Ms Perera")).toBeInTheDocument();
    expect(screen.getByText("Classes without a teacher").nextSibling).toHaveTextContent("1");
    expect(screen.queryByText("Nothing needs fixing.")).not.toBeInTheDocument();
  });

  it("lists batches from an earlier year and says how many more there are", async () => {
    await show({ oldBatches: { count: 12, rows: [{ courseId: "c2", name: "Chemistry 2025", year: 2025, teacherName: "Mr Silva" }] } });
    expect(screen.getByRole("heading", { name: "From an earlier year, still active" })).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.getByText("and 11 more")).toBeInTheDocument();
    expect(screen.getByText("Batches to end").nextSibling).toHaveTextContent("12");
  });

  it("explains the students without a phone", async () => {
    await show({ studentsWithoutPhone: 1 });
    expect(screen.getByText("1 active student cannot be sent an SMS because there is no phone number on file.")).toBeInTheDocument();
    await show({ studentsWithoutPhone: 5 });
    expect(screen.getByText(/5 active students cannot be sent an SMS/)).toBeInTheDocument();
  });

  it("shows only its own error when the read fails", async () => {
    get.mockRejectedValue(new ApiError(500, "boom"));
    render(await SetupPanel({ cookie: "cookie" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This panel could not be loaded");
    expect(screen.queryByText("Batches to end")).not.toBeInTheDocument();
  });
});
