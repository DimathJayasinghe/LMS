import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffEnrollPanel } from "./StaffEnrollPanel";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/api", () => ({
  api: { get: mocks.get, post: mocks.post },
  ApiError: class ApiError extends Error {},
}));

const nimal = { id: "u1", name: "Nimal Perera", indexNumber: 42, profileImage: null };
const course = { id: "c1", name: "A/L Physics", monthlyFee: "2500.00" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: [nimal], count: 1 });
  mocks.post.mockResolvedValue({ data: { id: "e1" } });
});

async function findNimal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Search student"), "Nimal");
  // The lookup waits for a pause in typing, so allow for that under a loaded test run.
  return screen.findByRole("button", { name: /Nimal Perera/ }, { timeout: 3000 });
}

describe("StaffEnrollPanel", () => {
  it("shows the fee and no enrol action until a student is chosen", () => {
    render(<StaffEnrollPanel course={course} />);
    expect(screen.getByText(/2,500/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finds a student, enrols them in this class and refreshes the page", async () => {
    const user = userEvent.setup();
    render(<StaffEnrollPanel course={course} />);

    await user.click(await findNimal(user));
    expect(mocks.get).toHaveBeenCalledWith("/users/lookup?q=Nimal");
    await user.click(await screen.findByRole("button", { name: /enrol student/i }));

    expect(mocks.post).toHaveBeenCalledWith("/enrollments", { userId: "u1", courseId: "c1", classType: "PHYSICAL" });
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(await screen.findByText(/Nimal Perera is enrolled/i)).toBeInTheDocument();
  });

  it("does not refresh or claim success when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(<StaffEnrollPanel course={course} />);

    await user.click(await findNimal(user));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/is enrolled/i)).not.toBeInTheDocument();
  });
});
