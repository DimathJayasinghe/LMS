import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubjectManager } from "./SubjectManager";
import { ApiError } from "@/lib/api";
import type { Subject } from "@/lib/types";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const { post, patch } = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post, patch, get: vi.fn(), del: vi.fn() } };
});

const subjects: Subject[] = [
  {
    id: "1",
    name: "Physics",
    description: "Mechanics & waves",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  { id: "2", name: "Retired Maths", description: null, isActive: false, createdAt: "", updatedAt: "" },
];

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  post.mockReset().mockResolvedValue(undefined);
  patch.mockReset().mockResolvedValue(undefined);
});

describe("SubjectManager — status filter", () => {
  it("defaults to Active: shows active rows, hides inactive", () => {
    render(<SubjectManager subjects={subjects} search="" />);
    expect(screen.getByText("Physics")).toBeInTheDocument();
    expect(screen.queryByText("Retired Maths")).not.toBeInTheDocument();
  });

  it("Inactive shows only inactive; All shows both", async () => {
    const user = userEvent.setup();
    render(<SubjectManager subjects={subjects} search="" />);

    await user.click(screen.getByRole("button", { name: "inactive" }));
    expect(screen.getByText("Retired Maths")).toBeInTheDocument();
    expect(screen.queryByText("Physics")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "all" }));
    expect(screen.getByText("Physics")).toBeInTheDocument();
    expect(screen.getByText("Retired Maths")).toBeInTheDocument();
  });
});

describe("SubjectManager — create", () => {
  it("gates the submit until name has >= 2 chars", async () => {
    const user = userEvent.setup();
    render(<SubjectManager subjects={subjects} search="" />);

    await user.click(screen.getByRole("button", { name: "New subject" }));
    const submit = screen.getByRole("button", { name: "Create subject" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "C");
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "hemistry");
    expect(submit).toBeEnabled();
  });

  it("POSTs trimmed values (empty description → undefined) and refreshes", async () => {
    const user = userEvent.setup();
    render(<SubjectManager subjects={subjects} search="" />);

    await user.click(screen.getByRole("button", { name: "New subject" }));
    await user.type(screen.getByLabelText("Name"), "  Chemistry  ");
    await user.click(screen.getByRole("button", { name: "Create subject" }));

    expect(post).toHaveBeenCalledWith("/subjects", {
      name: "Chemistry",
      description: undefined,
      isActive: true,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("maps a 409 to inline error text and keeps the form open", async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, "Subject already exists", "SUBJECT_ALREADY_EXISTS"),
    );
    const user = userEvent.setup();
    render(<SubjectManager subjects={subjects} search="" />);

    await user.click(screen.getByRole("button", { name: "New subject" }));
    await user.type(screen.getByLabelText("Name"), "Physics");
    await user.click(screen.getByRole("button", { name: "Create subject" }));

    expect(await screen.findByText("Subject already exists")).toBeInTheDocument();
    // Form is still open (its submit button is still present).
    expect(screen.getByRole("button", { name: "Create subject" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("SubjectManager — edit / deactivate / mutual exclusivity", () => {
  it("opening a row edit collapses the create form", async () => {
    const user = userEvent.setup();
    render(<SubjectManager subjects={subjects} search="" />);

    await user.click(screen.getByRole("button", { name: "New subject" }));
    expect(screen.getByRole("button", { name: "Create subject" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Physics" }));
    expect(screen.queryByRole("button", { name: "Create subject" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Subject name")).toHaveValue("Physics");
  });

  it("deactivate PATCHes isActive:false for that row", async () => {
    const user = userEvent.setup();
    render(<SubjectManager subjects={subjects} search="" />);

    const row = screen.getByText("Physics").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Deactivate" }));

    expect(patch).toHaveBeenCalledWith("/subjects/1", { isActive: false });
    expect(refresh).toHaveBeenCalled();
  });
});

describe("SubjectManager — empty states", () => {
  it("shows the first-run empty state when there are no subjects and no search", () => {
    render(<SubjectManager subjects={[]} search="" />);
    expect(screen.getByText("No subjects yet. Create the first one.")).toBeInTheDocument();
  });

  it("shows a search-specific empty state when a search returns nothing", () => {
    render(<SubjectManager subjects={[]} search="zzz" />);
    expect(screen.getByText("No subjects match your search.")).toBeInTheDocument();
  });
});
