import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HallMarksEntry } from "./HallMarksEntry";
import { ApiError } from "@/lib/api";
import type { HallMarksResult } from "@/lib/types";

const { put, refresh } = vi.hoisted(() => ({ put: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { put } };
});

const result = (over: Partial<HallMarksResult> = {}): { data: HallMarksResult } => ({
  data: {
    dryRun: true,
    applied: false,
    counts: { total: 2, changed: 2, unchanged: 0, rejected: 0 },
    rows: [
      { line: 1, indexNumber: 101, marks: 78, status: "WILL_CHANGE", before: null, after: 78, name: "Nimal" },
      { line: 2, indexNumber: 102, marks: 64, status: "WILL_CHANGE", before: 60, after: 64, name: "Kamal" },
    ],
    ...over,
  },
});
const withProblem = () =>
  result({
    counts: { total: 2, changed: 1, unchanged: 0, rejected: 1 },
    rows: [
      { line: 1, indexNumber: 101, marks: 78, status: "WILL_CHANGE", before: null, after: 78 },
      { line: 2, indexNumber: 999, marks: 64, status: "UNKNOWN_INDEX" },
    ],
  });

const setup = () => {
  const user = userEvent.setup();
  render(<HallMarksEntry examId="exam-1" totalMarks={100} />);
  return user;
};
// userEvent treats "{" as a key sequence, so lines are entered with a real newline through paste.
const fill = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
  await user.click(screen.getByLabelText("Index numbers and marks"));
  await user.paste(value);
};
const check = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Check marks" }));

beforeEach(() => {
  vi.clearAllMocks();
  put.mockResolvedValue(result());
});

describe("HallMarksEntry", () => {
  it("starts with nothing to check or save", () => {
    setup();
    expect(screen.getByRole("button", { name: "Check marks" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText(/out of 100/)).toBeInTheDocument();
  });

  it("points at a bad line and sends nothing", async () => {
    const user = setup();
    await fill(user, "101 78\nabc 5\n102 64.5");
    await check(user);
    expect(screen.getByRole("alert")).toHaveTextContent("Line 2 (abc 5)");
    expect(screen.getByRole("alert")).toHaveTextContent("Line 3 (102 64.5)");
    expect(put).not.toHaveBeenCalled();
  });

  it("checks with a dry run and shows the rows with names, counts and the change", async () => {
    const user = setup();
    await fill(user, "101 78\n102 64");
    await check(user);
    await screen.findByText("Nimal");
    expect(put).toHaveBeenCalledWith(
      "/exams/exam-1/hall-marks",
      { rows: [{ indexNumber: 101, marks: 78 }, { indexNumber: 102, marks: 64 }], dryRun: true },
      { headers: { "Idempotency-Key": expect.stringMatching(/^[0-9a-f-]{36}$/) } },
    );
    expect(screen.getByText("Changes 60 to 64.")).toBeInTheDocument();
    expect(screen.getByText(/2 rows: 2 to save, 0 unchanged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save 2 marks" })).toBeEnabled();
  });

  it("uses a new Idempotency-Key for every request", async () => {
    const user = setup();
    await fill(user, "101 78");
    await check(user);
    await check(user);
    const keys = put.mock.calls.map((call) => call[2].headers["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("does not offer Save while a row has a problem, and says what to fix", async () => {
    put.mockResolvedValue(withProblem());
    const user = setup();
    await fill(user, "101 78\n999 64");
    await check(user);
    await screen.findByText(/No student with this index number/);
    expect(screen.getByText(/1 to fix/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  it("does not offer Save when nothing would change", async () => {
    put.mockResolvedValue(result({ counts: { total: 1, changed: 0, unchanged: 1, rejected: 0 }, rows: [{ line: 1, indexNumber: 101, marks: 78, status: "OK", before: 78, after: 78 }] }));
    const user = setup();
    await fill(user, "101 78");
    await check(user);
    await screen.findByText("Already saved with these marks.");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks for a new check after the list is edited, and disables Save until then", async () => {
    const user = setup();
    await fill(user, "101 78");
    await check(user);
    await screen.findByRole("button", { name: "Save 2 marks" });
    await user.type(screen.getByLabelText("Index numbers and marks"), "9");
    expect(screen.getByText(/The list changed after this check/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  it("saves with a real run, clears the list and refreshes the page", async () => {
    const user = setup();
    await fill(user, "101 78\n102 64");
    await check(user);
    put.mockResolvedValue(result({ dryRun: false, applied: true }));
    await user.click(await screen.findByRole("button", { name: "Save 2 marks" }));
    await screen.findByText("Saved 2 marks.");
    expect(put.mock.calls[1]![1]).toMatchObject({ dryRun: false });
    expect(screen.getByLabelText("Index numbers and marks")).toHaveValue("");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("tells the user nothing was saved when the server refuses the batch, and asks for a new check", async () => {
    const user = setup();
    await fill(user, "101 78");
    await check(user);
    put.mockRejectedValue(new ApiError(409, "Nothing was saved.", "HALL_MARKS_REJECTED"));
    await user.click(await screen.findByRole("button", { name: "Save 2 marks" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was saved");
    expect(screen.getByLabelText("Index numbers and marks")).toHaveValue("101 78");
    expect(screen.queryByText("Nimal")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the server's message for other failures and keeps the list", async () => {
    put.mockRejectedValue(new ApiError(409, "Results are already published.", "RESULTS_ALREADY_PUBLISHED"));
    const user = setup();
    await fill(user, "101 78");
    await check(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Results are already published.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Check marks" })).toBeEnabled());
  });

  it("never shows a name when the server sends none (a marker)", async () => {
    put.mockResolvedValue(withProblem());
    const user = setup();
    await fill(user, "101 78\n999 64");
    await check(user);
    await screen.findByText("#101");
    expect(screen.queryByText("Nimal")).not.toBeInTheDocument();
  });
});
